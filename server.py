from __future__ import annotations

import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8765


class ChecklistHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; "
            "script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; "
            "base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
        )
        super().end_headers()


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), partial(ChecklistHandler))
    server.daemon_threads = True
    url = f"http://{HOST}:{PORT}"
    print(f"Maintenance Daily Checklist is running at {url}")
    print("The checklist is processed in your browser; press Ctrl+C to stop.")
    threading.Timer(1, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping the checklist app.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
