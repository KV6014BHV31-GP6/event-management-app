"""CI process-boundary regressions; no product service or database is started."""
from pathlib import Path
import importlib.util
import os
import sys
import tempfile
import time
import unittest
import copy

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('demo_ci_under_test', ROOT/'scripts/demo_ci.py')
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class ProcessBoundaryTests(unittest.TestCase):
    def test_nested_user_contracts_are_in_native_job_inventory(self):
        paths = ci.backend_test_paths()
        self.assertIn(ROOT/'backend/tests/users/test_create_user.py', paths)
        self.assertIn(ROOT/'backend/tests/test_accounts_native.py', paths)
        self.assertEqual(len(paths), len(set(paths)))

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


class BrowserEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.sha = 'a' * 40
        self.browser = {'schema': 'nu.demo-browser-e2e/1', 'status': 'PASS',
                        'source_sha': self.sha, 'execution_mode': 'GITHUB_HOSTED',
                        'page_errors': 0, 'browser': 'pinned-browser',
                        'document_viewer': {'status': 'PASS', 'authenticated_get': True,
                                            'preview_decoded': True, 'download_hash_match': True,
                                            'private_no_store': True},
                        'offline': {'status': 'PASS', 'draft_count': 3, 'ids_preserved': True,
                                    'payloads_preserved': True, 'offline_api_requests': 0,
                                    'restore_auto_posts': 0, 'batch_post_count': 1,
                                    'batch_post_status': 200, 'unknown_visible': True,
                                    'receipt_get_count': 1, 'receipt_get_status': 200,
                                    'recovered_same_batch': True}}
        self.native = {'native': True, 'non_superuser': True, 'server_version_num': 170011,
                       'private_file_linkage': True, 'ui_user_count': 1,
                       'browser_batch_count': 1, 'browser_submission_count': 3,
                       'pending_offline_registrations': 3, 'duplicate_effect_count': 0,
                       'immutable_batch_match': True}

    def test_complete_real_e2e_receipt_is_required(self):
        ci.validate_browser_evidence(self.browser, self.sha, self.native)

    def test_old_smoke_missing_or_not_run_units_cannot_pass(self):
        for key in ['document_viewer', 'offline']:
            for value in [None, 'NOT_RUN_BY_THIS_BOUNDED_SMOKE', {'status': 'NOT_RUN'}]:
                with self.subTest(key=key, value=value):
                    report = copy.deepcopy(self.browser)
                    if value is None:
                        report.pop(key)
                    else:
                        report[key] = value
                    with self.assertRaises(RuntimeError):
                        ci.validate_browser_evidence(report, self.sha, self.native)

    def test_offline_requests_resend_or_missing_recovery_fail(self):
        for key, value in [('offline_api_requests', 1), ('restore_auto_posts', 1),
                           ('batch_post_count', 2), ('receipt_get_count', 0),
                           ('unknown_visible', False), ('ids_preserved', False)]:
            with self.subTest(key=key):
                report = copy.deepcopy(self.browser)
                report['offline'][key] = value
                with self.assertRaises(RuntimeError):
                    ci.validate_browser_evidence(report, self.sha, self.native)

    def test_failed_native_linkage_or_duplicate_effects_fail(self):
        for key, value in [('private_file_linkage', False), ('browser_batch_count', 2),
                           ('pending_offline_registrations', 6), ('immutable_batch_match', False)]:
            with self.subTest(key=key):
                native = dict(self.native, **{key: value})
                with self.assertRaises(RuntimeError):
                    ci.validate_browser_evidence(self.browser, self.sha, native)

    def test_wrong_sha_page_error_or_local_receipt_cannot_be_ci_pass(self):
        for patch in [{'source_sha': 'b' * 40}, {'page_errors': 1},
                      {'execution_mode': 'AUTHOR_LOCAL'}]:
            with self.subTest(patch=patch):
                report = dict(self.browser, **patch)
                with self.assertRaises(RuntimeError):
                    ci.validate_browser_evidence(report, self.sha, self.native)


if __name__ == '__main__':
    unittest.main()
