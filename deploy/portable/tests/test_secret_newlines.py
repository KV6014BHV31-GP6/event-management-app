"""Cross-platform secret encoding regression. Never print generated values."""
from contextlib import redirect_stdout
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'prepare.py'
spec = importlib.util.spec_from_file_location('prepare_secret_regression', SOURCE)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class SecretNewlineTests(unittest.TestCase):
    def assert_canonical_files(self, destination):
        names = {'db_admin_password', 'db_app_password', 'jwt_secret'}
        files = list((destination / '.secrets').iterdir())
        self.assertEqual({p.name for p in files}, names)
        for path in files:
            data = path.read_bytes()
            # Assertions reveal the filename, never the credential bytes.
            self.assertTrue(data.endswith(b'\n') and b'\r' not in data, path.name)
            self.assertEqual(data.count(b'\n'), 1, path.name)
            self.assertTrue(len(data.rstrip(b'\n')) >= 48, path.name)

    def test_windows_default_translation_is_not_used(self):
        real_fdopen = os.fdopen
        def windows_fdopen(fd, mode='r', *args, **kwargs):
            if 'b' not in mode and kwargs.get('newline') is None:
                kwargs['newline'] = '\r\n'
            return real_fdopen(fd, mode, *args, **kwargs)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(prepare.os, 'fdopen', side_effect=windows_fdopen):
                result = prepare.create_secrets(root)
            self.assertEqual(result['status'], 'THREE_LOCAL_SECRETS_CREATED')
            self.assert_canonical_files(root)

    def test_native_output_is_single_lf(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepare.create_secrets(root)
            self.assert_canonical_files(root)

    def test_existing_values_are_never_rotated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepare.create_secrets(root)
            before = {p.name: p.read_bytes() for p in (root / '.secrets').iterdir()}
            with self.assertRaises(FileExistsError):
                prepare.create_secrets(root)
            after = {p.name: p.read_bytes() for p in (root / '.secrets').iterdir()}
            self.assertTrue(before == after, 'Existing secrets were modified')

    def test_values_are_not_printed(self):
        with tempfile.TemporaryDirectory() as directory, redirect_stdout(io.StringIO()) as output:
            result = prepare.create_secrets(Path(directory))
            self.assertFalse(result['values_printed'])
            self.assertEqual(output.getvalue(), '')


if __name__ == '__main__':
    unittest.main()
