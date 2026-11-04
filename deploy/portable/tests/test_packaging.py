"""Offline RED/GREEN contract tests for packaging only; no product/DB/Browser acceptance."""
from pathlib import Path
import importlib.util, io, json, os, stat, tempfile, unittest, zipfile
import yaml
ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj
prep=module('nu_prepare',ROOT/'prepare.py')
entry=module('nu_entrypoint',ROOT/'runtime/entrypoint.py')
ARTIFACT=ROOT/'vendor/nu-ci-artifact.zip'

class PackagingTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
 def tearDown(self):self.temp.cleanup()
 def test_existing_232_payload_identities(self):
  entries,manifest=prep.load_verified_artifact(ARTIFACT);self.assertEqual(len(manifest['files']),232);self.assertEqual(len(entries),233)
 def test_altered_archive_refused(self):
  f=self.root/'bad.zip';f.write_bytes(ARTIFACT.read_bytes()+b'changed');self.assertRaises(ValueError,prep.load_verified_artifact,f)
 def test_extract_never_rebuilds_frontend(self):
  result=prep.prepare(ARTIFACT,self.root);self.assertFalse(result['react_rebuilt']);self.assertFalse(result['product_source_modified'])
 def test_second_prepare_preserves_inode_and_mtime(self):
  prep.prepare(ARTIFACT,self.root);f=self.root/'release/frontend-dist/index.html';s=f.stat();b=f.read_bytes();r=prep.prepare(ARTIFACT,self.root)
  self.assertEqual(r['status'],'EXISTING_RELEASE_PRESERVED');self.assertEqual(s.st_mtime_ns,f.stat().st_mtime_ns);self.assertEqual(b,f.read_bytes())
 def test_modified_release_is_not_overwritten(self):
  prep.prepare(ARTIFACT,self.root);f=self.root/'release/frontend-dist/index.html';f.write_text('modified');self.assertRaises(ValueError,prep.prepare,ARTIFACT,self.root);self.assertEqual(f.read_text(),'modified')
 def test_extra_release_file_refused(self):
  prep.prepare(ARTIFACT,self.root);(self.root/'release/unexpected').write_text('x');self.assertRaises(ValueError,prep.prepare,ARTIFACT,self.root)
 def test_symlink_release_refused(self):
  (self.root/'real').mkdir();(self.root/'release').symlink_to(self.root/'real',target_is_directory=True);self.assertRaises(ValueError,prep.prepare,ARTIFACT,self.root)
 def zipdata(self,entries):
  buffer=io.BytesIO()
  with zipfile.ZipFile(buffer,'w') as z:
   for n,v in entries:z.writestr(n,v)
  return buffer.getvalue()
 def test_parent_path_refused(self):self.assertRaises(ValueError,prep.archive_entries,self.zipdata([('../x','x')]))
 def test_absolute_path_refused(self):self.assertRaises(ValueError,prep.archive_entries,self.zipdata([('/tmp/x','x')]))
 def test_windows_path_refused(self):self.assertRaises(ValueError,prep.archive_entries,self.zipdata([('C:\\secret','x')]))
 def test_duplicate_path_refused(self):self.assertRaises(ValueError,prep.archive_entries,self.zipdata([('x','a'),('x','b')]))
 def test_new_secrets_are_not_printed(self):
  result=prep.create_secrets(self.root);self.assertFalse(result['values_printed']);self.assertEqual(len(list((self.root/'.secrets').iterdir())),3)
 def test_secret_rotation_refused(self):
  prep.create_secrets(self.root);f=self.root/'.secrets/jwt_secret';old=f.read_bytes();self.assertRaises(FileExistsError,prep.create_secrets,self.root);self.assertEqual(old,f.read_bytes())
 def test_secret_parent_permissions(self):
  prep.create_secrets(self.root);self.assertEqual(stat.S_IMODE((self.root/'.secrets').stat().st_mode),0o700)
 def test_valid_configuration_is_synthetic(self):
  prep.create_secrets(self.root);e=entry.configured_env({},self.root/'.secrets');self.assertEqual(e['NU_DEMO_PROFILE'],'synthetic');self.assertIn('@db:5432/nu_container_demo',e['DATABASE_URL'])
 def test_invalid_db_host_refused(self):
  prep.create_secrets(self.root);self.assertRaises(ValueError,entry.configured_env,{'NU_DB_HOST':'evil/route'},self.root/'.secrets')
 def test_invalid_port_refused(self):
  prep.create_secrets(self.root);self.assertRaises(ValueError,entry.configured_env,{'NU_DB_PORT':'70000'},self.root/'.secrets')
 def test_missing_secret_refused(self):self.assertRaises(FileNotFoundError,entry.configured_env,{},self.root)
 def test_short_secret_refused(self):
  (self.root/'db_app_password').write_text('short');self.assertRaises(ValueError,entry.configured_env,{},self.root)
 def compose(self):return yaml.safe_load((ROOT/'compose.yaml').read_text())
 def test_database_not_published(self):self.assertNotIn('ports',self.compose()['services']['db'])
 def test_no_host_pgdata_bind(self):
  mounts=self.compose()['services']['db']['volumes'];self.assertEqual(mounts[0],'pgdata:/var/lib/postgresql/data');self.assertFalse(any('/workspace/' in s for s in mounts))
 def test_loopback_only_entry(self):self.assertTrue(self.compose()['services']['app']['ports'][0].startswith('127.0.0.1:'))
 def test_application_is_nonroot_readonly(self):
  a=self.compose()['services']['app'];self.assertEqual(a['user'],'10001:10001');self.assertTrue(a['read_only']);self.assertEqual(a['cap_drop'],['ALL'])
 def test_tmpfs_is_one_mount(self):self.assertEqual(self.compose()['services']['app']['tmpfs'],['/tmp:rw,nosuid,noexec,size=64m'])
 def test_only_readiness_dependency(self):self.assertEqual(self.compose()['services']['app']['depends_on']['db']['condition'],'service_healthy')
 def test_no_credentials_inside_compose(self):
  s=(ROOT/'compose.yaml').read_text();self.assertNotIn('JWT_SECRET_KEY:',s);self.assertNotIn('DATABASE_URL:',s);self.assertNotIn('POSTGRES_PASSWORD:',s)
 def test_no_automatic_seed_or_migration(self):
  s=(ROOT/'Dockerfile').read_text()+ (ROOT/'compose.yaml').read_text();self.assertNotIn('dev_bootstrap',s);self.assertNotIn('seed_events',s);self.assertNotIn('migrate_',s)
 def test_exact_release_runtime_pins(self):
  d=(ROOT/'Dockerfile').read_text();self.assertIn('python:3.14.8-slim-bookworm',d);self.assertIn('node:24.14.0-bookworm-slim',d);self.assertIn('postgres:17.11-bookworm',self.compose()['services']['db']['image'])
 def test_docker_context_excludes_private_material(self):
  s=(ROOT/'.dockerignore').read_text();self.assertTrue(s.startswith('**\n'));self.assertIn('.secrets/**',s);self.assertNotIn('!vendor/',s)
 def test_unchanged_product_proxy_bytes(self):
  e,m=prep.load_verified_artifact(ARTIFACT);b=e['source/frontend/dev-server.mjs'];self.assertEqual(prep.digest(b),m['files']['source/frontend/dev-server.mjs'])

if __name__=='__main__':unittest.main(verbosity=2)
