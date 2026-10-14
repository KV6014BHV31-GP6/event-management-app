"""Regression tests for the document-control tooling, not the ROSE product."""
from __future__ import annotations
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from check_dev_control import REGISTER, validate, text_chunks

class DocumentControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)/'repo'
        shutil.copytree(ROOT,self.root,ignore=shutil.ignore_patterns('.git','__pycache__'))
    def tearDown(self):
        self.temp.cleanup()
    def register(self):
        return json.loads((self.root/REGISTER).read_text(encoding='utf-8'))
    def save(self, obj):
        (self.root/REGISTER).write_text(json.dumps(obj),encoding='utf-8')
    def errors(self):
        return '\n'.join(validate(self.root)['errors'])
    def test_clean_payload(self):
        self.assertEqual(validate(self.root)['status'],'PASS')
    def test_changed_body_is_detected(self):
        with (self.root/'README.md').open('a',encoding='utf-8') as f: f.write('\nChanged body.\n')
        self.assertIn('fingerprint_mismatch: README.md',self.errors())
    def test_unregistered_file_is_detected(self):
        (self.root/'unexpected.txt').write_text('not reviewed')
        self.assertIn('unregistered_file: unexpected.txt',self.errors())
    def test_duplicate_id_is_detected(self):
        r=self.register();r['documents'][1]['document_id']=r['documents'][0]['document_id'];self.save(r)
        self.assertIn('duplicate_id:',self.errors())
    def test_path_escape_is_rejected(self):
        r=self.register();r['documents'][0]['path']='../outside.txt';self.save(r)
        self.assertIn('unsafe_path:',self.errors())
    def test_case_colliding_path_is_detected(self):
        r=self.register();r['documents'][1]['path']=r['documents'][0]['path'].upper();self.save(r)
        self.assertIn('duplicate_path:',self.errors())
    def test_broken_relative_link_is_detected(self):
        with (self.root/'README.md').open('a',encoding='utf-8') as f: f.write('\n[missing](not-here.md)\n')
        self.assertIn('broken_local_link:',self.errors())
    def test_unapproved_accepted_status_is_rejected(self):
        r=self.register();r['documents'][0]['status']='accepted';self.save(r)
        self.assertIn('unproven_approval:',self.errors())
    def test_private_env_is_rejected(self):
        (self.root/'.env').write_text('LOCAL_VALUE=synthetic')
        self.assertIn('private_env_file:',self.errors())
    def test_utf16_requirements_remain_scanned(self):
        path = self.root/'synthetic-requirements.txt'
        path.write_text('fastapi==0.142.4\n', encoding='utf-16')
        self.assertEqual(text_chunks(path), ['fastapi==0.142.4\n'])
    def test_refresh_preserves_id_owner_status(self):
        r=self.register();before=next(x for x in r['documents'] if x['path']=='README.md')
        with (self.root/'README.md').open('a',encoding='utf-8') as f: f.write('\nReviewed wording update.\n')
        p=subprocess.run([sys.executable,str(self.root/'scripts/refresh_document_register.py'),'--root',str(self.root),'--reason','test reviewed wording'],text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        after=next(x for x in self.register()['documents'] if x['path']=='README.md')
        for key in ['document_id','owner','status','dependencies']:
            self.assertEqual(before[key],after[key])
        self.assertEqual(after['revision'],before['revision']+1)
        self.assertEqual(after['revision_history'][-1]['sha256'],before['sha256'])
        self.assertEqual(validate(self.root)['status'],'PASS')
    def test_refresh_refuses_unknown_files(self):
        (self.root/'new.md').write_text('Requires manual metadata')
        p=subprocess.run([sys.executable,str(self.root/'scripts/refresh_document_register.py'),'--root',str(self.root),'--reason','test refuses new file'],text=True,capture_output=True)
        self.assertNotEqual(p.returncode,0)
    def test_private_share_url_is_detected(self):
        fake='https://'+'test-tenant.'+'sharepoint.com/'+'synthetic-example'
        with (self.root/'README.md').open('a',encoding='utf-8') as f: f.write('\n'+fake+'\n')
        self.assertIn('private_share_url:',self.errors())

if __name__ == '__main__':
    unittest.main()
