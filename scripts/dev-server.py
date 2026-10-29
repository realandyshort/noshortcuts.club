#!/usr/bin/env python3
"""Local preview for the No Shortcuts site. No installs needed (uses the Python that ships with macOS).

Run from the project folder:   python3 scripts/dev-server.py
Then open:                     http://localhost:4000

It serves the site/ folder, and also serves config/ and seed/ files at the same
addresses the published site uses, so what you see locally matches noshortcuts.club.
Phase 2 replaces this with a Node dev server that has live reload and the tinker panel.
"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4000

# Published site address  ->  where the file lives in the project while developing
EXTRA = {
    "/config/site.config.json": os.path.join(ROOT, "config", "site.config.json"),
    "/data/route_line.json":    os.path.join(ROOT, "seed", "route_line.json"),
    "/data/countries.json":     os.path.join(ROOT, "seed", "countries.json"),
}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SITE, **kw)

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean in EXTRA:
            return EXTRA[clean]
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # always show the latest edit
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("No Shortcuts preview: http://localhost:%d  (Ctrl+C to stop)" % PORT)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
