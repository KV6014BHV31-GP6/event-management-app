"""Controlled Windows text-I/O regression, not native Windows/DB acceptance."""
import importlib.util
import io
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('subject_prepare', SOURCE / 'prepare.py')
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
spec = importlib.util.spec_from_file_location('subject_entrypoint', SOURCE / 'runtime/entrypoint.py')
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)
REAL_FDOPEN = os.fdopen

def windows_fdopen(fd, mode='r', *args, **kwargs):
    """Use real TextIOWrapper with Windows newline when the caller leaves default."""
    if 'b' not in mode and kwargs.get('newline') is None:
        kwargs['newline'] = '\r\n'
    return REAL_FDOPEN(fd, mode, *args, **kwargs)

class SecretNewlineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        for f in self.root.rglob('*'):
            if f.is_file():
                os.chmod(f, stat.S_IREAD | stat.S_IWRITE)
        self.temp.cleanup()

    def create(self):
        with patch.object(prep.os, 'fdopen', windows_fdopen):
            return prep.create_secrets(self.root)

    def test_generated_files_are_lf_only_on_windows_text_io(self):
        self.create()
        for f in (self.root / '.secrets').iterdir():
            value = f.read_bytes()
            self.assertTrue(value.endswith(b'\n'))
            self.assertEqual(value.count(b'\n'), 1)
            self.assertTrue(b'\r' not in value, 'CR byte in ' + f.name)

    def test_shell_cat_password_equals_backend_password(self):
        self.create()
        folder = self.root / '.secrets'
        shell_value = (folder / 'db_app_password').read_bytes().rstrip(b'\n').decode('utf-8')
        app_value = entry.read_secret(folder, 'db_app_password')
        self.assertTrue(shell_value == app_value, 'shell/App secret bytes differ')

    def test_generated_byte_length_has_exactly_one_lf(self):
        self.create()
        for f in (self.root / '.secrets').iterdir():
            raw = f.read_bytes()
            token = raw.strip()
            self.assertEqual(len(raw), len(token) + 1)
            self.assertFalse(raw.startswith(b'\xef\xbb\xbf'))

    def test_existing_values_and_format_are_never_rotated(self):
        folder = self.root / '.secrets'
        folder.mkdir()
        f = folder / 'db_app_password'
        f.write_bytes(b'synthetic-existing-value-only-for-test\r\n')
        before = f.read_bytes()
        with self.assertRaises(FileExistsError):
            self.create()
        self.assertEqual(f.read_bytes(), before)

    def test_secrets_are_not_printed_or_returned(self):
        out = io.StringIO()
        from contextlib import redirect_stdout
        with redirect_stdout(out):
            result = self.create()
        self.assertEqual(out.getvalue(), '')
        self.assertFalse(result['values_printed'])
        self.assertEqual(len(list((self.root / '.secrets').iterdir())), 3)
        for f in (self.root / '.secrets').iterdir():
            self.assertNotIn(f.read_text().strip(), str(result))

    def test_directory_and_file_permissions_remain_restricted(self):
        self.create()
        if os.name != 'nt':
            self.assertEqual(stat.S_IMODE((self.root / '.secrets').stat().st_mode), 0o700)
            for f in (self.root / '.secrets').iterdir():
                self.assertEqual(stat.S_IMODE(f.stat().st_mode), 0o444)

if __name__ == '__main__':
    unittest.main(verbosity=2)
