/**
 * ORYZAE SciBridge の Drive 窓口。
 *
 * script.google.com でこのプロジェクトを作り、デプロイは
 * 「ウェブアプリ / 実行ユーザー: 自分 / アクセスできるユーザー: 全員」にする。
 * Cloud Console もサービスアカウントも使わない。共有ドライブは、
 * このスクリプトをデプロイした本人が見られる範囲だけ触る。
 *
 * スクリプトプロパティ:
 *   APPS_SCRIPT_SECRET  必須。Worker と同じ長いランダム文字列
 *   GEMINI_API_KEY      任意。AI Studio のキー。無いときは文書変換でテキストだけ取る
 *   GEMINI_MODEL        任意。既定は gemini-2.5-flash
 *
 * 制限（2026-09 時点の公開クォータ。変更されるので公式を見る）:
 *   https://developers.google.com/apps-script/guides/services/quotas
 *   実行 6 分。UrlFetch の POST と応答は各 50MB。URL は 2KB。
 *   UrlFetch はコンシューマ 2万回/日、Workspace 10万回/日（ユーザー単位）。
 *   ウェブアプリは独自ヘッダーを読めない。秘密はクエリで受け、定数時間で比べる。
 *   /exec への POST は 302 で本文が落ちる。Worker はリダイレクト先へ送る。
 */
var ROOT_FOLDER_ID = "1f8kMQgoqvp9H0IIwzD6BAZ2-vcqIHHun";
var PDF_LIMIT = 20 * 1024 * 1024;

function doGet(e) {
  return dispatch(e, "");
}

function doPost(e) {
  var body = e && e.postData && e.postData.contents ? e.postData.contents : "";
  return dispatch(e, body);
}

