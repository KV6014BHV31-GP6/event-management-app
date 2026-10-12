#!/usr/bin/env python3
"""Refresh reviewed file fingerprints without approving documents or adding files."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from check_dev_control import REGISTER, payload_files, sha256, validate

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--reason', required=True, help='Reason for already-reviewed body changes')
    args = parser.parse_args()
    if not args.reason.strip():
        parser.error('reason must not be blank')
    root = args.root.resolve(); target = root/REGISTER
    original_bytes = target.read_bytes()
    register = json.loads(original_bytes)
    preflight = validate(root)
    errors = [x for x in preflight['errors'] if not x.startswith('fingerprint_mismatch:')]
    if errors:
        print(json.dumps({'status':'FAIL','errors':errors},ensure_ascii=False,indent=2))
        return 1
    now = datetime.now(timezone.utc).isoformat(); changed = []
    for entry in register['documents']:
        p = root/entry['path']; digest = sha256(p); size = p.stat().st_size
        if digest == entry['sha256'] and size == entry['size_bytes']:
            continue
        entry.setdefault('revision_history', []).append({
            'revision':entry['revision'], 'sha256':entry['sha256'],
            'size_bytes':entry['size_bytes'], 'superseded_at':now, 'reason':args.reason})
        entry['revision'] += 1; entry['sha256'] = digest; entry['size_bytes'] = size
        changed.append(entry['path'])
    if changed:
        register['reviewed_at'] = now; register['reason'] = args.reason
        tmp = target.with_name(target.name + '.tmp')
        tmp.write_text(json.dumps(register,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        tmp.replace(target)
        result = validate(root)
        if result['status'] != 'PASS':
            target.write_bytes(original_bytes)
            print(json.dumps(result,ensure_ascii=False,indent=2)); return 1
    print(json.dumps({'status':'PASS','changed':changed,'approval_status_changed':False},ensure_ascii=False,indent=2))
    return 0

if __name__ == '__main__':
    sys.exit(main())
