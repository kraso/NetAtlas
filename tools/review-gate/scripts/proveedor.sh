#!/usr/bin/env bash
# Transporte del gate de review.
#
# El wrapper (tools/review-gate) construye el prompt —alcance por hunks y
# contrato de hallazgos— y este shim solo ejecuta el proveedor, reutilizando la
# resolución de GGA (la misma que usa `gga run`): cambiar de proveedor se hace en
# el `.gga`, en un solo sitio, y el gate no reimplementa credenciales ni CLIs.
#
# Contrato: el prompt entra por stdin, la respuesta del proveedor sale por stdout
# y los diagnósticos por stderr. Códigos: 0 respuesta, 3 configuración o
# librería ausente, y el que devuelva el proveedor (124 si agota el tope).
#
# No se usa `set -u`: la librería de GGA asume las variables de su CLI.

PROMPT="$(cat)"
TIMEOUT="${TIMEOUT:-420}"

if [[ -z "${PROVIDER:-}" ]]; then
  echo "gate: falta el proveedor (PROVIDER en .gga o GGA_PROVIDER)" >&2
  exit 3
fi

# Mismo orden de búsqueda que GGA, incluida la conversión de rutas de Git Bash.
resolver_lib() {
  local bin="${GGA_BIN:-$(command -v gga 2>/dev/null || true)}"
  local dir=""
  local candidatos=()
  [[ -n "${GGA_LIB_DIR:-}" ]] && candidatos+=("${GGA_LIB_DIR}")
  if [[ -n "$bin" ]]; then
    dir="$(dirname "$bin")"
    candidatos+=("$dir/lib/gga" "$dir/../lib/gga" "$dir/../lib")
  fi
  local candidato
  for candidato in "${candidatos[@]}"; do
    if [[ -n "$candidato" && -f "$candidato/providers.sh" ]]; then
      printf '%s\n' "$candidato"
      return 0
    fi
  done
  return 1
}

if ! LIB_DIR="$(resolver_lib)"; then
  echo "gate: no encuentro la librería de GGA (providers.sh). Instala GGA o apunta GGA_LIB_DIR a su directorio lib/gga." >&2
  exit 3
fi

# shellcheck source=/dev/null
source "$LIB_DIR/providers.sh"

if ! declare -F execute_provider_with_timeout >/dev/null; then
  echo "gate: la librería de GGA en $LIB_DIR no expone execute_provider_with_timeout (¿versión distinta?); el gate espera v2.10.1" >&2
  exit 3
fi

if ! validate_provider "$PROVIDER" >&2; then
  exit 3
fi

execute_provider_with_timeout "$PROVIDER" "$PROMPT" "$TIMEOUT"
exit $?
