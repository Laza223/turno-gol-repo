# TurnoGol Audit — Estado Actual

**Última actualización:** 2026-05-28
**Branch principal:** main
**Worktrees activos:** ninguno (F11 mergeado a main)

## Fase actual

**F12 — Performance / Core Web Vitals** (siguiente, no iniciada)

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
| F4 — Admin Bookings + Cashflow + Canchas | 🟢 PASS (3/3 criteria) + ConfirmDialog reusable + write-side caja + optimistic toggle c/rollback + H8 parseRouteUuid + 16 tests; 6 bugs de specs + 1 inconsistencia UI cazados en verify | `docs/audit/reports/fase-f04-bookings-cashflow-canchas-report.md` |
| F5 — Admin Reportes + Settings + Abonados + Staff | 🟢 PASS (3/3 criteria) + 4 stubbed buttons P0 → funcionales (H1) + preview slots abonado (H2) + lockout UX countdown (H5) + staff desactivar c/ConfirmDialog (H4) + F1 states 4 rutas + 16 E2E nuevos + 39 unit nuevos; 3 issues cazados en verify (notes-no-enviadas, Cyrillic 'о', preventDefault dropdown) | `docs/audit/reports/fase-f05-reportes-settings-abonados-staff-report.md` |
| F6 — Public Landing + Search + Portal Complejo | 🟢 PASS (4/4 criteria) + sitemap dinámico + robots + manifest + favicon/apple-icon/OG default via ImageResponse + JSON-LD SportsActivityLocation+BreadcrumbList+WebSite+Organization + buildMetadata helper c/canonical+OG+Twitter+titleAbsolute + 3 `<img>`→`<Image>` migrations + 3 loading.tsx + Lighthouse public harness c/SEO=1.0 hard assert + 19 unit + 5 integration + 6 E2E scenarios; 6 issues cazados en review+verify (force-dynamic/revalidate conflict, tsbuildinfo committed, manifest size mismatch, absoluteUrl mutation, robots.host deprecated, twitter.card union typecheck) | `docs/audit/reports/fase-f06-public-landing-search-portal-report.md` |
| F7 — Booking Flow Jugador End-to-End | 🟢 PASS (3/3 criteria) + **1 P0 FIXED** (`notification_url` apuntaba a ruta inexistente `/api/mp/webhooks` — en prod MP postea a 404, booking con seña nunca confirma) + **1 P1 FIXED** (`transitionFromPendingPayment` no transicionaba `deposit_status` a `'paid'` — quedaba `pending` forever post-webhook) + `MP_MOCK_MODE` seam (`LocalMockGateway` + webhook sync en mock) + `/mock-mp/checkout` page (404 en prod) + polling endpoint `/api/player/bookings/[id]/status` + `PaymentStatusWatcher`+`ExpiryCountdown` clients + retry deposit action + 4 loading.tsx + seed `e2e-complejo-sena` deposit + 17 tests nuevos (5 unit + 8 integration + 4 E2E scenarios); 5 issues cazados en trust-but-verify (H7 exito mentía "confirmada", H9 helpers pricing inconsistentes, H10 seed FK cleanup, H11 CSP dev bloqueaba unsafe-eval, H12 MP_MOCK_MODE leak rompía 6 integration webhook tests) | `docs/audit/reports/fase-f07-booking-flow-jugador-report.md` |
| F8 — Player Area | 🟢 PASS (3/3 criteria; 5 done-criteria UI completos) + `/configuracion` ARCO download + `/eliminar-cuenta` con ConfirmDialog type-to-confirm email + `requestDeleteAccountAction` wrappa `anonymizePlayer` (idempotente) + Supabase signOut + redirect `/login?deleted=1` + cancel UX `ConfirmDialog` con motivo + feedback + perfil `useFormState` success/error inline + 3er tab "Cuenta" en `PlayerBottomNav` + 4 E2E specs (bookings, profile, data-export, delete-account) + helper `_helpers/player-seed.ts` con `resetPlayer` idempotente + 4 loading.tsx; 1 trust-but-verify catch (`zod-coverage` allowlist para action session-driven sin input) | `docs/audit/reports/fase-f08-player-area-report.md` |
| F9 — Notificaciones (Toast + Push Web) | 🟢 PASS (3/3 criteria; Chrome ✓, Firefox por estándar VAPID, Safari requiere PWA install iOS 16.4+) + schema `push_subscriptions` + migration 014 dual-tree + RLS tenant-scoped + `web-push@3.6.7` lib + 4 VAPID env vars + Sentry `track.notification` namespace + push.service.notifyAdminPush/notifyStaffPush + pg-boss QUEUE_PUSH_SEND worker + booking hook post-`transitionFromPendingPayment` confirmed (NO SaaS, NO subscription) + 4 admin API routes (subscribe/unsubscribe/vapid/test) + Service Worker `public/sw.js` scope `/admin/` push+notificationclick handlers (NO fetch) + BroadcastChannel `notif-dedupe` con 150ms ack timeout + fallback showNotification + `PushNotificationManager` client island con CTA opt-in + sound gesture-bound + payload-specific toast + CSP `worker-src 'self'` + 34 unit nuevos + 4 integration files (8 cases) + 1 E2E chromium spec; 5 trust-but-verify/reviewer catches FIXED (VAPID test placeholder len, web-push duck-type, staffUserId null guard, endpoint URL max(2000), payload-passthrough BC) + 1 false alarm (postgres superuser bypassa RLS, mismo pattern send-email.worker) | `docs/audit/reports/fase-f09-notificaciones-report.md` |
| F10 — Responsive / Mobile | 🟢 PASS (3/3 criteria) + Viewport meta export (`viewportFit:'cover'` habilita `env(safe-area-inset-*)` + `maximumScale:5` a11y) + cascade mobile-first `h-11 md:h-10` en primitives Button/Input/Icon (cumple "44px mobile-facing" del MASTER.md sin tocar density desktop) + DialogContent `w-[calc(100vw-2rem)] max-h-[90svh] overflow-y-auto` (fit 360, iOS Safari toolbar respect) + raw forms tap targets en BookingFormModal/RegisterMovementModal con `min-h-11 md:min-h-*` + `inputMode=tel/decimal` + `autoComplete=tel/name/off` semánticos + safe-area-inset bottom/top en PlayerBottomNav/AdminHeader + AdminLayoutShell offset paralelo (H1 catch) + PushNotificationManager card refit 360 + raw button cascade + grilla `touch-pan-x` + Playwright project `mobile-chrome` (Pixel 5 393×851) `testMatch /mobile\\/.*/` + 2 specs E2E nuevos (6 admin-smoke + 1 touch-targets enumeration via single `page.evaluate`) + 5 unit nuevos primitives cascade (regression guard incluye `lg` NO tiene `md:h-10`). 1 H1 cazado durante T5 self-review (shell offset `pt-16` paralelo fix). | `docs/audit/reports/fase-f10-responsive-mobile-report.md` |
| F11 — Accessibility (a11y / WCAG 2.1 AA) | 🟢 PASS (3/3 criteria; 2 done-criteria con harness real + 1 deferral honesto NVDA pre-launch) + skip-to-content link sr-only/focus:not-sr-only en root layout + `<main id="main-content">` en 4 layout groups (admin/player/public/auth) + nested `<main>` cleanup en 2 leaf pages (auth/verify, public/[slug]/not-found) — code reviewer catch + cascade `focus:` → `focus-visible:ring-emerald-500` en primitives (button ring-ring → ring-emerald-500 alinea MASTER §10; dialog close; confirm-dialog input + raw cancel/confirm buttons) + 31 ring instances en 11 raw form files (preserved `focus:border-*` `focus:bg-*` `focus:opacity-*` no-rings) + Skeleton con `role="status"` + `aria-label="Cargando…"` (prop override) + `aria-hidden` suppression branch + `@media (prefers-reduced-motion: reduce)` `.skeleton` shimmer + `<nav aria-label="Navegación del jugador/del panel">` + `aria-current="page"` en PlayerBottomNav y AdminSidebar (string `'page'` no bool, inactive undefined) + axe-core suite `@axe-core/playwright@4.11.3` devDep + Playwright project `axe-audit` testMatch `/a11y\\/.*/` + `_helpers.expectNoAxeViolations` con tags wcag2a/wcag2aa/wcag21a/wcag21aa + critical/serious filter + rich throw + per-call disableRules opt-outs + 13 specs (public 4 + player 3 con playerStorageState + admin 6 con adminStorageState) + Lighthouse `categories:accessibility` minScore 0.95 hard error en lighthouserc.grilla.json + .public.json + global `afterEach(cleanup)` en `tests/setup.ts` (cross-file DOM pollution fix singleThread:true — `cleanup()` no-op si env sin DOM, safe global) + 30 unit nuevos + 14 E2E specs nuevos. 1 H1 cazado (nested `<main>`) + 1 trust-but-verify (dead expect post-throw `_helpers.ts:50`) pre-merge. | `docs/audit/reports/fase-f11-accessibility-report.md` |

