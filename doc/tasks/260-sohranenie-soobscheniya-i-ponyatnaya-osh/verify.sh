#!/usr/bin/env bash
set -euo pipefail
: "${NOVA_HOME:?Set NOVA_HOME to the installed Nova distribution}"
export NOVA_STD_PATH="$NOVA_HOME/std"
export NOVA_CG_INCLUDE="$NOVA_HOME"
export NOVA_RT_DIR="$NOVA_HOME/nova_rt"
export NOVA_GC_LIB_DIR="$NOVA_HOME/gc/lib"
export NOVA_GC_INCLUDE_DIR="$NOVA_HOME/gc/include"
if command -v cygpath >/dev/null 2>&1; then
  export PATH="$(cygpath -u "$NOVA_HOME"):$PATH"
else
  export PATH="$NOVA_HOME:$PATH"
fi
guards() {
  bash scripts/guards/run-all.sh
  source scripts/guards/lib/find-python.sh
  find_python
  $PYTHON scripts/guards/guard-secrets.py --tree
  $PYTHON scripts/guards/guard-commit-message.py --commit HEAD
}
case "${1:-targeted}" in
  build) "$NOVA_HOME/nova.exe" build src/crew_hub.nv -o target/crew-hub.exe ;;
  targeted) "$NOVA_HOME/nova.exe" test src/server_delivery_live --jobs 1 --timeout 300 --keep-artifacts ;;
  core) "$NOVA_HOME/nova.exe" test src/server --jobs 1 --timeout 900 --keep-artifacts ;;
  ui)
    node --test --test-concurrency=4 'src/web/test/*.test.mjs'
    node src/web/test/delivery-browser.mjs "$2" "$3"
    guards
    ;;
  server) "$NOVA_HOME/nova.exe" test src/acp src/server src/server_live src/server_delivery_live --jobs 1 --timeout 900 --keep-artifacts ;;
  final)
    node --test --test-concurrency=4 'src/web/test/*.test.mjs'
    node src/web/test/delivery-browser.mjs "$2" "$3"
    guards
    "$NOVA_HOME/nova.exe" test src/server_delivery_live --jobs 1 --timeout 300 --keep-artifacts
    "$NOVA_HOME/nova.exe" test src/server --jobs 1 --timeout 900 --keep-artifacts
    "$NOVA_HOME/nova.exe" build src/crew_hub.nv -o target/crew-hub.exe
    ;;
  full)
    node --test --test-concurrency=4 'src/web/test/*.test.mjs'
    "$NOVA_HOME/nova.exe" build src/crew_hub.nv -o target/crew-hub.exe
    "$NOVA_HOME/nova.exe" test src/acp src/server src/server_live src/server_delivery_live --jobs 1 --timeout 900 --keep-artifacts
    guards
    ;;
esac
