#!/usr/bin/env bash
# Respaldo completo de la BD (esquema + datos: usuarios, sedes, reservas, caja...).
# Uso: scripts/backup-db.sh            → backups/canchero-AAAAMMDD-HHMM.dump
# Lee SPRING_DATASOURCE_* de .env.local (o del entorno). Requiere pg_dump >= versión del servidor.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  while IFS='=' read -r k v; do
    [[ $k == SPRING_DATASOURCE_* && -z ${!k:-} ]] && export "$k=${v%$'\r'}"
  done < <(grep -E '^SPRING_DATASOURCE_' .env.local)
fi
: "${SPRING_DATASOURCE_URL:?falta SPRING_DATASOURCE_URL}" "${SPRING_DATASOURCE_USERNAME:?}" "${SPRING_DATASOURCE_PASSWORD:?}"

# jdbc:postgresql://host:puerto/bd?params → host/puerto/bd para libpq
url=${SPRING_DATASOURCE_URL#jdbc:postgresql://}
hostport=${url%%/*}; db=${url#*/}; db=${db%%\?*}
export PGHOST=${hostport%%:*} PGPORT=${hostport##*:} PGDATABASE=$db
[[ $PGPORT == "$PGHOST" ]] && PGPORT=5432
export PGUSER=$SPRING_DATASOURCE_USERNAME PGPASSWORD=$SPRING_DATASOURCE_PASSWORD PGSSLMODE=${PGSSLMODE:-require}

mkdir -p backups
out="backups/canchero-$(date +%Y%m%d-%H%M).dump"
# Solo el esquema de la app; auth/storage los gestiona Supabase.
pg_dump --format=custom --no-owner --no-privileges --schema=public --file="$out"
chmod 600 "$out"
echo "Respaldo creado: $out ($(du -h "$out" | cut -f1))"
pg_restore --list "$out" | grep -c 'TABLE DATA' | xargs echo "Tablas con datos:"

# Conserva los 14 respaldos más recientes.
ls -1t backups/canchero-*.dump | tail -n +15 | xargs -r rm --