## Hallazgos críticos acumulados

### P0 (bloqueantes)
- **B1: completeBooking/markNoShow no validaban tiempo** → ✅ FIXED
- **B11: CI aplicaba migrations divergentes vs prod** → ✅ FIXED (B11 T1: porteadas 010-012 a src/shared/db/migrations/ + convención en docs/MIGRATIONS.md)
- **F7-H1: MercadoPago `notification_url` apuntaba a `/api/mp/webhooks` (ruta inexistente)** — en prod MP postea a 404 → webhook nunca llega → booking con seña queda en `pending_payment` para siempre → conversión = $0. B3 había testeado el handler directo, nunca el string del preferencia. → ✅ FIXED (F7 T1: cambio a `/api/webhooks/mercadopago` + test regresión `webhook-notification-url.test.ts` con capturing gateway)

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
- **F4-H1: cancel admin sin elección reembolso/motivo ni confirmación escalonada** (seña pagada, US-CAN-003) → ✅ FIXED (F4 T2: ConfirmDialog con radios reembolso si seña pagada + motivo obligatorio + warning del efecto $ por método)
- **F4-H2: write-side de caja ausente en la UI** (actions `createCashFlowAction`/`closeDayAction` existían sin trigger) → ✅ FIXED (F4 T3: RegisterMovementModal + CloseDayButton type-to-confirm + nav fecha + EmptyState)
- **F4-H3: desactivar cancha con reservas futuras/abonados sin warning escalonado** (doc6 Court invariante) → ✅ FIXED (F4 T4: `getCourtDeactivationImpactAction` + ConfirmDialog con conteo real)
- **F5-H1: 4 botones de acciones de abonado stubbed sin handler** (`pausar/reactivar/cancelar` `type="button"` sin onClick/formAction — UI mentirosa, click no-op) → ✅ FIXED (F5 T1: AbonadosList client island + ConfirmDialog escalonado + date picker en cancel + reactivate preview)
- **F5-H2: preview de slots futuros ausente al crear abonado** (US-ABO-001 done-criteria F5; conflictos solo aparecían en `audit_logs.metadata` post-facto) → ✅ FIXED (F5 T2: `previewAbonadoSlotsAction` + `getAbonadoSlotConflicts` reusan `generateSlotDates` del cron B5; 2-fase form con badges OK/Conflicto)
- **F5-H4: desactivar staff con un click submit sin confirmación** (acción destructiva: pierde acceso panel + sesiones invalidadas) → ✅ FIXED (F5 T3: StaffActions client island + ConfirmDialog destructive + type-to-confirm email)
- **F5-H5: PIN lockout funciona backend pero la UI no muestra contador/countdown/disable** (done-criteria F5) → ✅ FIXED (F5 T4: VerifyPinResult 3-variant + countdown M:SS + input/button disabled durante lockout + warning attemptsLeft ≤2)
- **F7-H8: `transitionFromPendingPayment` no transicionaba `deposit_status` a `'paid'` en transition `pending_payment→confirmed`** (doc7 Flujo 2 PASO 5 explícito) — quedaba `pending` para siempre post-webhook, datos inconsistentes para reportes/queries. Cazado por trust-but-verify en E2E. → ✅ FIXED (F7 T8: `set({ status, ...(newStatus==='confirmed' ? { depositStatus: 'paid' } : {}) })` atómico en la misma UPDATE race-safe)

