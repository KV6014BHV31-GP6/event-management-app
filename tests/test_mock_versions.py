"""Verify immutable mock source versions, not product or backend behavior."""
from hashlib import sha256
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
V120 = ROOT / "frontend/mock/v1.2.0"
V121 = ROOT / "frontend/mock/v1.2.1/index.html"
EXPECTED = {
    "index.html": "95a8dec3dfb475dc48d9ce55e61de3755936f59f38a2a38e489b744ff1975920",
    "package.json": "081db8f4f43e1d9e55812b6bf1e4dbe46a4a752d802d6435a8b561ca468b2a9c",
    "src/app.mjs": "16e249b2b18180695b3b82cabd910b8268bbaa485ec858c864a4749422e7f418",
    "src/http-adapter.mjs": "d7b1df37e184414ba3eae5eda9f7ec9905074530ca551541cd3ae15c0829fc50",
    "src/mock-service.mjs": "672dc4079e0d5b8bd7156af8ec6ac3b285f065a5c53052fb5c87ed742b471ef0",
    "src/operations.mjs": "3c3cbb550fdbbb74a4d6890d004a24472e2e935724ebd533931d57df3d73cb82",
    "style.css": "447f7347ffe49eca8027fd53eee7f9cf61692f17a9a95281a4861120ad879178",
    "tests/http-adapter.test.mjs": "5834d68b3854b405c8f30e8638735311382986e848f29bd3b189b9a4a7930c21",
    "tests/mock-service.test.mjs": "27f705b20452ccd70352f6d3d701aa175487b9d2e6a22ef8a225f9fcc8693b13",
    "tests/task004.test.mjs": "e5550c9e898d5a3469f8ae8fc173a3e27237002e373f0d3f19b6416c4b88d0fd",
}


class MockVersionsTests(unittest.TestCase):
    def test_v120_original_source_is_unchanged(self):
        for rel, digest in EXPECTED.items():
            with self.subTest(file=rel):
                self.assertEqual(sha256((V120 / rel).read_bytes()).hexdigest(), digest)

    def test_v120_is_modular_and_has_tests(self):
        self.assertIn("./src/app.mjs", (V120 / "index.html").read_text(encoding="utf-8"))
        self.assertIn("node --test", (V120 / "package.json").read_text(encoding="utf-8"))

    def test_v121_verified_source_hash(self):
        self.assertEqual(sha256(V121.read_bytes()).hexdigest(),
                         "3949160d0317c2b32ceadb00adca263db507f55c5577cb7ed4aa05e48cd8292e")

    def test_v121_self_contained_demo(self):
        html = V121.read_text(encoding="utf-8")
        self.assertTrue(html.lower().lstrip().startswith("<!doctype html>"))
        self.assertGreaterEqual(html.count("data-role"), 4)
        self.assertNotRegex(html, r"<script\b[^>]*\bsrc\s*=")
        self.assertNotRegex(html, r"<link\b[^>]*\bhref\s*=")

    def test_launcher_links_both_versions(self):
        launcher = (ROOT / "frontend/index.html").read_text(encoding="utf-8")
        self.assertIn("mock/v1.2.0/index.html", launcher)
        self.assertIn("mock/v1.2.1/index.html", launcher)


if __name__ == "__main__":
    unittest.main()
