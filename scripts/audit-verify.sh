#!/bin/bash
# === JUEZ INMUTABLE — Claude NO debe modificar este archivo ===
set -e

echo "=== [1/3] TypeCheck ==="
pnpm typecheck
echo "✅ TypeCheck pasó"

echo "=== [2/3] Lint ==="
pnpm lint
echo "✅ Lint pasó"

echo "=== [3/3] Tests unitarios ==="
pnpm test
echo "✅ Tests pasaron"

echo ""
echo "🟢 VERIFICACIÓN COMPLETA — Todos los checks pasaron"
