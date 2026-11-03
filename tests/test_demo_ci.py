"""CI process-boundary regressions; no product service or database is started."""
from pathlib import Path
import importlib.util
import os
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('demo_ci_under_test', ROOT/'scripts/demo_ci.py')
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class ProcessBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        ci.OUT = Path(self.temp.name)
        ci.REPORT = {'commands': []}
        ci.SECRETS = ['synthetic-private-canary']

    def tearDown(self):
        self.temp.cleanup()

    def test_daemon_descendant_cannot_hold_parent_capture_open(self):
        # This is the Windows pg_ctl failure shape: the launcher exits while its
        # child still owns inherited standard handles. The child exits by itself.
        code = ('import subprocess,sys; '
                'subprocess.Popen([sys.executable,"-c","import time; time.sleep(4)"], '
                'stdout=sys.stdout,stderr=sys.stderr,close_fds=False, '
                'creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0)); '
                'print("launcher-finished",flush=True)')
        started = time.monotonic()
        result = ci.run([sys.executable, '-c', code], 'launcher', timeout=1)
        self.assertEqual(result, 'launcher-finished')
        self.assertLess(time.monotonic()-started, 2)
        self.assertEqual(ci.REPORT['commands'][0]['exit'], 0)

    def test_true_timeout_is_bounded_and_output_is_sanitized(self):
        code = 'import time; print("synthetic-private-canary",flush=True); time.sleep(5)'
        started = time.monotonic()
        with self.assertRaisesRegex(RuntimeError, 'exceeded its bounded timeout'):
            ci.run([sys.executable, '-c', code], 'timeout', timeout=.3)
        self.assertLess(time.monotonic()-started, 2)
        output = (ci.OUT/'timeout.txt').read_text(encoding='utf8')
        self.assertNotIn('synthetic-private-canary', output)
        self.assertIn('[REDACTED]', output)
        self.assertEqual(ci.REPORT['commands'][0]['exit'], 'TIMEOUT')

    def test_stdout_contract_keeps_stderr_in_evidence_only(self):
        output = ci.run([sys.executable, '-c', 'import sys; print("17.11"); print("warning",file=sys.stderr)'], 'streams')
        self.assertEqual(output, '17.11')
        self.assertIn('warning', (ci.OUT/'streams.txt').read_text(encoding='utf8'))

    def test_nonzero_exit_retains_sanitized_evidence(self):
        with self.assertRaisesRegex(RuntimeError, 'failed; see sanitized evidence'):
            ci.run([sys.executable, '-c', 'print("synthetic-private-canary"); raise SystemExit(7)'], 'refused')
        self.assertEqual(ci.REPORT['commands'][0]['exit'], 7)
        self.assertNotIn('synthetic-private-canary', (ci.OUT/'refused.txt').read_text(encoding='utf8'))


if __name__ == '__main__':
    unittest.main()
