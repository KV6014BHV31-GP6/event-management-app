#!/bin/sh
# Railway-managed volume may be mounted after Dockerfile chown; drop to non-root for both servers.
set -eu
mkdir -p /data/uploads /data/private_assets
chown 10001:10001 /data /data/uploads /data/private_assets
exec gosu 10001:10001 python -B /opt/nu/deploy/railway/entrypoint.py
