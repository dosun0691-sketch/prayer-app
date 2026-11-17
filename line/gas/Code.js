/**
 * 阿坤 — LINE 단톡방에서 누가 「結果」(또는 결과/结果)라고 치면 기도 달성표 결과를 답한다.
 * 답장(reply) 메시지는 LINE 무료 — 매일 자동 발송은 하지 않는다.
 * 기도 하루 = 시작일 오후 6시 ~ 다음날 오전 10시 (앱과 같은 규칙, 대만 시간).
 * 阿坤 채널 ID·시크릿은 Secrets.js(git 제외)의 SECRETS 에 둔다.
 */
var PROJECT = "ourfamily-prayer-11060015";
var APP_URL = "https://ourfamily-prayer-11060015.web.app/";
var FS = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents";
var KEYWORD = /^\s*(結果|结果|결과)\s*$/;
var QR_WORD = /^\s*(QR|qr|ＱＲ|QR碼|QR码|二維碼|二维码|큐알|QR코드)\s*$/;
var QR_IMG = APP_URL + "qr-card.png";   // 새 앱(1.0.3) QR 안내 그림
var QR_TEXT = "新版App 1.0.3 🙏 用手機相機掃描下面的QR碼安裝。已經安裝的人，刪除舊App後重新安裝就會換新圖示（紀錄保留）。\n새 앱 1.0.3 — QR코드를 찍어 설치하세요. 이미 설치한 분은 지우고 다시 설치하면 새 그림이 됩니다 (기록은 그대로).";

// BEST 앱 QR (교회 열쇠가 들어 있음) — 등록된 동역자 방에서만 답한다 (목사님 지시 2026-11-17)
// 동역자 방에서 한 번: 「同工登記 <코드>」 (코드는 Secrets.js 의 BEST_REG) → 그 방만 등록. 이후 「BEST」 치면 QR 답장.
var BEST_WORD = /^\s*(BEST|best|Best|ＢＥＳＴ)\s*(QR|qr|ＱＲ)?\s*$/;
var BEST_REG_WORD = /^\s*同工登記\s+(\S+)\s*$/;
var BEST_TEXT = "BEST 關懷 App（同工專用）🙏 用手機相機掃描下面的QR碼安裝，不需要登入。請不要轉傳到其他群組。\nBEST 돌봄 앱 (동역자 전용) — QR코드를 찍어 설치하세요. 로그인은 필요 없습니다. 다른 방에는 올리지 말아 주세요.";
function roomKey_(ev) { return "bestRoom_" + ((ev.source && (ev.source.groupId || ev.source.roomId)) || "none"); }
function bestMsgs_() { return [{ type: "text", text: BEST_TEXT }, { type: "image", originalContentUrl: SECRETS.BEST_QR, previewImageUrl: SECRETS.BEST_QR }]; }

function doPost(e) {
  var body = JSON.parse(e.postData.contents || "{}");
  (body.events || []).forEach(function (ev) {
    if (!ev.replyToken) return;
    var txt = (ev.type === "message" && ev.message && ev.message.type === "text") ? ev.message.text : null;
    if (txt !== null && BEST_REG_WORD.test(txt)) {
      var m = txt.match(BEST_REG_WORD), inRoom = ev.source && (ev.source.groupId || ev.source.roomId);
      if (inRoom && m[1] === SECRETS.BEST_REG) {
        PropertiesService.getScriptProperties().setProperty(roomKey_(ev), new Date().toISOString());
        replyMsgs_(ev.replyToken, [{ type: "text", text: "✅ 這個群組已登記為同工群組。以後輸入「BEST」就會收到 BEST 關懷 App 的 QR 碼。\n✅ 이 방을 동역자 방으로 등록했습니다. 앞으로 「BEST」라고 치면 QR을 보내 드립니다." }].concat(bestMsgs_()));
      }
      return;   // wrong code or 1:1 chat: stay silent
    }
    if (txt !== null && BEST_WORD.test(txt)) {
      if (PropertiesService.getScriptProperties().getProperty(roomKey_(ev))) replyMsgs_(ev.replyToken, bestMsgs_());
      return;   // not a registered 同工 room: stay silent
    }
    if (ev.type === "join") {
      reply_(ev.replyToken, "大家好！我是阿坤 🙏\n想知道禱告達成表的結果，請輸入「結果」。");
    } else if (ev.type === "message" && ev.message && ev.message.type === "text" && QR_WORD.test(ev.message.text)) {
      replyMsgs_(ev.replyToken, [{ type: "text", text: QR_TEXT }, qrImage_()]);
    } else if (ev.type === "message" && ev.message && ev.message.type === "text" && KEYWORD.test(ev.message.text)) {
      var msgs = [{ type: "text", text: report_(new Date()).slice(0, 5000) }];
      // 새 QR 안내는 각 단톡방에 한 번만 붙인다 (답장이라 무료)
      var key = "qrSent_v103_" + ((ev.source && (ev.source.groupId || ev.source.roomId || ev.source.userId)) || "x");
      var props = PropertiesService.getScriptProperties();
      if (!props.getProperty(key)) { msgs.push({ type: "text", text: QR_TEXT }, qrImage_()); props.setProperty(key, new Date().toISOString()); }
      replyMsgs_(ev.replyToken, msgs);
    }
  });
  return ContentService.createTextOutput("ok");
}

function doGet() { return ContentService.createTextOutput("阿坤 ok"); }

// 채널 ID·시크릿으로 15분짜리 토큰을 그때그때 받는다 (만료 걱정 없음)
function accessToken_() {
  // SECRETS 는 git 에 올리지 않는 Secrets.js 에 있다
  var r = UrlFetchApp.fetch("https://api.line.me/oauth2/v3/token", {
    method: "post", payload: { grant_type: "client_credentials", client_id: SECRETS.CHANNEL_ID, client_secret: SECRETS.CHANNEL_SECRET }
  });
  return JSON.parse(r.getContentText()).access_token;
}

