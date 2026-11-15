"""No DB or network. Validate only the isolated staging process preconditions."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

TEST_SHA = 'a' * 40

path = Path(__file__).resolve().parents[1] / "entrypoint.py"
spec = importlib.util.spec_from_file_location("nu_railway_entry", path)
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)


def valid_env():
    return {
        "NU_TRUSTED_HTTPS_ORIGIN": "https://rosepulse.up.railway.app",
        "DATABASE_URL": "postgresql://nu_app:synthetic-only@postgres17.railway.internal:5432/nu_staging",
        "JWT_SECRET_KEY": "synthetic-only-" + "x" * 48,
        "NU_DEMO_PROFILE": "synthetic",
        "NU_PRODUCT_SOURCE_SHA": TEST_SHA,
        "PORT": "8080",
    }


class RailwayEntrypointTest(unittest.TestCase):
    def setUp(self):
        self.build = patch.object(entry, 'read_build_identity', return_value=TEST_SHA)
        self.build.start()
        self.addCleanup(self.build.stop)

    def test_refuses_provider_or_built_source_drift(self):
        data = valid_env()
        data['RAILWAY_GIT_COMMIT_SHA'] = 'b' * 40
        with self.assertRaises(ValueError):
            entry.validate_environment(data)
        data['RAILWAY_GIT_COMMIT_SHA'] = TEST_SHA
        self.assertEqual(entry.validate_environment(data)['NU_PRODUCT_SOURCE_SHA'], TEST_SHA)
        self.build.stop()
        with patch.object(entry, 'read_build_identity', return_value='b' * 40):
            with self.assertRaises(ValueError):
                entry.validate_environment(data)

    def test_valid_synthetic_staging(self):
        env = entry.validate_environment(valid_env())
        self.assertEqual(env["ENVIRONMENT"], "production")
        self.assertEqual(env["UPLOAD_DIR"], "/data/uploads")

    def test_refuses_missing_or_foreign_origin(self):
        for origin in ("", "http://rosepulse.up.railway.app", "https://localhost",
                       "https://rosepulse.up.railway.app/attack",
                       "https://rosepulse.up.railway.app?x=1"):
            with self.subTest(origin=origin):
                data = valid_env()
                data["NU_TRUSTED_HTTPS_ORIGIN"] = origin
                with self.assertRaises(ValueError):
                    entry.validate_environment(data)

    def test_refuses_non_synthetic_or_unknown_product(self):
        for name, value in (("NU_DEMO_PROFILE", "production"),
                            ("NU_PRODUCT_SOURCE_SHA", "0" * 40),
                            ("JWT_SECRET_KEY", "short"),
                            ("DATABASE_URL", "sqlite:///tmp/db")):
            with self.subTest(name=name):
                data = valid_env()
                data[name] = value
                with self.assertRaises(ValueError):
                    entry.validate_environment(data)

    def test_refuses_invalid_port(self):
        data = valid_env()
        data["PORT"] = "notaport"
        with self.assertRaises(ValueError):
            entry.validate_environment(data)


if __name__ == "__main__":
    unittest.main()