function dispatch(e, body) {
  try {
    var params = (e && e.parameter) || {};
    assertSecret(String(params.secret || ""));
    var action = String(params.action || "ping");
    if (action === "ping") return json({ ok: true });
    if (action === "list") return json({ ok: true, files: listPdfs(String(params.folderId || ROOT_FOLDER_ID), "") });
    if (action === "ingest") return json({ ok: true, result: ingest(String(params.fileId || "")) });
    if (action === "upload") return json({ ok: true, result: upload(String(params.name || "paper.pdf"), String(params.category || ""), body) });
    if (action === "importUrl") return json({ ok: true, result: importUrl(String(params.url || ""), String(params.category || "")) });
    return json({ ok: false, error: "不明な操作です" });
  } catch (error) {
    return json({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function assertSecret(given) {
  var expected = PropertiesService.getScriptProperties().getProperty("APPS_SCRIPT_SECRET") || "";
  var length = Math.max(expected.length, given.length);
  var diff = expected.length ^ given.length;
  for (var index = 0; index < length; index += 1) {
    var left = index < expected.length ? expected.charCodeAt(index) : 0;
    var right = index < given.length ? given.charCodeAt(index) : 0;
    diff |= left ^ right;
  }
  if (diff !== 0 || !expected) throw new Error("認証できません");
}

function listPdfs(folderId, parentName) {
  var folder = DriveApp.getFolderById(folderId);
  var found = [];
  var files = folder.getFilesByType(MimeType.PDF);
  while (files.hasNext()) {
    var file = files.next();
    found.push({
      id: file.getId(),
      name: file.getName(),
      parentId: folderId,
      parentName: parentName,
      webViewLink: file.getUrl(),
      size: file.getSize(),
    });
  }
  var children = folder.getFolders();
  while (children.hasNext()) {
    var child = children.next();
    found = found.concat(listPdfs(child.getId(), child.getName()));
  }
  return found;
}

function ingest(fileId) {
  if (!fileId) throw new Error("ファイルIDがありません");
  var file = DriveApp.getFileById(fileId);
  var parents = file.getParents();
  var category = parents.hasNext() ? parents.next().getName() : "";
  return describe(file, category);
}

function upload(name, category, body) {
  var cleaned = String(body || "").replace(/\s+/g, "");
  if (!cleaned) throw new Error("PDFがありません");
  var bytes = Utilities.base64Decode(cleaned);
  if (bytes.length > PDF_LIMIT) throw new Error("PDFは20MBまでです");
  var folder = categoryFolder(category);
  var file = folder.createFile(Utilities.newBlob(bytes, "application/pdf", name || "paper.pdf"));
  return describe(file, category);
}

function importUrl(url, category) {
  if (!url || url.indexOf("https://") !== 0) throw new Error("PDFのURLがありません");
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() >= 400) throw new Error("PDFを取得できませんでした");
  var blob = response.getBlob();
  if (blob.getBytes().length > PDF_LIMIT) throw new Error("PDFは20MBまでです");
  var file = categoryFolder(category).createFile(blob.setName("paper.pdf").setContentType("application/pdf"));
  return describe(file, category);
}

function categoryFolder(category) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var name = String(category || "").trim() || "未分類";
  var matches = root.getFoldersByName(name);
  if (matches.hasNext()) return matches.next();
  return root.createFolder(name);
}

function describe(file, category) {
  var read = readPaper(file);
  return {
    driveFileId: file.getId(),
    driveUrl: file.getUrl(),
    category: category || "",
    name: file.getName(),
    size: file.getSize(),
    extraction: read.extraction,
    plainText: read.plainText,
  };
}

function readPaper(file) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty("GEMINI_API_KEY") || "";
  if (key) {
    try {
      return { extraction: geminiPdf(file, key, props.getProperty("GEMINI_MODEL") || "gemini-2.5-flash"), plainText: "" };
    } catch (error) {
      return { extraction: null, plainText: String(error && error.message ? error.message : error).slice(0, 500) };
    }
  }
  return { extraction: null, plainText: docText(file.getId()) };
}

function geminiPdf(file, key, model) {
  var response = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "post",
    contentType: "application/json",
    headers: { "x-goog-api-key": key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: pdfPrompt(file.getName()) },
          { inline_data: { mime_type: "application/pdf", data: Utilities.base64Encode(file.getBlob().getBytes()) } },
        ],
      }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (response.getResponseCode() >= 400) throw new Error("Gemini がPDFを読めませんでした (" + response.getResponseCode() + ")");
  var payload = JSON.parse(response.getContentText());
  var parts = payload.candidates && payload.candidates[0] && payload.candidates[0].content && payload.candidates[0].content.parts || [];
  var text = parts.map(function (part) { return part.text || ""; }).join("");
  var parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  parsed.summary = String(parsed.summary || "").slice(0, 800);
  parsed.bodyText = String(parsed.bodyText || "").slice(0, 4000);
  return parsed;
}

function pdfPrompt(filename) {
  return [
    "あなたは米麹・麹菌・甘酒を扱う食品R&Dの司書です。添付PDFを読み、JSONだけを返してください。",
    "PDFに無い項目は空文字、year は null。推測で埋めない。",
    "フィールド: title, authors, year, journal, doi, abstract, category, background, objective, methods, results, discussion, summary, bodyText",
    "summary は意味検索用の日本語要約。800字以内。固有名詞と数値を残す。",
    "bodyText はキーワード検索用の抜粋。4000字以内。全文は書き写さない。",
    "background, objective, methods, results, discussion は日本語で各200字程度。",
    "doi は 10.xxxx/xxxx だけ。無ければ空文字。",
    "ファイル名: " + filename,
  ].join("\n");
}

function docText(fileId) {
  if (typeof Drive === "undefined" || !Drive.Files || typeof DocumentApp === "undefined") return "";
  var copyId = "";
  try {
    var copied = Drive.Files.copy({ title: "scibridge-temp", mimeType: "application/vnd.google-apps.document" }, fileId);
    copyId = copied.id;
    return DocumentApp.openById(copyId).getBody().getText().slice(0, 4000);
  } catch (error) {
    return "";
  } finally {
    if (copyId) {
      try { Drive.Files.remove(copyId); } catch (ignore) {}
    }
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
