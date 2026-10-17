---
name: audit
description: Audita una capa específica del codebase siguiendo el Método Karpathy
---

# Auditoría por capa

## Instrucciones
1. Leé `docs/audit/PROGRESS.md` para saber en qué capa estás
2. Leé `CLAUDE.md` § Guardrails (la línea "En auditoría: citar archivo + línea…") para los criterios de calidad
3. Ejecutá la capa indicada siguiendo las reglas de acciones (SIEMPRE/PREGUNTAR/NUNCA)
4. Para cada hallazgo:
   - Si es fix obvio → arreglalo, corré `bash scripts/audit-verify.sh`, registrá en PROGRESS.md
   - Si es decisión de negocio → anotalo como "REQUIERE INPUT" y seguí
5. Al terminar la capa, marcala como [x] en PROGRESS.md
6. Mostrá tabla resumen y esperá confirmación para seguir
