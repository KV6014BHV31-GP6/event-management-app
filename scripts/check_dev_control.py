#!/usr/bin/env python3
"""Validate the reviewed public payload, not application or backend behaviour."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile, BadZipFile
import xml.etree.ElementTree as ET

REGISTER = 'docs/dev/DOCUMENT_REGISTER.json'
IGNORED_PARTS = {'.git', '__pycache__'}
TEXT_SUFFIXES = {'.md', '.txt', '.json', '.html', '.css', '.js', '.mjs', '.py'}
LEAKS = {
    'private_share_url': re.compile(r'https?://[^\s<>\"\']*(?:sharepoint\.com|mysharepoint\.com)[^\s<>\"\']*', re.I),
    'github_token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'private_key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'student_email': re.compile(r'\b[\w.+-]+@(?:stu\.)?vtc\.edu\.hk\b|\b[\w.+-]+@stu_vtc_edu_hk\b', re.I),
}

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def payload_files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob('*') if p.is_file()
                  and not any(part in IGNORED_PARTS for part in p.relative_to(root).parts))

def text_chunks(path: Path) -> list[str]:
    if path.suffix.lower() == '.docx':
        with ZipFile(path) as z:
            if z.testzip() is not None:
                raise ValueError('DOCX ZIP integrity failure')
            chunks = []
            for name in z.namelist():
                if name.endswith(('.xml', '.rels')):
                    data = z.read(name)
                    ET.fromstring(data)
                    chunks.append(data.decode('utf-8'))
            return chunks
    if path.suffix.lower() in TEXT_SUFFIXES or path.name in {'.gitignore', '.gitattributes'}:
        data = path.read_bytes()
        # Preserve Austin's Windows-generated UTF-16 requirements byte-for-byte.
        encoding = 'utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8'
        return [data.decode(encoding)]
    return []

def validate(root: Path) -> dict:
    root = root.resolve()
    errors: list[str] = []
    try:
        register = json.loads((root / REGISTER).read_text(encoding='utf-8'))
        entries = register['documents']
        if not isinstance(entries, list):
            raise ValueError('documents must be an array')
    except (OSError, ValueError, KeyError) as exc:
        return {'status': 'FAIL', 'errors': [f'register: {exc}']}
    ids, paths, case_paths = set(), set(), set()
    try:
        source_ids = {x['source_id'] for x in json.loads((root/'docs/dev/SOURCE_REGISTER.json').read_text(encoding='utf-8'))['sources']}
    except (OSError, ValueError, KeyError) as exc:
        source_ids = set()
        errors.append(f'source_register: {exc}')
    for entry in entries:
        ident, rel = entry.get('document_id'), entry.get('path')
        if not isinstance(ident, str) or not ident:
            errors.append('missing document_id')
        if ident in ids:
            errors.append(f'duplicate_id: {ident}')
        ids.add(ident)
        if not isinstance(rel, str) or not rel or '\\' in rel:
            errors.append(f'bad_path: {rel}')
            continue
        p = (root/rel).resolve()
        if Path(rel).is_absolute() or not p.is_relative_to(root) or '..' in Path(rel).parts:
            errors.append(f'unsafe_path: {rel}')
            continue
        if rel in paths or rel.casefold() in case_paths:
            errors.append(f'duplicate_path: {rel}')
        paths.add(rel); case_paths.add(rel.casefold())
        if rel == REGISTER:
            errors.append('self_referencing_register')
        if entry.get('status') not in {'draft', 'working-baseline', 'accepted', 'superseded'}:
            errors.append(f'invalid_status: {rel}')
        if not entry.get('owner') or not isinstance(entry.get('revision'), int):
            errors.append(f'missing_metadata: {rel}')
        if entry.get('status') == 'accepted' and not entry.get('approval_record'):
            errors.append(f'unproven_approval: {rel}')
        if not isinstance(entry.get('dependencies', []), list):
            errors.append(f'invalid_dependencies: {rel}')
        else:
            for dep in entry.get('dependencies', []):
                if dep not in source_ids:
                    errors.append(f'unknown_source: {rel}: {dep}')
        if not p.is_file():
            errors.append(f'missing_file: {rel}')
        elif sha256(p) != entry.get('sha256') or p.stat().st_size != entry.get('size_bytes'):
            errors.append(f'fingerprint_mismatch: {rel}')
    if register.get('document_count') != len(entries):
        errors.append('document_count_mismatch')
    files = payload_files(root)
    actual = {p.relative_to(root).as_posix() for p in files}
    for rel in sorted(actual - paths - {REGISTER}):
        errors.append(f'unregistered_file: {rel}')
    link_count = 0
    for p in files:
        rel = p.relative_to(root).as_posix()
        if p.is_symlink():
            errors.append(f'symlink_not_allowed: {rel}')
        if p.name == '.env' or (p.name.startswith('.env.') and p.name != '.env.example'):
            errors.append(f'private_env_file: {rel}')
        try:
            chunks = text_chunks(p)
            if p.suffix == '.json':
                json.loads(p.read_text(encoding='utf-8'))
            for text in chunks:
                for label, pattern in LEAKS.items():
                    if pattern.search(text):
                        errors.append(f'{label}: {rel}')
                if '\ue200' in text or '\ue202' in text:
                    errors.append(f'raw_tool_citation: {rel}')
            if p.suffix == '.md':
                text = p.read_text(encoding='utf-8')
                text = re.sub(r'```[\s\S]*?```', '', text)
                for target in re.findall(r'!?\[[^\]\n]*\]\(([^)\n]+)\)', text):
                    target = target.strip().split(' "', 1)[0].strip('<>')
                    parts = urlsplit(target)
                    if parts.scheme or target.startswith(('#', '//')):
                        continue
                    dest = (p.parent/unquote(parts.path)).resolve()
                    link_count += 1
                    if not dest.is_relative_to(root) or not dest.exists():
                        errors.append(f'broken_local_link: {rel}: {target}')
        except (OSError, ValueError, BadZipFile, ET.ParseError, UnicodeDecodeError) as exc:
            errors.append(f'unreadable_or_invalid_file: {rel}: {exc}')
    return {'status': 'PASS' if not errors else 'FAIL',
            'controlled_file_count': len(entries), 'payload_file_count': len(files),
            'relative_links_checked': link_count, 'errors': errors,
            'scope': 'File integrity, metadata, local link targets and selected sensitive-pattern checks only. Not comprehensive security or product acceptance.'}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    result = validate(args.root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['status'] == 'PASS' else 1

if __name__ == '__main__':
    sys.exit(main())
