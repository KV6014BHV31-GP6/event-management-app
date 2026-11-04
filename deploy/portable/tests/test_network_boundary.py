"""Regression for healthy containers whose internal-only network hides host ports.

These are Compose topology checks, not VM or application acceptance. The hosted
wrapper workflow must separately verify real host reachability before/after restart.
"""
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[1]


class NetworkBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.compose = yaml.safe_load((ROOT / "compose.yaml").read_text())
        self.app = self.compose["services"]["app"]
        self.db = self.compose["services"]["db"]
        self.networks = self.compose["networks"]

    def test_published_app_has_a_noninternal_bridge(self):
        reachable = [name for name in self.app["networks"]
                     if not (self.networks[name] or {}).get("internal", False)
                     and (self.networks[name] or {}).get("driver", "bridge") == "bridge"]
        self.assertTrue(reachable, "Published App cannot attach only to internal networks.")

    def test_database_stays_on_private_network_without_published_ports(self):
        self.assertEqual(self.db["networks"], ["private"])
        self.assertTrue(self.networks["private"]["internal"])
        self.assertNotIn("ports", self.db)
        self.assertNotIn("network_mode", self.db)

    def test_app_and_database_keep_the_private_connection(self):
        self.assertIn("private", self.app["networks"])
        self.assertEqual(set(self.app["networks"]) & set(self.db["networks"]), {"private"})
        self.assertEqual(self.app["environment"]["NU_DB_HOST"], "db")

    def test_host_entry_remains_loopback_and_not_host_network(self):
        self.assertEqual(self.app["ports"], ["127.0.0.1:${NU_HTTP_PORT:-5271}:8080"])
        self.assertNotIn("network_mode", self.app)
        self.assertFalse(self.app.get("privileged", False))
        self.assertEqual(self.app["cap_drop"], ["ALL"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
