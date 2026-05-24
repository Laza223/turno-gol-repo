# TurnoGol Audit — Estado Actual

**Última actualización:** 2026-05-24
**Branch principal:** main
**Worktrees activos:** `audit/backend-b00` (en `../TurnoGol-audit-b00`)

## Fase actual

**B1 — Motor de Reservas** (siguiente, no iniciada)

## Plan en ejecución

(ninguna fase en curso — esperando decisión humano sobre merge B0 + arranque B1)

## Fases completadas

| Fase | Veredicto | Report |
|------|-----------|--------|
| B0 — Baseline | 🟢 LIMPIO | `docs/audit/reports/fase-b00-baseline-report.md` |

## Hallazgos críticos acumulados

### P0 (bloqueantes)
- Ninguno

### P1 (alto)
- Pre-prod launch-check requiere env vars reales (validar antes deploy real — Fase B11)
- Stress test requiere `NEXT_PUBLIC_E2E=1` env (documentar en runbook — Fase B11)

### P2 (medio)
- 4 warnings `<img>` no-optimized en login/register/landing (Fase F12)
- 2 E2E tests skipped en onboarding wizard (Fase F2)
- Sentry init no degrada gracefully con DSN inválido (Fase B10)
- libuv assertion error en cleanup stress test Windows (investigar Fase B1 o B5)

## Próximas decisiones para el humano

1. **Mergear `audit/backend-b00` a main vía PR** (recomendado: sí)
2. **Arrancar Fase B1 — Motor de Reservas** (recomendado: sí, baseline limpio)
3. **Cosmético**: ¿agregar script `pnpm dev:e2e` con `NEXT_PUBLIC_E2E=1`?

## Convenciones de actualización

Al iniciar una fase:
- Cambiar "Fase actual" a la nueva
- Referenciar plan detallado en "Plan en ejecución"
- Crear worktree y registrarlo en "Worktrees activos"

Al completar una fase:
- Mover a "Fases completadas" con link al report
- Agregar hallazgos críticos a sección correspondiente
- Limpiar worktree o dejar para siguiente fase del mismo bloque
