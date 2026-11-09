#!/usr/bin/env python3
"""Local review player with byte ranges, so MP4 chapter seeking works."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        name = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        path = (ROOT / name).resolve()
        self.remaining = 0
        if not path.is_relative_to(ROOT) or not path.is_file():
            self.send_error(404)
            return None
        size = path.stat().st_size
        start, end = 0, size - 1
        ranged = self.headers.get('Range')
        if ranged:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', ranged)
            if not match or not any(match.groups()):
                self.send_error(416)
                return None
            a, b = match.groups()
            start = int(a) if a else max(0, size - int(b))
            end = min(size - 1, int(b)) if a and b else size - 1
            if start > end or start >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return None
        self.send_response(206 if ranged else 200)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(max(0, end - start + 1)))
        if ranged:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        f = path.open('rb')
        f.seek(start)
        self.remaining = max(0, end - start + 1)
        return f

    def copyfile(self, source, output):
        try:
            while self.remaining:
                block = source.read(min(self.remaining, 64 * 1024))
                if not block:
                    break
                output.write(block)
                self.remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8323), Handler).serve_forever()
