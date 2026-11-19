#!/usr/bin/env bash
# Pruebas de CAJA NEGRA: solo entradas HTTP → salidas (código de estado), sin mirar el código.
# Uso: scripts/caja-negra.sh [URL_API]   (por defecto la API pública en Render)
set -uo pipefail
API=${1:-https://canchero-api-givn.onrender.com}/api
ok=0; fallo=0

caso() { # caso "descripción" código_esperado curl-args...
  local desc=$1 esperado=$2; shift 2
  local real; real=$(curl -s -o /dev/null -w '%{http_code}' --max-time 90 "$@")
  if [[ $real == "$esperado" ]]; then ok=$((ok+1)); echo "OK    [$real] $desc"
  else fallo=$((fallo+1)); echo "FALLO [$real≠$esperado] $desc"; fi
}

caso "Salud del servicio"                           200 "${API%/api}/health"
caso "Catálogo público de tipos de cancha"          200 "$API/catalog/court-types"
caso "Listado público de sedes"                     200 "$API/venues"
caso "Sede inexistente → 404"                       404 "$API/venues/999999999"
caso "Perfil sin token → 401"                       401 "$API/auth/me"
caso "Token falso → 401"                            401 -H "Authorization: Bearer falso" "$API/auth/me"
caso "Caja sin token → 401"                         401 "$API/cash/boxes"
caso "Crear sede sin token → 401"                   401 -X POST -H 'Content-Type: application/json' -d '{}' "$API/venues"
caso "Login con cuerpo vacío → 400"                 400 -X POST -H 'Content-Type: application/json' -d '{}' "$API/auth/login"
caso "Login con credenciales inválidas → 401"       401 -X POST -H 'Content-Type: application/json' \
  -d '{"email":"no-existe-cajanegra@example.com","password":"incorrecta123"}' "$API/auth/login"

echo "— $ok correctos, $fallo fallidos"
[[ $fallo == 0 ]]
