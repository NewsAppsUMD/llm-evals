#!/usr/bin/env python3
"""Local server for the interview practice site.

Serves the static files, proxies LLM API calls to Anthropic and OpenAI,
and saves finished reports to sessions/.
Standard library only:  python server.py [--port 8000] [--no-browser]
"""

import argparse
import json
import re
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SESSIONS = ROOT / "sessions"

# Fixed allowlist: the proxy never forwards to any other host.
UPSTREAMS = {
    "anthropic": "https://api.anthropic.com/v1/messages",
    "openai": "https://api.openai.com/v1/chat/completions",
}
FORWARD_HEADERS = ("authorization", "x-api-key", "anthropic-version", "content-type")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length)

    def do_GET(self):
        if self.path == "/api/health":
            return self._json(200, {"ok": True, "mode": "local"})
        return super().do_GET()

    def do_POST(self):
        m = re.fullmatch(r"/api/proxy/(\w+)", self.path)
        if m:
            return self._proxy(m.group(1))
        if self.path == "/api/save":
            return self._save()
        self._json(404, {"error": "not found"})

    def _proxy(self, provider):
        url = UPSTREAMS.get(provider)
        if not url:
            return self._json(400, {"error": f"unknown provider {provider}"})
        headers = {h: self.headers[h] for h in FORWARD_HEADERS if self.headers.get(h)}
        req = urllib.request.Request(url, data=self._body(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                status, data = resp.status, resp.read()
        except urllib.error.HTTPError as e:
            status, data = e.code, e.read()
        except Exception as e:  # network failure, timeout
            return self._json(502, {"error": f"proxy error: {e}"})
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _save(self):
        try:
            payload = json.loads(self._body())
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid JSON"})
        slug = re.sub(r"[^a-z0-9-]+", "-", str(payload.get("scenario", "session")).lower()).strip("-")
        name = f"{datetime.now():%Y%m%d-%H%M%S}-{slug or 'session'}.md"
        SESSIONS.mkdir(exist_ok=True)
        (SESSIONS / name).write_text(str(payload.get("markdown", "")), encoding="utf-8")
        self._json(200, {"saved": f"sessions/{name}"})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(ROOT)))
    url = f"http://localhost:{args.port}/"
    print(f"Interview practice running at {url}  (Ctrl+C to stop)")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
