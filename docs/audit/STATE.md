# TurnoGol Audit — Estado Actual

**Última actualización:** 2026-05-25
**Branch principal:** main
**Worktrees activos:** ninguno (B10 mergeado a main, worktree limpiado)

## Fase actual

**B11 — Operativo / Backups / Runbook** (siguiente, no iniciada)

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
| B8 — Money / Cashflow | 🟢 SOLID (0 bugs) + 4 P2/P3 docs | `docs/audit/reports/fase-b08-money-report.md` |
| B9 — Privacy / Ley 25.326 | 🟡 3 P1 FIXED + 4 P2 docs | `docs/audit/reports/fase-b09-privacy-report.md` |
| B10 — Observabilidad | 🟡 4 P1 FIXED + 2 P2 FIXED + 1 P2 investigado | `docs/audit/reports/fase-b10-observabilidad-report.md` |

## Hallazgos críticos acumulados

### P0 (bloqueantes)
- **B1: completeBooking/markNoShow no validaban tiempo** → ✅ FIXED

### P1 (alto)
- **B2: Pre-read mis-reservas/actions.ts sin contexto player** → ✅ FIXED
- **B3: createRefund permitía over-refund** → ✅ FIXED
- **B3: createRefund permitía double refund** → ✅ FIXED
- **B5: send-email double-dispatch bajo concurrencia** → ✅ FIXED (B10: estado `sending`, claim atómico `queued→sending`)
- **B6: PIN brute-force sin defensa** → ✅ FIXED
- **B9: ARCO Acceso endpoint ausente** → ✅ FIXED (`/api/player/data-export`)
- **B9: PII leak en send-email console.log** → ✅ FIXED
- **B9: Sentry sin PII scrubber** → ✅ FIXED (beforeSend + helper testeable)
- **B2: postgres user tiene BYPASSRLS** → 📝 Validar producción NO use role bypass (Fase B11)
- **B2: system_admins sin audit trigger** → ✅ FIXED (B10: trigger `trg_system_admins_audit` → audit_logs system-scoped)
- **B5: DLQ / failed-jobs visibility ausente** → ✅ FIXED (B10: `attachFailureHandlers` onComplete → Sentry+log)
- **B5: queue depth monitor ausente** → ✅ FIXED (B10: `GET /api/admin/jobs`)
- **B5: refresh-mp-tokens sin SELECT FOR UPDATE** → 📝 Fase B11
- **B6: Magic link TTL/single-use Supabase-managed** → 📝 Runbook B11
- **B6: JWT secret rotation Supabase-managed** → 📝 Runbook B11
- **B9: Páginas legales (/privacy, /terms) ausentes** → 📝 Pre-launch legal
- **B9: DPA templates ausentes** → 📝 Pre-launch legal
- **B9: Inscripción AAIP pendiente** → 📝 Pre-launch legal
- Pre-prod launch-check requiere env vars reales (Fase B11)
- Stress test requiere `NEXT_PUBLIC_E2E=1` env (Fase B11)
- ENCRYPTION_KEY rotation strategy no documentada (Fase B11)

### P2 (medio)
- 4 warnings `<img>` no-optimized (Fase F12)
- 2 E2E tests skipped en onboarding wizard (Fase F2)
- ~~Sentry init no degrada gracefully con DSN inválido~~ → ✅ FIXED (B10: `isValidDsn` guard)
- libuv assertion error stress test Windows-only (no aplica prod)
- ~~MP retry on InvalidTransitionError loser → Sentry filter~~ → ✅ FIXED (B10: `beforeSend` drop por `name`)
- B5: cron `generate-abonado-slots` sin comentario de intent → backlog
- B6: Server Actions CSRF = Next.js built-in (sin tokens custom) → backlog
- B7: 6 endpoints `[id]/{cancel,complete,no-show,status}` sin `parseRouteUuid()` → backlog
- B7: Output schema validation ausente en 34 endpoints → backlog
- B7: Error format inconsistente → backlog
- B7: No API versioning (`/api/v1/`) → backlog
- B7: Payload size limits = Next.js default 1MB → backlog
- B8: `product_sale` CashFlow no decrementa `products.stock` → by-design v1
- B8: edge `pesosToCents(1.005) = 100` → no aplica MP (2-decimal)
- B8: edge `calcDeposit(1, 10) = 0` → no aplica precios reales
- **B9: opt-out / consent withdrawal UI ausente** → v1.5 si se agregan emails marketing
- **B9: Audit log de ARCO Acceso diferido** → v1.5 con tabla global
- **B9: race-abonado-vs-individual flaky bajo orden específico de suite** → 🔍 INVESTIGADO (B10): pasa 2/2 aislado; falla en suite completa por data bleed cross-test (estado residual en misma cancha+franja), NO regresión B10. Fix de hermeticidad (cleanup por-test o cancha+slot únicos) deferido — P2 pre-existente

### P3 (bajo)
- B8: Reports SUM BIGINT → JS Number — pérdida potencial > 2^53 → no aplica rango realista

### Deferidos
- B2.6 Realtime cliente real → Fase F3
- ~~B2.7 JWT forgery defense~~ → Resuelto en B6 (Supabase signed tokens)

## Stats acumulados

- **Fases completadas: 11/26**
- **Tests nuevos: 147** (96 previos + 51 B10; todos verdes en aislamiento; suite integration total 1 flaky preexistente `race-abonado-vs-individual`)
- **Bugs fixed: 15** (1 P0 + 11 P1 + 3 P2). B10 aportó 4 P1 + 2 P2.
- **Tests legacy ajustados: 6**

## Próximas decisiones para el humano

1. **Mergear `audit/backend-b10` a main** → hecho en esta sesión (typecheck + 395 unit + 320 integration verdes; 1 flaky pre-existente no-regresión).
2. **B11 — Operativo / Backups / Runbook** es la siguiente fase. Consolida P1 pendientes asignados a B11: postgres BYPASSRLS en prod, refresh-mp-tokens sin SELECT FOR UPDATE, magic link / JWT rotation runbook, launch-check con env reales, ENCRYPTION_KEY rotation. Requiere infra real (backups Supabase, staging) → puede necesitar decisiones humanas.
3. **Flaky `race-abonado-vs-individual`**: investigado (no-regresión). Fix de hermeticidad de tests pendiente si se quiere suite 100% determinista — bajo prioridad.
