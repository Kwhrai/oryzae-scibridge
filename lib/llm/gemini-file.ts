import { AppError } from "@/lib/app-error";
import { normalizeExtraction, parseModelJson, type ExtractedPaper } from "@/lib/papers/model-json";

const INLINE_MAX = 32 * 1024;

export type PdfSource = {
  filename: string;
  size: number;
  body: ReadableStream<Uint8Array> | null;
  bytes?: Uint8Array;
  categories?: string[];
};

function pdfPrompt(filename: string, categories?: string[]): string {
  const categoryHint = categories?.filter(Boolean).join("、") || "短い日本語の研究テーマ名";
  return [
    "あなたは米麹・麹菌・甘酒を扱う食品R&Dの司書です。添付PDFを読み、JSONだけを返してください。",
    "PDFに無い項目は空文字、year は null。推測で埋めない。",
    `category は可能なら次から選ぶ: ${categoryHint}`,
    "フィールド: title, authors, year, journal, doi, abstract, category, background, objective, methods, results, discussion, summary, bodyText",
    "summary は意味検索用の日本語要約。800字以内。固有名詞と数値を残す。",
    "bodyText はキーワード検索用の抜粋。4000字以内。全文は書き写さない。",
    "background, objective, methods, results, discussion は日本語で各200字程度。",
    "doi は 10.xxxx/xxxx だけ。無ければ空文字。",
    filename ? `ファイル名: ${filename}` : "",
  ].filter(Boolean).join("\n");
}

async function postJson(url: string, apiKey: string, body: unknown, fetchImpl: typeof fetch, extra?: HeadersInit): Promise<Response> {
  return fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey, ...extra },
    body: JSON.stringify(body),
  });
}

export async function readPdfFromGemini(input: PdfSource & { apiKey: string; model: string; fetchImpl?: typeof fetch }): Promise<ExtractedPaper> {
  const fetchImpl = input.fetchImpl ?? fetch;
  if (input.size > 20 * 1024 * 1024) {
    throw new AppError("PDFは20MBまでです。それより大きいファイルは共有ドライブに置いてから同期してください。", 413);
  }
  const filePart = input.body
    ? await streamedFilePart(input, fetchImpl)
    : inlineFilePart(input);
  const response = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
    input.apiKey,
    {
      contents: [{
        role: "user",
        parts: [
          { text: pdfPrompt(input.filename, input.categories) },
          filePart,
        ],
      }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    },
    fetchImpl,
  );
  if (!response.ok) throw new AppError(`Gemini がPDFを読めませんでした (${response.status})`, 502);
  const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new AppError("モデルから空の応答が返りました", 502);
  let extracted: ExtractedPaper;
  try {
    extracted = normalizeExtraction(parseModelJson(text));
  } catch {
    throw new AppError("モデルの応答を読み取れませんでした", 502);
  }
  if (!extracted.title) extracted.title = input.filename.replace(/\.pdf$/i, "") || "無題";
  return extracted;
}

async function streamedFilePart(input: PdfSource & { apiKey: string }, fetchImpl: typeof fetch) {
  const file = await uploadStream(input, fetchImpl);
  if (file.state && file.state !== "ACTIVE") await waitUntilActive(file.name, input.apiKey, fetchImpl);
  return { file_data: { mime_type: file.mimeType, file_uri: file.uri } };
}

function inlineFilePart(input: PdfSource) {
  if (!input.bytes || input.bytes.byteLength > INLINE_MAX) {
    throw new AppError("このPDFはストリームで送れませんでした。もう一度アップロードしてください。", 400);
  }
  let binary = "";
  for (const byte of input.bytes) binary += String.fromCharCode(byte);
  return { inline_data: { mime_type: "application/pdf", data: btoa(binary) } };
}

async function uploadStream(input: PdfSource & { apiKey: string }, fetchImpl: typeof fetch): Promise<{ name: string; uri: string; mimeType: string; state?: string }> {
  if (!input.body) throw new AppError("PDFの本文がありません", 400);
  if (!input.size) throw new AppError("PDFのサイズが分かりません。もう一度送ってください。", 400);
  const start = await fetchImpl("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": input.apiKey,
      "content-type": "application/json",
      "x-goog-upload-protocol": "resumable",
      "x-goog-upload-command": "start",
      "x-goog-upload-header-content-length": String(input.size),
      "x-goog-upload-header-content-type": "application/pdf",
    },
    body: JSON.stringify({ file: { display_name: input.filename } }),
  });
  if (!start.ok) throw new AppError(`Gemini へのアップロードを開始できませんでした (${start.status})`, 502);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new AppError("Gemini のアップロードURLがありません", 502);
  const uploaded = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      "content-length": String(input.size),
      "x-goog-upload-offset": "0",
      "x-goog-upload-command": "upload, finalize",
    },
    body: input.body,
    duplex: "half",
  } as RequestInit);
  if (!uploaded.ok) throw new AppError(`Gemini へのPDF送信に失敗しました (${uploaded.status})`, 502);
  const payload = await uploaded.json() as { file?: { name?: string; uri?: string; mimeType?: string; state?: string } };
  const file = payload.file;
  if (!file?.name || !file.uri) throw new AppError("Gemini がファイルを受け取れませんでした", 502);
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || "application/pdf", state: file.state };
}

async function waitUntilActive(name: string, apiKey: string, fetchImpl: typeof fetch): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!response.ok) throw new AppError("Gemini のファイル状態を確認できませんでした", 502);
    const payload = await response.json() as { state?: string };
    if (payload.state === "ACTIVE") return;
    if (payload.state === "FAILED") throw new AppError("Gemini がPDFを処理できませんでした", 502);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new AppError("Gemini のPDF処理が終わりませんでした", 502);
}
