# TurnoGol Audit — Estado Actual

**Última actualización:** 2026-05-25
**Branch principal:** main
**Worktrees activos:** `audit/backend-b07` (en `../TurnoGol-audit-b07`)

## Fase actual

**B8 — Money Handling / Cashflow / Reportes** (siguiente, no iniciada)

## Fases completadas

| Fase | Veredicto | Report |
|------|-----------|--------|
| B0 — Baseline | 🟢 LIMPIO | `docs/audit/reports/fase-b00-baseline-report.md` |
| B1 — Motor Bookings | 🟡 1 P0 FIXED | `docs/audit/reports/fase-b01-motor-bookings-report.md` |
| B2 — RLS Multi-tenancy | 🟡 1 P1 FIXED + 2 P1 docs | `docs/audit/reports/fase-b02-rls-report.md` |
| B3 — MercadoPago | 🟡 2 P1 FIXED | `docs/audit/reports/fase-b03-mercadopago-report.md` |
| B4 — Billing SaaS | 🟢 SOLID (0 bugs) | `docs/audit/reports/fase-b04-billing-report.md` |
| B5 — Background Jobs | 🟡 1 P1 FIXED (parcial) + 3 P1 docs | `docs/audit/reports/fase-b05-jobs-report.md` |
| B6 — Auth / Seguridad | 🟡 1 P1 FIXED + 2 P1 docs | `docs/audit/reports/fase-b06-auth-report.md` |
| B7 — API Contracts | 🟡 1 P2 FIXED + 4 P2 docs | `docs/audit/reports/fase-b07-api-contracts-report.md` |

## Hallazgos críticos acumulados

### P0 (bloqueantes)
- **B1: completeBooking/markNoShow no validaban tiempo** → ✅ FIXED

### P1 (alto)
- **B2: Pre-read mis-reservas/actions.ts sin contexto player** → ✅ FIXED
- **B3: createRefund permitía over-refund** → ✅ FIXED
- **B3: createRefund permitía double refund** → ✅ FIXED
- **B5: send-email double-dispatch bajo concurrencia** → 🟡 PARCIAL FIXED. Fix completo requiere migration enum `sending` → Fase B10
- **B6: PIN brute-force sin defensa** → ✅ FIXED (rate limit `pinAttempts` 5/5min/tenant fail-closed)
- **B2: postgres user tiene BYPASSRLS** → 📝 Validar producción NO use role bypass (Fase B11)
- **B2: system_admins sin audit trigger** → 📝 Fix asignado a Fase B10
- **B5: DLQ / failed-jobs visibility ausente** → 📝 Fase B10 Observabilidad
- **B5: queue depth monitor ausente** → 📝 Fase B10
- **B5: refresh-mp-tokens sin SELECT FOR UPDATE** → 📝 Fase B11
- **B6: Magic link TTL/single-use Supabase-managed** → 📝 Runbook B11
- **B6: JWT secret rotation Supabase-managed** → 📝 Runbook B11
- Pre-prod launch-check requiere env vars reales (Fase B11)
- Stress test requiere `NEXT_PUBLIC_E2E=1` env (Fase B11)
- ENCRYPTION_KEY rotation strategy no documentada (Fase B11)

### P2 (medio)
- 4 warnings `<img>` no-optimized (Fase F12)
- 2 E2E tests skipped en onboarding wizard (Fase F2)
- Sentry init no degrada gracefully con DSN inválido (Fase B10)
- libuv assertion error stress test Windows-only (no aplica prod)
- MP retry on InvalidTransitionError loser → Sentry filter en B10
- B5: cron `generate-abonado-slots` sin comentario de intent → backlog
- B6: Server Actions CSRF = Next.js built-in (sin tokens custom) → backlog
- **B7: 6 endpoints `[id]/{cancel,complete,no-show,status}` sin `parseRouteUuid()`** → backlog (mitigado parcial por tx rollback)
- **B7: Output schema validation ausente en 34 endpoints** → backlog
- **B7: Error format inconsistente (`{error: string}` vs `{error: {code,message}}`)** → backlog
- **B7: No API versioning (`/api/v1/`)** → backlog antes de Año 2
- **B7: Payload size limits = Next.js default 1MB** → backlog

### Deferidos
- B2.6 Realtime cliente real → Fase F3
- ~~B2.7 JWT forgery defense~~ → Resuelto en B6 (Supabase signed tokens)

## Stats acumulados

- **Fases completadas: 8/26**
- **Tests nuevos: 59** (todos verdes)
- **Bugs fixed: 7** (1 P0 + 4 P1 + 1 P1 parcial + 1 P2)
- **Tests legacy ajustados: 3**

## Próximas decisiones para el humano

1. **Mergear `audit/backend-b07` a main** (recomendado: sí)
2. **¿Continuar B8 o pausar?** B8 (Money/Cashflow) es liviano — 1 sesión. Después B9-B11 son operativas/runbook.
