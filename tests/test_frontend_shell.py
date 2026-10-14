"""Static launcher checks, independent of product/backend acceptance."""
from functools import partial
from hashlib import sha256
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen
import unittest

ROOT = Path(__file__).resolve().parents[1]
DEMO = "docs/dev/evidence/LOG_DOCX_20261012/ROSE_DEMO_English_v1.2.1_SOURCE.html"
DEMO_HASH = "3949160d0317c2b32ceadb00adca263db507f55c5577cb7ed4aa05e48cd8292e"

class Tags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

class FrontendShellTests(unittest.TestCase):
    def setUp(self):
        self.text = (ROOT / "frontend/index.html").read_text(encoding="utf-8")
        self.parsed = Tags()
        self.parsed.feed(self.text)

    def test_document_and_mobile_metadata(self):
        self.assertTrue(self.text.lower().startswith("<!doctype html>"))
        self.assertIn(("html", {"lang": "en"}), self.parsed.tags)
        self.assertEqual(sum(tag == "h1" for tag, _ in self.parsed.tags), 1)
        self.assertTrue(any(tag == "meta" and a.get("name") == "viewport" for tag, a in self.parsed.tags))

    def test_demo_link_and_frozen_identity(self):
        links = [a for tag, a in self.parsed.tags if tag == "a" and a.get("id") == "open-demo"]
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["href"], "../" + DEMO)
        self.assertEqual(sha256((ROOT / DEMO).read_bytes()).hexdigest(), DEMO_HASH)

    def test_local_links_resolve(self):
        for tag, a in self.parsed.tags:
            if tag != "a":
                continue
            parts = urlsplit(a["href"])
            self.assertFalse(parts.scheme or parts.netloc)
            target = (ROOT / "frontend" / unquote(parts.path)).resolve()
            self.assertTrue(target.is_relative_to(ROOT.resolve()))
            self.assertTrue(target.is_file(), a["href"])

    def test_no_active_code_or_external_assets(self):
        self.assertIn("Synthetic Mock only.", self.text)
        for tag, attrs in self.parsed.tags:
            self.assertNotIn(tag, {"script", "form", "iframe", "input", "link", "object"})
            self.assertFalse(any(k.startswith("on") for k in attrs))
            self.assertNotIn("src", attrs)

    def test_loopback_http_readback(self):
        handler = partial(QuietHandler, directory=str(ROOT))
        with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            worker = Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                base = f"http://127.0.0.1:{server.server_port}/"
                for url_path, file_path in (("frontend/", "frontend/index.html"), (DEMO, DEMO)):
                    with urlopen(base + url_path, timeout=5) as response:
                        self.assertEqual(response.status, 200)
                        self.assertIn("text/html", response.headers.get("Content-Type", ""))
                        self.assertEqual(response.read(), (ROOT / file_path).read_bytes())
            finally:
                server.shutdown()
                worker.join(timeout=5)

if __name__ == "__main__":
    unittest.main()
