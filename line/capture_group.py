"""설치 때 한 번만 쓰는 임시 웹훅: 阿坤이 단톡방에 초대되면 groupId 를 받아 group_id.txt 에 저장한다.
환경변수 LINE_SECRET(채널 시크릿), LINE_TOKEN(채널 액세스 토큰). 포트 8787.
"""
import base64, hashlib, hmac, json, os, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ["LINE_SECRET"].encode()
TOKEN = os.environ["LINE_TOKEN"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "group_id.txt")


def reply(tok, text):
    body = json.dumps({"replyToken": tok, "messages": [{"type": "text", "text": text}]}).encode()
    req = urllib.request.Request("https://api.line.me/v2/bot/message/reply", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"})
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:
        print("reply fail", e, flush=True)


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        sig = base64.b64encode(hmac.new(SECRET, raw, hashlib.sha256).digest()).decode()
        self.send_response(200); self.end_headers()
        if not hmac.compare_digest(sig, self.headers.get("x-line-signature", "")):
            print("bad signature", flush=True); return
        for ev in json.loads(raw).get("events", []):
            src = ev.get("source", {})
            print("event", ev.get("type"), src.get("type"), src.get("groupId", ""), flush=True)
            if src.get("type") == "group" and src.get("groupId"):
                open(OUT, "w").write(src["groupId"])
                if ev.get("type") == "join" and ev.get("replyToken"):
                    reply(ev["replyToken"], "大家好！我是阿坤 🙏\n每天上午10點會在這裡告訴大家禱告達成表的結果。")

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", 8787), H).serve_forever()
