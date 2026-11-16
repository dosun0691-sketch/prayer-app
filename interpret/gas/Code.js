/**
 * 我們家教會 설교 실시간 통역 — 번역 중계 (Google Apps Script 웹앱)
 * 목사님 화면(speak.html)이 한국어 한 문장을 보내면 Claude 로 대만식 번체 중국어로 번역해 돌려준다.
 * 비밀 값은 스크립트 속성(Project Settings → Script properties)에만 둔다:
 *   ANTHROPIC_API_KEY  — console.anthropic.com 에서 만든 API 키   (또는 Secrets.js 의 INTERP_ANTHROPIC_KEY)
 *   SPEAKER_PIN        — 목사님 화면에서 입력하는 숫자(다른 사람이 번역 요금을 쓰지 못하게) (또는 INTERP_PIN)
 * Apps Script 에는 공식 Anthropic SDK 가 없어 HTTP 로 직접 호출한다.
 */
var MODEL = "claude-sonnet-5-5";   // 목사님 선택 2026-11-16: 한→중 번역, 1시간 약 $1 이하 목표

var SYSTEM = [
  "You are the live interpreter for a Korean pastor preaching at 我們家教會, a Taiwanese church in Taichung.",
  "Input: one sentence of the sermon as recognised by speech-to-text in Korean (it may contain recognition mistakes).",
  "Output: ONLY the natural Traditional Chinese (Taiwan usage, 台灣華語) rendering of that sentence — no Korean, no notes, no quotes, no pinyin.",
  "Use 和合本 wording for Bible names, books and quotations (e.g. 耶穌, 聖靈, 恩典, 救恩, 禱告, 敬拜, 弟兄姊妹, 阿們, 哈利路亞).",
  "Say 主日 for Sunday worship, 牧師 for pastor, 小組 for small group, 門徒 for disciple.",
  "If a word looks like a speech-recognition error, translate the meaning the pastor most likely said; do not invent content.",
  "Keep the pastor's tone: warm, direct, spoken. If the input is only a filler (음, 어, 네) output an empty string."
].join("\n");

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { return json_({ ok: true, service: "interpret" }); }

function doPost(e) {
  var p = PropertiesService.getScriptProperties();
  // Secrets.js (git 제외, clasp 로만 올림) 의 값이 있으면 우선 사용 — 阿坤 봇과 같은 방식
  var KEY = (typeof INTERP_ANTHROPIC_KEY !== "undefined" && INTERP_ANTHROPIC_KEY) || p.getProperty("ANTHROPIC_API_KEY");
  var PIN = (typeof INTERP_PIN !== "undefined" && INTERP_PIN) || p.getProperty("SPEAKER_PIN") || "";
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: "bad_json" }); }
  if (!body || !PIN || String(body.pin || "") !== String(PIN)) return json_({ error: "bad_pin" });
  if (!KEY) return json_({ error: "no_key" });
  var text = String(body.text || "").trim().slice(0, 1500);
  if (!text) return json_({ zh: "" });
  var prev = (body.prev || []).slice(-2).map(function (s) { return String(s).slice(0, 400); });
  var user = (prev.length ? "Previous sentences (context only, do not translate):\n" + prev.join("\n") + "\n\n" : "") +
             "Translate this sentence:\n" + text;
  var req = {
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "between_tools" },     // plain translation: no reasoning pass (faster, cheaper); needs effort <= high
    output_config: { effort: "low" },        // live captions: speed over depth
    fallbacks: "default",                      // server-side refusal fallback (beta header below)
    system: SYSTEM,
    messages: [{ role: "user", content: user }]
  };
  var res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01"
    },
    payload: JSON.stringify(req)
  });
  var code = res.getResponseCode(), out;
  try { out = JSON.parse(res.getContentText()); } catch (err) { return json_({ error: "api_" + code }); }
  if (code !== 200) return json_({ error: "api_" + code, detail: (out.error && out.error.type) || "" });
  if (out.stop_reason === "refusal") return json_({ zh: "", refusal: true });
  var zh = (out.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("").trim();
  return json_({ zh: zh, model: out.model });
}
