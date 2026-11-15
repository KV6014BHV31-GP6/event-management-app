"""No DB or network. Validate only the isolated staging process preconditions."""
import importlib.util
from pathlib import Path
import unittest

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
        "NU_PRODUCT_SOURCE_SHA": entry.SOURCE_SHA,
        "PORT": "8080",
    }


class RailwayEntrypointTest(unittest.TestCase):
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
