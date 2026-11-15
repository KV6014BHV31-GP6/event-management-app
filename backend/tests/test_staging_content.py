"""Manifest and stable source-key boundaries, no external resources."""
import importlib.util
import json
from pathlib import Path
import pytest

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/staging_content.py'
spec = importlib.util.spec_from_file_location('staging_content', SOURCE)
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


def test_stable_account_and_asset_keys_are_ulids_without_collisions():
    keys = ['account:'+name for name in seed.ROLES] + ['image:nu26_screening:0']
    values = [seed.stable_id(key) for key in keys]
    assert len(set(values)) == len(keys)
    assert all(len(value)==26 and set(value)<=set(seed.ALPHABET) for value in values)
    assert values == [seed.stable_id(key) for key in keys]


def test_manifest_requires_original_image_bytes_and_safe_paths(tmp_path):
    raw = b'\x89PNG\r\n\x1a\ncontrolled-fixture'
    (tmp_path/'photo.png').write_bytes(raw)
    row={'public_id':'source_event_00000001','organizer':'organizer1','intended_public':True,
         'start_time':'2027-03-15T10:00:00+08:00','end_time':'2027-03-15T12:00:00+08:00',
         'registration_opens_at':'2026-11-16T00:00:00+08:00','registration_closes_at':'2027-03-15T10:00:00+08:00',
         'online_quota':25,'offline_quota':5,'images':[{'file':'photo.png','sha256':seed.digest(raw)}]}
    data={'operation_id':seed.OPERATION,'synthetic_only':True,'events':[row]}
    manifest=tmp_path/'manifest.json'
    manifest.write_text(json.dumps(data))
    assert seed.load_manifest(manifest)[0]['events'][0]['public_id']=='source_event_00000001'
    (tmp_path/'photo.png').write_bytes(raw+b'changed')
    with pytest.raises(ValueError,match='hash mismatch'): seed.load_manifest(manifest)
    row['images'][0]['file']='../photo.png'
    manifest.write_text(json.dumps(data))
    with pytest.raises(ValueError,match='escaping image'): seed.load_manifest(manifest)


def test_manifest_rejects_duplicate_source_ids_and_unzoned_time(tmp_path):
    path=tmp_path/'manifest.json'
    path.write_text(json.dumps({'operation_id':seed.OPERATION,'synthetic_only':True,'events':[{'public_id':'same'},{'public_id':'same'}]}))
    with pytest.raises(ValueError,match='duplicate'): seed.load_manifest(path)
    with pytest.raises(ValueError,match='Timezone required'): seed.timestamp('2027-03-15T10:00:00')


@pytest.mark.parametrize('invalid_id', ['nu26_screening', 'short', 'x'*22])
def test_manifest_rejects_ids_that_existing_web_client_cannot_read(tmp_path, invalid_id):
    raw=b'\x89PNG\r\n\x1a\ncontrolled-fixture'
    (tmp_path/'photo.png').write_bytes(raw)
    row={'public_id':invalid_id,'organizer':'organizer1','intended_public':True,
         'start_time':'2027-03-15T10:00:00+08:00','end_time':'2027-03-15T12:00:00+08:00',
         'registration_opens_at':'2026-11-16T00:00:00+08:00','registration_closes_at':'2027-03-15T10:00:00+08:00',
         'online_quota':25,'offline_quota':5,'images':[{'file':'photo.png','sha256':seed.digest(raw)}]}
    path=tmp_path/'manifest.json'
    path.write_text(json.dumps({'operation_id':seed.OPERATION,'synthetic_only':True,'events':[row]}))
    with pytest.raises(ValueError,match='Invalid stable event ID'):
        seed.load_manifest(path)
