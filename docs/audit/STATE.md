# TurnoGol Audit — Estado Actual

**Última actualización:** 2026-05-26
**Branch principal:** main
**Worktrees activos:** ninguno (F3 mergeado a main)

## Fase actual

**F4 — Admin Bookings + Cashflow + Canchas (CRUDs core)** (siguiente, no iniciada)

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
| B11 — Operativo / Backups / Runbook | 🟡 1 P0 FIXED + 5 P1 FIXED + 3 P1 deferred-legal | `docs/audit/reports/fase-b11-operativo-report.md` |
| F0 — Baseline + Build Health | 🟢 PASS (4/4 criteria) + 2 dead-weight removidos | `docs/audit/reports/fase-f00-baseline-report.md` |
| F1 — Design System + UI Base | 🟢 PASS (2/2 criteria) + 3 primitives nuevos + 1 latent fix Sentry | `docs/audit/reports/fase-f01-design-system-report.md` |
| F2 — Auth + Onboarding Flows | 🟢 PASS (3/3 criteria) + 4 E2E nuevos + 2 reactivados + 6 a11y fixes wizard | `docs/audit/reports/fase-f02-auth-onboarding-report.md` |
| F3 — Admin Grilla + Realtime | 🟡 PASS c/1 reserva (3/4 criteria; Lighthouse 88-89 medido, gap LCP→F12) + H1 catch-up + H2 publication versionada + H3 name backfill + 10 tests nuevos | `docs/audit/reports/fase-f03-grilla-realtime-report.md` |

## Hallazgos críticos acumulados

### P0 (bloqueantes)
- **B1: completeBooking/markNoShow no validaban tiempo** → ✅ FIXED
- **B11: CI aplicaba migrations divergentes vs prod** → ✅ FIXED (B11 T1: porteadas 010-012 a src/shared/db/migrations/ + convención en docs/MIGRATIONS.md)

### P1 (alto)
- **B2: Pre-read mis-reservas/actions.ts sin contexto player** → ✅ FIXED
- **B3: createRefund permitía over-refund** → ✅ FIXED
- **B3: createRefund permitía double refund** → ✅ FIXED
- **B5: send-email double-dispatch bajo concurrencia** → ✅ FIXED (B10: estado `sending`, claim atómico `queued→sending`)
- **B6: PIN brute-force sin defensa** → ✅ FIXED
- **B9: ARCO Acceso endpoint ausente** → ✅ FIXED (`/api/player/data-export`)
- **B9: PII leak en send-email console.log** → ✅ FIXED
- **B9: Sentry sin PII scrubber** → ✅ FIXED (beforeSend + helper testeable)
- **B2: postgres user tiene BYPASSRLS** → ✅ FIXED (B11: launch-check valida `pg_roles.rolbypassrls = false` para current_user)
- **B2: system_admins sin audit trigger** → ✅ FIXED (B10: trigger `trg_system_admins_audit` → audit_logs system-scoped)
- **B5: DLQ / failed-jobs visibility ausente** → ✅ FIXED (B10: `attachFailureHandlers` onComplete → Sentry+log)
- **B5: queue depth monitor ausente** → ✅ FIXED (B10: `GET /api/admin/jobs`)
- **B5: refresh-mp-tokens sin SELECT FOR UPDATE** → ✅ FIXED (B11: `pg_try_advisory_xact_lock(hashtext('mp_refresh:'||tenant_id))` co-transaccional; single-winner test 5x concurrente)
- **B6: Magic link TTL/single-use Supabase-managed** → ✅ FIXED docs (B11: doc19 §3.10)
- **B6: JWT secret rotation Supabase-managed** → ✅ FIXED docs (B11: doc19 §3.11)
- **B9: Páginas legales (/privacy, /terms) ausentes** → ✅ FIXED (B11: páginas server-render Ley 25.326 + footer reutilizable)
- **B9: DPA templates ausentes** → 📝 Pre-launch legal (counsel team, fuera de scope code)
- **B9: Inscripción AAIP pendiente** → 📝 Pre-launch legal (trámite administrativo)
- **Pre-prod launch-check requiere env vars reales** → ✅ FIXED (B11: launch-check probe MP credentials via POST /oauth/token)
- **Stress test requiere `NEXT_PUBLIC_E2E=1` env** → ✅ FIXED docs (B11: doc19 §4.4 ritual)
- **ENCRYPTION_KEY rotation strategy no documentada** → ✅ FIXED (B11: doc19 §3.12 v1 single-key + forced reconnection; v1.5 key versioning; launch-check valida strength + no-placeholder)
- **Backup restore drill (ejecución real)** → 📝 Pre-launch operacional (procedure documentado en doc19 §10.6; ejecución requiere Supabase Pro + horas ops)
- **F3-H1: catch-up ausente en reconnect realtime** (grilla pierde eventos del gap offline; Supabase sin queue offline) → ✅ FIXED (F3 T1: `fetchFromApi()` en cada SUBSCRIBED + 7 unit tests)
- **F3-H2: publication realtime de `bookings` no versionada** (solo dashboard → re-provision/staging sin realtime, silencioso) → ✅ FIXED (F3 T2: migración guarded dual-tree `013_realtime_publication.sql` + REPLICA IDENTITY FULL)