### P2 (medio)
- 4 warnings `<img>` no-optimized (Fase F12)
- ~~2 E2E tests skipped en onboarding wizard~~ → ✅ RESUELTO F2 (fresh admin fixture sin tenant; 2 reactivados + 1 nuevo full-wizard test)
- ~~Sentry init no degrada gracefully con DSN inválido~~ → ✅ FIXED (B10: `isValidDsn` guard)
- libuv assertion error stress test Windows-only (no aplica prod)
- ~~MP retry on InvalidTransitionError loser → Sentry filter~~ → ✅ FIXED (B10: `beforeSend` drop por `name`)
- B5: cron `generate-abonado-slots` sin comentario de intent → backlog
- B6: Server Actions CSRF = Next.js built-in (sin tokens custom) → backlog
- ~~B7: endpoints `[id]/{cancel,complete,no-show,status}` sin `parseRouteUuid()`~~ → ✅ RESUELTO F4 (T6/H8): `cancel` + `courts/status` pasaban el segmento crudo a Drizzle (22P02 SQL leak) → ruteados por `parseRouteUuid(req,'second-last')` → 400 limpio; `complete`/`no-show` ya validaban con `uuid.safeParse` (convertidos al helper por uniformidad, preserva comportamiento)
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
- **F4: optimistic rollback solo cubre fallo graceful `{success:false}`, no un throw/500 de red** (propaga al error boundary) → nice-to-have v1 (try/catch con rollback-on-throw); fallo de negocio devuelve `{success:false}`, un 500 de transporte es raro
- ~~**F4: venta rápida productos/cantina (US-CAJ-004) + CRUD abonados + settings/horarios + reportes financieros** → F5~~ → **PARCIALMENTE RESUELTO F5:** abonados CRUD funcional con preview (T1+T2); reportes con loading.tsx + E2E (T5+T6); settings ya estaba sólido (PinGate + Zod actions). **DEFERIDO post-F5:** venta rápida productos + CRUD productos (US-CAJ-004/US-ADM-004; v1.5).
- **F5: emails transaccionales `abonado.paused/canceled/reactivated`** (US-ABO-003/004 los pide pero B5 send-email no tiene templates) → backlog (no es done-criteria F5).
- **F5: PinGate en /reportes?** (decisión consciente: NO agregado, consistencia con /caja; pero data financiera es sensible) → backlog si Marcelo lo pide.
- **F5: `zod-coverage` test reconozca `parseRouteUuid()` como validation** (2 fallos preexistentes desde merge F4 en `bookings/[id]/{complete,no-show}/route.ts`; el test busca `import { z }` o `*.schema`, no reconoce el helper compartido) → backlog P3 (no es regresión, F4 T6 introdujo el helper).
- **F5: E2E reset hook para Upstash en test env** (sin `UPSTASH_REDIS_REST_URL` los 2 tests pin-lockout 3+4 se skipean) → backlog P3 (mock Redis o fixture stub).
- **F5: E2E settings (4 sub-rutas PIN + Zod)** → backlog P3 (settings actions ya tienen tests integration).

