"""阿坤 — 매일 오전 10시(대만 시간) 기도 달성 결과를 LINE 단톡방에 보낸다.

기도 하루 = 시작일 오후 6시 ~ 다음날 오전 10시 (앱 index.html 과 같은 규칙).
오전 10시에 실행되면 방금 끝난 기간(어제 날짜)의 결과를 보낸다.

환경변수:
  LINE_TOKEN  — Messaging API 채널 액세스 토큰(장기)
  LINE_GROUP  — 단톡방 groupId (C로 시작)
  DRY_RUN=1   — 보내지 않고 화면에만 출력
"""
import datetime as dt
import json
import os
import sys
import urllib.request

PROJECT = "ourfamily-prayer-11060015"
APP_URL = "https://ourfamily-prayer-11060015.web.app/"
FS = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
TZ = dt.timezone(dt.timedelta(hours=8))  # 대만


def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def val(f):
    return f.get("stringValue", f.get("integerValue", f.get("doubleValue")))


def members():
    out, token = [], ""
    while True:
        d = get(f"{FS}/members?pageSize=300" + (f"&pageToken={token}" if token else ""))
        for doc in d.get("documents", []):
            f = doc["fields"]
            out.append({"id": doc["name"].rsplit("/", 1)[1], "name": str(val(f["name"])), "goal": int(val(f["goal"]) or 0)})
        token = d.get("nextPageToken")
        if not token:
            return out


def entries(date):
    q = {"structuredQuery": {"from": [{"collectionId": "entries"}],
                             "where": {"fieldFilter": {"field": {"fieldPath": "date"}, "op": "EQUAL", "value": {"stringValue": date}}}}}
    rows = get(f"{FS}:runQuery", json.dumps(q).encode(), {"Content-Type": "application/json"})
    out = {}
    for r in rows:
        if "document" in r:
            f = r["document"]["fields"]
            out[str(val(f["member"]))] = int(val(f["minutes"]) or 0)
    return out


def fmt(m):
    h, r = divmod(int(m), 60)
    return (f"{h}小時" + (f"{r}分" if r else "")) if h else f"{r}分"


def build(now):
    # 오후 6시 경계 — 앱과 같은 계산
    day = (now - dt.timedelta(hours=18)).date()
    end = day + dt.timedelta(days=1)
    ms, es = members(), entries(day.isoformat())
    rows = sorted(({"n": m["name"], "mins": es.get(m["id"], 0), "g": m["goal"]} for m in ms),
                  key=lambda r: (-(r["mins"] / r["g"] if r["g"] else 0), r["n"]))
    tot_m, tot_g = sum(r["mins"] for r in rows), sum(r["g"] for r in rows)
    pct = round(tot_m / tot_g * 100) if tot_g else 0
    done = sum(1 for r in rows if r["g"] and r["mins"] >= r["g"])
    lines = [f"🙏 禱告達成表 {day.month}/{day.day} 下午6點～{end.month}/{end.day} 上午10點",
             f"全體達成率 {pct}%（{fmt(tot_m)} / {fmt(tot_g)}）",
             f"達成目標 {done} 人 / 全體 {len(rows)} 人", ""]
    for r in rows:
        p = round(r["mins"] / r["g"] * 100) if r["g"] else 0
        lines.append(f"{'⭐' if p >= 100 else '・'}{r['n']}  {fmt(r['mins'])} / {fmt(r['g'])}  {p}%")
    lines += ["", "「你們祈求，就給你們。」馬太福音 7:7", f"記錄禱告時間 👉 {APP_URL}"]
    return "\n".join(lines)


def main():
    text = build(dt.datetime.now(TZ))
    if os.environ.get("DRY_RUN") == "1":
        print(text)
        return
    token, group = os.environ["LINE_TOKEN"], os.environ["LINE_GROUP"]
    body = json.dumps({"to": group, "messages": [{"type": "text", "text": text[:5000]}]}).encode()
    req = urllib.request.Request("https://api.line.me/v2/bot/message/push", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("sent", r.status)
    except urllib.error.HTTPError as e:
        print("LINE error", e.code, e.read().decode(), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