### P2 (medio)
- 4 warnings `<img>` no-optimized (Fase F12)
- ~~2 E2E tests skipped en onboarding wizard~~ → ✅ RESUELTO F2 (fresh admin fixture sin tenant; 2 reactivados + 1 nuevo full-wizard test)
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
- **B9: race-abonado-vs-individual flaky bajo orden específico de suite** → 🔍 INVESTIGADO (B10 + B11): pasa 2/2 aislado; falla en suite completa por data bleed cross-test, NO regresión. Fix de hermeticidad deferido — P2 pre-existente
- **F0-surfaced: `daily-close-idempotency.test.ts` (B8.4) falla contra test-DB local con estado residual** → 🔍 CONFIRMADO pre-existente (falla idéntica en main 687cccd sin cambios F0). Espera DB limpia (`balance=1000000`); residual `cash_flows` de corridas previas lo rompe. CI (contenedor limpio/job) verde. Misma clase de hermeticidad que race-abonado. P2 backlog: agregar truncate/cleanup por-test o bootstrap fresco. NO bloquea — F0 no toca cash/DB
- **B11: ENCRYPTION_KEY key versioning** → v1.5 (trigger: si primera rotación real expone fricción operativa de v1)
- **B11: Supabase staging project dedicado** → v1.5 (trigger: 10+ clientes o requisito contractual)
- **B11: CI stress test job (manual_dispatch)** → backlog nice-to-have
- **F0/F1: `lucide-react` pinned a `^1.11.0`** (release 2021; línea mantenida es 0.4xx, semver invertido) → **F1 lo evaluó y mantuvo diferido**: F1 done-criteria no requiere upgrade; tocaría 42 archivos con riesgo de breaking API. Trigger para re-evaluar: CVE en versión vieja, o necesidad de icono no disponible. `optimizePackageImports` (F0) ya hace tree-shake efectivo
- **F0: shared baseline 150KB** (Sentry SDK pesado en chunk común) → F12. **F3 confirmó que es el driver del LCP 3.8s de /grilla** (Lighthouse 88-89; opportunities unused-JS ~900ms + render-blocking ~485ms). F12 done-criteria = LCP <2.5s
- **F0: `/staff` 190KB** (la ruta más cercana al techo de 200KB) → watch / candidato F12
- **F0: Lighthouse assertion `error` (bloqueante) + corrida CI Linux** → F12/F14 (F0 dejó `warn` + config lista)
- **F0: medición Lighthouse de rutas dinámicas** (grilla/dashboard/explorar, requieren auth+DB) → 🔍 `/grilla` MEDIDO en F3: **88-89 mobile** (gap 1-2 pts, LCP-driven → F12). Harness autenticado entregado (`pnpm lighthouse:grilla` + puppeteerScript cookie inject). dashboard/explorar → F6/F12
- **F3: `/grilla` Lighthouse 88-89 < 90** (LCP 3.8s; banner offline es el LCP element en run headless + shared bundle 150KB) → **F12 (Performance)**. F3 entregó medición + harness honesto; el gap es estructural

### P3 (bajo)
- B8: Reports SUM BIGINT → JS Number — pérdida potencial > 2^53 → no aplica rango realista

### Deferidos
- ~~B2.6 Realtime cliente real~~ → ✅ RESUELTO F3 (catch-up on reconnect + debounced reconcile name-backfill + publication realtime versionada + REPLICA IDENTITY FULL + 7 unit tests del hook + 3 E2E multi-browser)
- ~~B2.7 JWT forgery defense~~ → Resuelto en B6 (Supabase signed tokens)

## Stats acumulados

- **Fases completadas: 16/26** (backend B0-B11 + F0 + F1 + F2 + F3 frontend).
- **Tests acumulados nuevos audit: 181** (171 post-F2 + F3: 7 unit hook `use-booking-realtime` + 3 E2E `grilla-realtime`). Unit suite 411→418. E2E suite +3 (delegados a CI). Integration 325/325 (los 2 flaky pre-existentes `race-abonado`/`daily-close` no flakearon esta corrida; la migración F3 T2 no agregó fallas).
- **Bugs fixed: 30** (25 post-F2 + F3: H1 catch-up realtime P0-fase + H2 publication no versionada P1 + H3 name backfill P2 + H7 tooling setCookie P2 + H8 tooling falso-positivo P2). H4/H5/H6 de F3 son hardening/cobertura (REPLICA IDENTITY FULL, F1 primitives, tests), no bugs de runtime.
- **Tests legacy ajustados: 7** (6 previos + 1 B11).
- **Deps nuevas (devDependencies): `@testing-library/react` + `happy-dom`** (F3 T1, para `renderHook` del hook realtime).
- **Migraciones nuevas: 1** (F3 `013_realtime_publication.sql` ↔ `20260526000001`, dual-tree, guarded).

## Próximas decisiones para el humano

1. **F3 — Admin Grilla + Realtime** → ✅ completado esta sesión, mergeado a main. 3/4 done-criteria plenos (multi-browser E2E <2s, catch-up FIXED + tested, mobile usable) + #4 Lighthouse **88-89 medido** (1-2 pts corto, gap LCP estructural → F12). 8 hallazgos resueltos (H1-H8). 1 migración realtime versionada. **Decisión de schema (T2):** migración aditiva/idempotente/guarded de publication realtime — no-op en prod existente, cierra riesgo silencioso en re-provision.
2. **B11 backlog operacional (no code):** ejecutar backup restore drill 1 vez (doc19 §10.6), counsel review DPA template, AAIP inscripción. Todos pre-launch, no bloquean siguiente fase.
3. **F4 — Admin Bookings + Cashflow + Canchas (CRUDs core)** es la siguiente fase. **Criticidad 🔴🔴 Alta.** Cada CRUD happy path + 3 edge cases E2E, confirmaciones destructivas escalonadas, optimistic updates donde aplique. Trigger humano: confirmar continuar o pausar.
4. **Pendiente F12 (Performance):** `/grilla` Lighthouse 88-89 (LCP 3.8s vía shared bundle 150KB Sentry). Harness autenticado (`pnpm lighthouse:grilla`) listo para re-medir tras el adelgazamiento del bundle.
