"""Verify and unpack the EXISTING CI release. Never edits source or touches the VM DB."""
from pathlib import Path, PurePosixPath
import argparse, hashlib, io, json, os, secrets, shutil, stat, tempfile, zipfile

SOURCE_SHA='0e8bba3863267223ede48ddca35f8bb2017a5e3a'
OUTER_SHA='d4563bfa176033b840202560f8ba1db2c40481a6615630d4f4c7eb6aabcec0a8'
INNER_SHA='b973111057b3e0ba5dff9b3c5d039072a9365c74b8843f90f65434cad613c563'
INNER_NAME='nu-demo-'+SOURCE_SHA+'.zip'
LIMIT=100*1024*1024
ROOT=Path(__file__).resolve().parent

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def archive_entries(data: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        info=archive.infolist()
        if len(info)>600 or sum(x.file_size for x in info)>LIMIT:
            raise ValueError('ARCHIVE_LIMIT')
        result={}
        for item in info:
            name=item.filename
            p=PurePosixPath(name)
            if (p.is_absolute() or not name or '..' in p.parts or '\\' in name or ':' in name
                or '\x00' in name or name in result or stat.S_ISLNK(item.external_attr>>16)):
                raise ValueError('UNSAFE_ARCHIVE_PATH')
            if item.is_dir():continue
            result[name]=archive.read(item)
        return result

def load_verified_artifact(path: Path) -> tuple[dict[str, bytes],dict]:
    data=path.read_bytes()
    if len(data)>LIMIT:raise ValueError('ARCHIVE_LIMIT')
    if digest(data)==OUTER_SHA:
        outer=archive_entries(data)
        if set(outer)!={INNER_NAME,INNER_NAME+'.sha256','RELEASE.json'}:
            raise ValueError('UNEXPECTED_OUTER_CONTENTS')
        data=outer[INNER_NAME]
    if digest(data)!=INNER_SHA:raise ValueError('ARCHIVE_SHA_MISMATCH')
    entries=archive_entries(data)
    manifest=json.loads(entries['RELEASE.json'])
    if manifest.get('source_sha')!=SOURCE_SHA or manifest.get('synthetic_only') is not True:
        raise ValueError('SOURCE_IDENTITY_MISMATCH')
    files=manifest['files']
    if len(files)!=232 or set(entries)!=(set(files)|{'RELEASE.json'}):
        raise ValueError('PAYLOAD_MEMBERS_MISMATCH')
    for name,expected in files.items():
        if digest(entries[name])!=expected:raise ValueError('PAYLOAD_SHA_MISMATCH')
    return entries,manifest

def verify_directory(target: Path, entries: dict[str,bytes]) -> None:
    if target.is_symlink() or not target.is_dir():raise ValueError('RELEASE_NOT_REGULAR_DIRECTORY')
    actual=[]
    for file in target.rglob('*'):
        if file.is_symlink():raise ValueError('RELEASE_CONTAINS_SYMLINK')
        if file.is_file():actual.append(file.relative_to(target).as_posix())
    if set(actual)!=set(entries):raise ValueError('EXISTING_RELEASE_MEMBERS_CHANGED')
    for name,data in entries.items():
        if digest((target/name).read_bytes())!=digest(data):raise ValueError('EXISTING_RELEASE_CHANGED')

def prepare(path: Path, destination: Path=ROOT) -> dict:
    entries,manifest=load_verified_artifact(path)
    destination.mkdir(parents=True,exist_ok=True)
    target=destination/'release'
    if target.exists() or target.is_symlink():
        verify_directory(target,entries)
        return {'status':'EXISTING_RELEASE_PRESERVED','source_sha':SOURCE_SHA,'verified_payload_files':232}
    staging=Path(tempfile.mkdtemp(prefix='.release-stage-',dir=destination))
    try:
        for name,data in entries.items():
            file=staging/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
        verify_directory(staging,entries)
        os.rename(staging,target)
    except BaseException:
        shutil.rmtree(staging,ignore_errors=True)
        raise
    return {'status':'EXISTING_CI_RELEASE_UNPACKED','source_sha':SOURCE_SHA,'verified_payload_files':232,
            'product_source_modified':False,'react_rebuilt':False,'vm_accessed':False}

def create_secrets(destination: Path=ROOT) -> dict:
    folder=destination/'.secrets'
    # No rotation, overwrite or adoption of existing host settings.
    folder.mkdir(mode=0o700,exist_ok=False)
    for name in ('db_admin_password','db_app_password','jwt_secret'):
        descriptor=os.open(folder/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o444)
        with os.fdopen(descriptor,'w',encoding='utf-8',newline='\n') as f:f.write(secrets.token_urlsafe(48)+'\n')
        # Compose file secrets are bind mounts. Keep parent private; mount file readable by UID10001.
        os.chmod(folder/name,0o444)
    return {'status':'THREE_LOCAL_SECRETS_CREATED','values_printed':False,
            'windows_acl':'Configure a private host directory ACL on Windows; POSIX chmod is insufficient there.'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact',type=Path,default=ROOT/'vendor/nu-ci-artifact.zip')
    parser.add_argument('--new-secrets',action='store_true',help='New isolated container DB only; never rotate existing secrets.')
    args=parser.parse_args()
    result=prepare(args.artifact)
    if args.new_secrets:result['secrets']=create_secrets()
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print(json.dumps({'status':'STOPPED','error_type':type(exc).__name__,
                          'reason':str(exc) if isinstance(exc,ValueError) else 'Inspect existing paths; no overwrite performed.'}))
        raise SystemExit(1)
