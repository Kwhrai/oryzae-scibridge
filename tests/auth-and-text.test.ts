import { describe, expect, it } from "vitest";
import { hostedDomainFromIdToken, isAllowedWorkspaceUser } from "@/lib/auth/domain";
import { googleIdClaimsAllowed } from "@/lib/auth/google";
import { derToPem, signRs256Jwt, verifyRs256Jwt } from "@/lib/auth/jwt";
import { readSession, signSession } from "@/lib/auth/session-cookie";
import { authBypassEnabled, mockModeEnabled, normalizePrivateKey } from "@/lib/config";
import { extractDoi, extractPmid } from "@/lib/papers/doi";
import { queryTokens, snippetAround } from "@/lib/papers/text";
import { cosineSimilarity, hashEmbedding, keywordScore, mergeScores } from "@/lib/papers/rank";
import { normalizeExtraction, parseModelJson } from "@/lib/papers/model-json";
import { workToDraft, unpaywallPdfUrl } from "@/lib/metadata/crossref";
import { planDriveFile } from "@/lib/drive/match";
import { escapeDriveQuery, sanitizeFilename } from "@/lib/drive/filename";

describe("workspace access", () => {
  const domain = "oryzae.site";

  it("accepts a verified Workspace user on the company domain", () => {
    expect(isAllowedWorkspaceUser({
      email: "Ai.Kawahara@oryzae.site",
      hd: "oryzae.site",
      emailVerified: true,
      domain,
    })).toBe(true);
  });

  it("rejects other domains, unverified mail, and a missing hosted-domain claim", () => {
    expect(isAllowedWorkspaceUser({ email: "a@gmail.com", hd: "gmail.com", emailVerified: true, domain })).toBe(false);
    expect(isAllowedWorkspaceUser({ email: "a@oryzae.site", hd: "oryzae.site", emailVerified: false, domain })).toBe(false);
    expect(isAllowedWorkspaceUser({ email: "a@oryzae.site", hd: "", emailVerified: true, domain })).toBe(false);
    expect(isAllowedWorkspaceUser({ email: "a@oryzae.site.evil.com", hd: "oryzae.site", emailVerified: true, domain })).toBe(false);
  });

  it("reads hd from an id token payload without treating the hint as enough", () => {
    const payload = Buffer.from(JSON.stringify({ hd: "oryzae.site", email: "a@oryzae.site" })).toString("base64url");
    expect(hostedDomainFromIdToken(`x.${payload}.y`)).toBe("oryzae.site");
  });

  it("accepts a signed session cookie only for the company domain", async () => {
    const token = await signSession({ email: "ai@oryzae.site", name: "Ai", hd: "oryzae.site" }, "secret", 1_000);
    const session = await readSession(token, "secret", { now: 1_000, domain: "oryzae.site" });
    expect(session?.email).toBe("ai@oryzae.site");
    expect(await readSession(token, "other-secret", { now: 1_000, domain: "oryzae.site" })).toBeNull();
    expect(await readSession(token, "secret", { now: 1_000, domain: "example.com" })).toBeNull();
  });

  it("checks Google ID token claims and can sign a service-account JWT", async () => {
    expect(googleIdClaimsAllowed({
      iss: "https://accounts.google.com",
      aud: "client",
      exp: 2_000,
      email: "ai@oryzae.site",
      email_verified: true,
      hd: "oryzae.site",
    }, "client", "oryzae.site", 1_000)).toBe(true);
    expect(googleIdClaimsAllowed({
      iss: "https://accounts.google.com",
      aud: "client",
      exp: 2_000,
      email: "ai@gmail.com",
      email_verified: true,
      hd: "gmail.com",
    }, "client", "oryzae.site", 1_000)).toBe(false);

    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const pem = derToPem(await crypto.subtle.exportKey("pkcs8", pair.privateKey), "PRIVATE KEY");
    const jwt = await signRs256Jwt(pem, { iss: "drive@oryzae.site" });
    const verified = await verifyRs256Jwt(jwt, pair.publicKey);
    expect(verified?.iss).toBe("drive@oryzae.site");
  });

  it("never enables the dev bypass in production", () => {
    expect(authBypassEnabled({ NODE_ENV: "production", AUTH_DISABLED: "true" })).toBe(false);
    expect(mockModeEnabled({ NODE_ENV: "production", SCI_BRIDGE_MOCK: "1" })).toBe(false);
    expect(mockModeEnabled({ NODE_ENV: "development", VERCEL_ENV: "production", SCI_BRIDGE_MOCK: "1" })).toBe(false);
    expect(authBypassEnabled({ NODE_ENV: "development", AUTH_DISABLED: "true" })).toBe(true);
  });
});

