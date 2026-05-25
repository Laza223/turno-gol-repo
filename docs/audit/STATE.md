# TurnoGol Audit — Estado Actual

**Última actualización:** 2026-05-24
**Branch principal:** main
**Worktrees activos:** `audit/backend-b01` (en `../TurnoGol-audit-b01`)

## Fase actual

**B2 — RLS Multi-tenancy** (siguiente, no iniciada)

## Plan en ejecución

(ninguna fase en curso — esperando decisión humano sobre merge B1 + arranque B2)

## Fases completadas

| Fase | Veredicto | Report |
|------|-----------|--------|
| B0 — Baseline | 🟢 LIMPIO | `docs/audit/reports/fase-b00-baseline-report.md` |
| B1 — Motor Bookings | 🟡 1 P0 FIXED + 11 tests nuevos | `docs/audit/reports/fase-b01-motor-bookings-report.md` |

## Hallazgos críticos acumulados

### P0 (bloqueantes)
- **B1: completeBooking/markNoShow no validaban tiempo** → ✅ FIXED en commit `audit(b01): fix admin can complete/no-show future bookings (P0)`. Tests verdes.

### P1 (alto)
- Pre-prod launch-check requiere env vars reales (validar antes deploy real — Fase B11)
- Stress test requiere `NEXT_PUBLIC_E2E=1` env (documentar en runbook — Fase B11)

### P2 (medio)
- 4 warnings `<img>` no-optimized en login/register/landing (Fase F12)
- 2 E2E tests skipped en onboarding wizard (Fase F2)
- Sentry init no degrada gracefully con DSN inválido (Fase B10)
- libuv assertion error stress test Windows-only (no aplica prod Linux, documentado en fase-b01-raw/audit-structural.md)

### P3 (deuda menor)
- B1.8 Online sin deposit + MP webhook tardío DEFERIDO a Fase B3
- Server Actions admin no capturan BookingNotYetEndedError/BookingNotYetStartedError aún (relevante Fase F4)
- Exponer nuevas error classes en API contracts doc15 (Fase B7)

## Próximas decisiones para el humano

1. **Mergear `audit/backend-b01` a main vía PR** (recomendado: sí — fix P0 + 11 tests + report)
2. **Arrancar Fase B2 — RLS Multi-tenancy** (recomendado: sí, motor validado)
3. **Skip recommendations**: B1.8 ya planificado para B3, no se pierde.

## Convenciones de actualización

Al iniciar una fase:
- Cambiar "Fase actual" a la nueva
- Referenciar plan detallado en "Plan en ejecución"
- Crear worktree y registrarlo en "Worktrees activos"

Al completar una fase:
- Mover a "Fases completadas" con link al report
- Agregar hallazgos críticos a sección correspondiente
- Limpiar worktree o dejar para siguiente fase del mismo bloque