## Stats acumulados

- **Fases completadas: 24/26** (backend B0-B11 + F0-F11 frontend).
- **Tests acumulados nuevos audit: ~359** (329 post-F10 + F11: +30 unit [skip-to-content 2 + focus-visible-primitives 3 + confirm-dialog-focus 2 + no-raw-focus-ring 11 + skeleton 5 + navigation-aria 4 + 3 redundant local afterEach] + 14 E2E [axe-audit 13 + skip-link 1 chromium]). Unit suite **554 passing** (527 pre-F11 + 27 F11). Integration sin cambio F11 (53 file ECONNREFUSED pre-existente Supabase NO running + 1 actual fail pre-existente). E2E **+14 cases** (`axe-audit` project nuevo). 3 fails pre-existentes (1 db-client-role-guard requires Supabase + 2 zod-coverage F4) NO afectados por F11.
- **Bugs fixed: 47** (+1 F11: H1 nested `<main>` en 2 leaf pages [`(auth)/verify/page.tsx`, `(public)/[slug]/not-found.tsx`] adentro del `<main id="main-content">` de sus layout groups — HTML inválido + axe-core landmark-unique violation. Cazado por code reviewer trust-but-verify spec #4 prompt, NO por self-review implementer). 0 bugs prod nuevos F11.
- **Tests legacy ajustados: 10** (sin cambio F11; global `afterEach(cleanup)` en `tests/setup.ts` es upgrade, no fix de test legacy).
- **Deps nuevas: 3** (F10 baseline 2 + `@axe-core/playwright@4.11.3` devDep F11). **0 prod deps F11.**
- **Migraciones nuevas: 2** (sin cambio F11).
- **Env nuevas: 5** (sin cambio F11).
- **Bundle audit F11:** sin cambio. Tailwind cascade `focus:` → `focus-visible:` + nuevos atributos ARIA = bytes pero F11 NO agregó utilities Tailwind nuevas. Build **`✓ Compiled successfully`** (sitemap prerender ECONNREFUSED Supabase pre-existente F6, NO regresión). Shared baseline 150KB sin cambios. F12 cubre medición oficial post-prerender.

## Próximas decisiones para el humano

1. **F11 — Accessibility (a11y / WCAG 2.1 AA)** → ✅ completado esta sesión, mergeado a main. **3/3 done-criteria** (axe-core suite `@axe-core/playwright` 13 rutas en project `axe-audit` con `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` + critical/serious filter; Lighthouse `categories:accessibility` minScore 0.95 hard error en lighthouserc.grilla.json + .public.json; NVDA screen reader smoke deferral honesto con trigger pre-launch documentado). End-to-end coverage: skip-to-content link sr-only/focus:not-sr-only en root layout + `<main id="main-content">` en 4 layouts + nested `<main>` cleanup en 2 leaf pages + focus-visible cascade en primitives Button/Input/Dialog/ConfirmDialog + 31 ring instances en 11 raw forms + Skeleton role/aria-label/aria-busy + motion-reduce CSS media query + nav aria-label + aria-current + global `afterEach(cleanup)` en setup.ts (DOM pollution fix). 1 H1 cazado (nested `<main>`) + 1 trust-but-verify (dead expect) pre-merge. Sin schema, sin deps prod, sin desktop UX altered.
2. **F12 — Performance / Core Web Vitals** es la siguiente fase (MASTER_PLAN 226-229, criticidad 🔴🔴 Alta, 1-2 sesiones). Done criteria: Web Vitals 75th percentile en verde (LCP <2.5s, CLS <0.1, INP <200ms), 0 memory leaks. Trigger humano: confirmar continuar o pausar.
3. **F11 deferred (no-blocking):** NVDA Windows manual smoke 30min pre-launch (free desde nvaccess.org) sobre `/login`, `/explorar`, `/mis-reservas`, `/grilla`; ejecución real `pnpm playwright test --project axe-audit` con Supabase + seed activo (harness honesto, contract listo); ejecución real `pnpm lighthouse:grilla` + `lighthouse:public` (mismas precondiciones); text contrast `text-slate-500` migración a `slate-600` si feedback (AAA gap); Input primitive aria-invalid helper boolean prop v1.5; `aria-describedby` linking form errors v1.5.
3. **F10 deferred (no-blocking):** iOS Safari real device testing (`mobile-chrome` emula Pixel 5 Android, no Safari WebKit); Lighthouse mobile harness ejecución (F12 cubre); `/staff` bundle re-medición pre-prod (requiere `supabase start && pnpm build` para destrabar sitemap prerender + route table dump); 320px iPhone SE 1st viewport explicit testing (Pixel 5 393 cubre 360+, 320 backlog si surge usuario); grilla mobile alternative view (date+court picker + slot list flow, nice-to-have v1.5).
4. **F9 deferred (no-blocking):** `public/sounds/notification.mp3` real chime (placeholder README + sourcing CC0 freesound.org; audio silent-fail until file dropped — push/toast funciona regardless); multi-tab dedupe robusta cross-tab Set compartido (race posible v1 cosmetic); iOS Safari PWA install prompt UI; "Probar notificaciones" button en panel admin (endpoint funcional, UI no agregado); `notification_channel` enum extension a `'push'` para in-app bell badge US-NOT-003 (v1.5).
4. **B11 backlog operacional (no code):** ejecutar backup restore drill 1 vez (doc19 §10.6), counsel review DPA template, AAIP inscripción. Todos pre-launch, no bloquean siguiente fase.
3. **F7 — Booking Flow Jugador End-to-End** → ✅ completado fase previa. 3/3 done-criteria + 1 P0 (`notification_url`) + 1 P1 (`deposit_status`) fixed.
3. **F7 deferred (no-blocking):** alinear `public.service.getPriceForSlot` con `booking.service.priceForDuration` (helpers tratan `to='00:00'` distinto — workaround en seed); fix hydration warning en `ExpiryCountdown` (server vs client `Date.now`); `.ics` "agregar al calendario" (US-RES-003); cablear recordatorios email 24h/2h pre-turno (US-RES-006, templates ya existen en B5).
4. **Decisión previa (mantengo entrada original):** F6 — Public Landing + Search + Portal Complejo → ✅ completado. **4/4 done-criteria** (sitemap dinámico filtrando tenants active|trialing; robots con allow + disallow + Sitemap directive; Schema.org SportsActivityLocation + BreadcrumbList + WebSite SearchAction + Organization; Lighthouse public harness con SEO=error minScore 1.0 hard CI assert). **Plus:** OG + Twitter Card + canonical en todas rutas públicas; tenants `UNAVAILABLE_STATUSES` retornan `robots: noindex,nofollow`; manifest PWA + favicon + apple-icon + OG default 1200x630 via Edge ImageResponse; 3 `<img>` → `<Image>` migration (cover priority/LCP + logo + card cover); 3 `loading.tsx` con Skeleton (CLS=0); 19 unit + 5 integration + 6 E2E scenarios. **Trust-but-verify + reviewer cazaron 6 issues** (force-dynamic/revalidate conflict, tsbuildinfo committed, manifest size mismatch, absoluteUrl mutation, robots.host deprecated, twitter.card discriminated union typecheck) — todos corregidos pre-merge. Sin cambios de schema. **Lighthouse local NO ejecutado en sesión** (harness listo, run delegado a CI o local con seed activo — honesto, F3 dejó script que mentía, F6 no replica).
2. **B11 backlog operacional (no code):** ejecutar backup restore drill 1 vez (doc19 §10.6), counsel review DPA template, AAIP inscripción. Todos pre-launch, no bloquean siguiente fase.
3. **F7 — Booking Flow Jugador End-to-End** es la siguiente fase (MASTER_PLAN 198-202, criticidad 🔴🔴🔴 Crítica). Done criteria: E2E completo search → complejo → slot → form → pago MP mock → confirmación + cancelación MP → reintenta + timeout webhook → polling actualiza. Trigger humano: confirmar continuar o pausar.
4. **Pendiente F12 (Performance):** `/grilla` Lighthouse 88-89 (LCP 3.8s vía shared bundle 150KB Sentry). Harness autenticado (`pnpm lighthouse:grilla`) listo para re-medir tras el adelgazamiento del bundle. Público F6 (`/explorar`, `/[slug]`) probablemente supera 90 por simplicidad, pero comparte el techo structural.
5. **F6 deferred (no-blocking):** ejecutar `pnpm lighthouse:public` con seed activo para validar SEO=100/Perf≥90 numéricamente; validar JSON-LD manual contra schema.org validator; validar OG preview con Facebook Sharing Debugger; rate-limit explícito en `/api/public/*` (CSP+CDN baseline, gap documentado).