function qrImage_() { return { type: "image", originalContentUrl: QR_IMG, previewImageUrl: QR_IMG }; }

function replyMsgs_(token, messages) {
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + accessToken_() },
    payload: JSON.stringify({ replyToken: token, messages: messages })
  });
}

function reply_(token, text) {
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + accessToken_() },
    payload: JSON.stringify({ replyToken: token, messages: [{ type: "text", text: text.slice(0, 5000) }] })
  });
}

function val_(f) { return f.stringValue !== undefined ? f.stringValue : f.integerValue !== undefined ? f.integerValue : f.doubleValue; }

function members_() {
  var out = [], tok = "";
  do {
    var d = JSON.parse(UrlFetchApp.fetch(FS + "/members?pageSize=300" + (tok ? "&pageToken=" + tok : "")).getContentText());
    (d.documents || []).forEach(function (doc) {
      var f = doc.fields;
      if (f.left && f.left.booleanValue === true) return;  // 탈퇴한 회원 제외 (2026-11-16)
      out.push({ id: doc.name.split("/").pop(), name: String(val_(f.name)), goal: +val_(f.goal) || 0,
        goalSat: f.goalSat ? +val_(f.goalSat) || 0 : 0, goalSun: f.goalSun ? +val_(f.goalSun) || 0 : 0,
        joined: f.joined ? String(val_(f.joined)) : "" });
    });
    tok = d.nextPageToken || "";
  } while (tok);
  return out;
}

function entries_(date) {
  var q = { structuredQuery: { from: [{ collectionId: "entries" }],
    where: { fieldFilter: { field: { fieldPath: "date" }, op: "EQUAL", value: { stringValue: date } } } } };
  var rows = JSON.parse(UrlFetchApp.fetch(FS + ":runQuery", { method: "post", contentType: "application/json", payload: JSON.stringify(q) }).getContentText());
  var out = {};
  rows.forEach(function (r) { if (r.document) out[String(val_(r.document.fields.member))] = +val_(r.document.fields.minutes) || 0; });
  return out;
}

function fmt_(m) { var h = Math.floor(m / 60), r = m % 60; return h ? h + "小時" + (r ? r + "分" : "") : r + "分"; }

function report_(now) {
  // 대만 시간(UTC+8)에서 18시간을 빼면 기도 하루의 날짜가 된다
  var t = new Date(now.getTime() + 8 * 3600000 - 18 * 3600000);
  var y = t.getUTCFullYear(), mo = t.getUTCMonth(), da = t.getUTCDate();
  var day = Utilities.formatString("%04d-%02d-%02d", y, mo + 1, da);
  var end = new Date(Date.UTC(y, mo, da + 1));
  var ms = members_(), es = entries_(day);
  // 14일 동안 기록이 없으면 제외 (앱과 같은 규칙, 2026-11-16): 최근 14 기도일에 기록 있음 또는 그 안에 등록
  var cut = new Date(Date.UTC(y, mo, da - 13)), cutoff = Utilities.formatString("%04d-%02d-%02d", cut.getUTCFullYear(), cut.getUTCMonth() + 1, cut.getUTCDate());
  var rq = { structuredQuery: { from: [{ collectionId: "entries" }],
    where: { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: cutoff } } } } };
  var recent = {};
  JSON.parse(UrlFetchApp.fetch(FS + ":runQuery", { method: "post", contentType: "application/json", payload: JSON.stringify(rq) }).getContentText())
    .forEach(function (r) { if (r.document) recent[String(val_(r.document.fields.member))] = true; });
  ms = ms.filter(function (m) { return recent[m.id] || (m.joined && m.joined >= cutoff); });
  // 요일별 목표 (기도 하루가 끝나는 날=당일 기준: 토 → goalSat, 일 → goalSun, 그 밖 → goal) — 목사님 지시 2026-11-16
  var w = end.getUTCDay();
  var rows = ms.map(function (m) { return { n: m.name, mins: es[m.id] || 0, g: (w === 6 ? m.goalSat : w === 0 ? m.goalSun : 0) || m.goal }; })
    .sort(function (a, b) { return (b.g ? b.mins / b.g : 0) - (a.g ? a.mins / a.g : 0) || (a.n < b.n ? -1 : 1); });
  var tm = 0, tg = 0, done = 0;
  rows.forEach(function (r) { tm += r.mins; tg += r.g; if (r.g && r.mins >= r.g) done++; });
  var pct = tg ? Math.round(tm / tg * 100) : 0;
  var lines = ["🙏 禱告達成表 " + (mo + 1) + "/" + da + " 下午6點～" + (end.getUTCMonth() + 1) + "/" + end.getUTCDate() + " 上午10點",
    "全體達成率 " + pct + "%（" + fmt_(tm) + " / " + fmt_(tg) + "）",
    "達成目標 " + done + " 人 / 全體 " + rows.length + " 人", ""];
  rows.forEach(function (r) {
    var p = r.g ? Math.round(r.mins / r.g * 100) : 0;
    lines.push((p >= 100 ? "⭐" : "・") + r.n + "  " + fmt_(r.mins) + " / " + fmt_(r.g) + "  " + p + "%");
  });
  lines.push("", "「你們祈求，就給你們。」馬太福音 7:7", "記錄禱告時間 👉 " + APP_URL);
  return lines.join("\n");
}

/** 편집기에서 실행해 결과 문구를 미리 보는 용도 */
function testReport() { Logger.log(report_(new Date())); }
