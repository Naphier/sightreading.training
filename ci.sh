#!/usr/bin/env bash
# Only run inside the disposable CI image; never against a deployment database.
set -euo pipefail
[[ -f /usr/local/share/sightreading-disposable-ci && -f /etc/debian_version && -d /etc/postgresql/15/main ]] || { echo 'Use the repository CI Docker image.' >&2; exit 1; }
# Trust applies only to the isolated throwaway CI cluster, which publishes no port.
printf 'local all all trust\nhost all all 127.0.0.1/32 trust\nhost all all ::1/128 trust\n' > /etc/postgresql/15/main/pg_hba.conf
pg_ctlcluster 15 main start
trap 'pg_ctlcluster 15 main stop' EXIT
createdb -h 127.0.0.1 -U postgres sightreading
psql -X -h 127.0.0.1 -U postgres -d sightreading -v ON_ERROR_STOP=1 -f schema.sql > /dev/null
lapis migrate development
createdb -h 127.0.0.1 -U postgres sightreading_test
pg_dump -h 127.0.0.1 -U postgres --schema-only sightreading | psql -X -h 127.0.0.1 -U postgres -d sightreading_test -v ON_ERROR_STOP=1 > /dev/null
pg_dump -h 127.0.0.1 -U postgres --data-only -t lapis_migrations sightreading | psql -X -h 127.0.0.1 -U postgres -d sightreading_test -v ON_ERROR_STOP=1 > /dev/null
exec_status=0
# Compilation also produces *_spec.lua; select only source specs so each runs once.
busted --pattern='_spec%.moon$' -o utfTerminal || exec_status=$?
exit "$exec_status"
