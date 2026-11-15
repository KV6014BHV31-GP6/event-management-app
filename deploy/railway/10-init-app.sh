#!/bin/sh
set -eu
[ "${POSTGRES_DB:-}" = "nu_staging" ] || { echo 'Refusing non-staging database'; exit 1; }
[ "${POSTGRES_USER:-}" = "nu_bootstrap" ] || { echo 'Refusing unexpected bootstrap role'; exit 1; }
[ "${#NU_DB_APP_PASSWORD}" -ge 32 ] || { echo 'Missing application DB secret'; exit 1; }
# psql variable quoting prevents secrets from becoming SQL syntax or appearing in output.
psql -v ON_ERROR_STOP=1 -v app_password="$NU_DB_APP_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE nu_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
GRANT CONNECT ON DATABASE nu_staging TO nu_app;
GRANT USAGE, CREATE ON SCHEMA public TO nu_app;
SQL
unset NU_DB_APP_PASSWORD
