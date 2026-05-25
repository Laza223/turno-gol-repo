# TurnoGol Audit — Estado Actual

**Última actualización:** 2026-05-24
**Branch principal:** main
**Worktrees activos:** `audit/backend-b02` (en `../TurnoGol-audit-b02`)

## Fase actual

**B3 — MercadoPago** (siguiente, no iniciada)

## Fases completadas

| Fase | Veredicto | Report |
|------|-----------|--------|
| B0 — Baseline | 🟢 LIMPIO | `docs/audit/reports/fase-b00-baseline-report.md` |
| B1 — Motor Bookings | 🟡 1 P0 FIXED | `docs/audit/reports/fase-b01-motor-bookings-report.md` |
| B2 — RLS Multi-tenancy | 🟡 1 P1 FIXED + 2 P1 documentados | `docs/audit/reports/fase-b02-rls-report.md` |

## Hallazgos críticos acumulados

### P0 (bloqueantes)
- **B1: completeBooking/markNoShow no validaban tiempo** → ✅ FIXED

### P1 (alto)
- **B2: Pre-read en mis-reservas/actions.ts:42 sin contexto player** → ✅ FIXED
- **B2: postgres user tiene BYPASSRLS** → 📝 Validar producción NO use role bypass (Fase B11)
- **B2: system_admins sin audit trigger** → 📝 Fix asignado a Fase B10
- Pre-prod launch-check requiere env vars reales (Fase B11)
- Stress test requiere `NEXT_PUBLIC_E2E=1` env (Fase B11)

### P2 (medio)
- 4 warnings `<img>` no-optimized (Fase F12)
- 2 E2E tests skipped en onboarding wizard (Fase F2)
- Sentry init no degrada gracefully con DSN inválido (Fase B10)
- libuv assertion error stress test Windows-only (no aplica prod)

### Deferidos
- B1.8 Online sin deposit + MP webhook tardío → Fase B3
- B2.6 Realtime cliente real → Fase F3
- B2.7 JWT forgery defense → Fase B6

## Próximas decisiones para el humano

1. **Mergear `audit/backend-b02` a main** (recomendado: sí)
2. **Arrancar Fase B3 — MercadoPago** (recomendado: sí)
