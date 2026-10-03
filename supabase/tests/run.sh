#!/usr/bin/env bash
# Runs the database access-model tests against a scratch database.
#
#   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
#
# TEST_DATABASE_URL must point at a Postgres 15+ server as a superuser. A new
# database is created for the run and dropped afterwards. supabase_stub.sql
# provides the auth/storage pieces Supabase normally supplies.
set -euo pipefail

: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a Postgres 15+ superuser connection URL}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
db="rh_access_test_$$"
base="${TEST_DATABASE_URL%/*}"
url="$base/$db"

psql "$TEST_DATABASE_URL" -qX -c "create database $db" >/dev/null
trap 'psql "$TEST_DATABASE_URL" -qX -c "drop database if exists $db" >/dev/null' EXIT

run() { psql "$url" -qX -v ON_ERROR_STOP=1 --set=VERBOSITY=terse -o /dev/null -f "$1"; }

run "$here/supabase_stub.sql"
for f in "$root"/supabase/migrations/*.sql; do run "$f"; done
run "$here/helpers.sql"
run "$here/fixtures.sql"

status=0
for t in "$here"/[0-9]*_test.sql; do
  echo "# $(basename "$t")"
  if ! run "$t" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /'; then
    status=1
  fi
done
if [ "$status" = 0 ]; then echo "All database access tests passed."; fi
exit $status