describe("recall helpers", () => {
  it("pulls a DOI out of a pasted citation and ignores a bare boolean", () => {
    expect(extractDoi("Kurahashi 2021 https://doi.org/10.3390/jof7090782.")).toBe("10.3390/jof7090782");
    expect(extractDoi("TRUE")).toBeNull();
    expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/3456789/")).toBe("3456789");
  });

  it("keeps the meaningful words from a vague Japanese memory", () => {
    expect(queryTokens("あの排便の甘酒の論文あったっけ")).toEqual(["排便", "甘酒"]);
    const snippet = snippetAround("Intake of Koji Amazake Improves Defecation ／ 麹甘酒の排便頻度", ["排便"], 18);
    expect(snippet).toBe("…麹甘酒の排便頻度");
    expect(queryTokens("thermostable alpha amylase")).toContain("thermostable");
  });

  it("ranks shared wording above an unrelated paper and blends vector hits", () => {
    const hay = "麹甘酒の摂取は排便頻度を改善する";
    expect(keywordScore(["排便", "甘酒"], "排便 甘酒", hay)).toBeGreaterThan(keywordScore(["排便", "甘酒"], "排便 甘酒", "小麦パンの老化"));
    const merged = mergeScores([{ id: "a", score: 1 }], [{ id: "b", score: 0.9 }, { id: "a", score: 0.4 }]);
    expect(merged.map((item) => item.id)).toContain("b");
    const related = hashEmbedding("甘酒 排便 腸内");
    const close = hashEmbedding("甘酒は排便と腸内環境を変える");
    const far = hashEmbedding("鉄筋コンクリートの施工");
    expect(cosineSimilarity(related, close)).toBeGreaterThan(cosineSimilarity(related, far));
  });

  it("normalizes model JSON and Crossref records", () => {
    const parsed = normalizeExtraction(parseModelJson("```json\n{\"title\":\"麹\",\"year\":\"2020\",\"doi\":\"https://doi.org/10.1000/abc\"}\n```"));
    expect(parsed.title).toBe("麹");
    expect(parsed.year).toBe(2020);
    expect(parsed.doi).toBe("https://doi.org/10.1000/abc");
    const draft = workToDraft({
      title: ["Koji <i>Amazake</i>"],
      author: [{ family: "Kurahashi", given: "A" }],
      "container-title": ["Journal of Fungi"],
      issued: { "date-parts": [[2021]] },
      DOI: "10.3390/jof7090782",
      abstract: "<jats:p>Defecation improved.</jats:p>",
    });
    expect(draft.title).toBe("Koji Amazake");
    expect(draft.authors).toBe("Kurahashi A");
    expect(draft.year).toBe(2021);
    expect(draft.abstract).toBe("Defecation improved.");
    expect(unpaywallPdfUrl({ best_oa_location: { url_for_pdf: "https://example.com/a.pdf" } })).toBe("https://example.com/a.pdf");
  });
});

describe("drive planning", () => {
  const papers = [
    { id: "csv-3", title: "Intake of Koji Amazake ／ 麹甘酒", doi: "10.3390/jof7090782", driveFileId: null },
    { id: "csv-7", title: "Genome sequencing and analysis of Aspergillus oryzae ／ 食品関連菌", doi: "10.1038/nature04300", driveFileId: "already" },
  ];

  it("attaches a new file when the PDF text contains a known DOI", () => {
    expect(planDriveFile({ id: "new", name: "scan.pdf", text: "see 10.3390/jof7090782" }, papers)).toEqual({ action: "attach", id: "csv-3" });
  });

  it("does not create a second copy of a DOI that is already linked", () => {
    expect(planDriveFile({ id: "other", name: "nature.pdf", text: "10.1038/nature04300" }, papers)).toEqual({ action: "skip" });
  });

  it("matches a dropped file by a long title and keeps drive queries quoted", () => {
    expect(planDriveFile({
      id: "file",
      name: "Intake of Koji Amazake improves defecation.pdf",
      text: "",
    }, papers).action).toBe("attach");
    expect(escapeDriveQuery("a'b\\c")).toBe("a\\'b\\\\c");
    expect(sanitizeFilename("bad/name?.pdf")).toBe("bad name .pdf");
    expect(normalizePrivateKey('"line1\\nline2\\n"')).toBe("line1\nline2\n");
  });
});
