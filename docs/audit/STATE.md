# TurnoGol Audit — Estado Actual

**Última actualización:** 2026-05-28
**Branch principal:** main
**Worktrees activos:** ninguno (F7 mergeado a main)

## Fase actual

**F8 — Player Area** (siguiente, no iniciada)

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

- **Fases completadas: 20/26** (backend B0-B11 + F0-F7 frontend).
- **Tests acumulados nuevos audit: ~277** (260 post-F6 + F7: 5 unit `expiry-countdown` + 8 integration `webhook-notification-url` + `mp-mock-gateway` + 4 E2E scenarios `booking-flow`). Unit suite **480→488** (486 passing; 2 fallos pre-existentes `zod-coverage` `bookings/[id]/{complete,no-show}` desde F4, NO regresión F7). Integration **331→339** (339 passing en la corrida final; las 2 flaky pre-existentes `daily-close-idempotency` + `race-abonado-vs-individual` pasaron este run, siguen siendo flaky cross-run). E2E booking-flow F7 +4 verde local (`MP_MOCK_MODE=1 + supabase start + workers=1`); suite completa delegada a CI.
- **Bugs fixed: 40** (38 + **F7-H1 `notification_url` P0** + **F7-H8 `deposit_status` transition P1**). **+5 issues cazados en trust-but-verify F7** (H7 exito mentía "confirmada", H9 helpers pricing inconsistentes, H10 seed FK cleanup, H11 CSP dev unsafe-eval, H12 `MP_MOCK_MODE=1` leak en `.env.test` rompía 6 webhook integration tests) — todos corregidos pre-merge.
- **Tests legacy ajustados: 8** (sin cambios en F7).
- **Deps nuevas: 0**.
- **Migraciones nuevas: 1** (F3 `013_realtime_publication.sql`; F4-F7 +0).
- **Env nuevas: 1** (`MP_MOCK_MODE` — solo E2E/local; documentada en `.env.example` + `.env.test.example`; **NO** setear en `.env.test` ni prod; Playwright la inyecta vía `webServer.env`). `MP_WEBHOOK_SECRET` ya existía, ahora hay valor de test en `.env.test`.
- **Bundle audit F7:** `/[slug]/reservar` 155kB (igual que F6, watcher es client-island en pages distintas), `/reserva/[bookingId]/exito` 154kB, `/reserva/[bookingId]/pendiente` 154kB, `/reserva/[bookingId]/error` 153kB, `/mock-mp/checkout` 150kB (test-only). **Todas <200KB ✓**. Shared baseline 150kB (Sentry, F12 gap sin cambios).

## Próximas decisiones para el humano

1. **F7 — Booking Flow Jugador End-to-End** → ✅ completado esta sesión, mergeado a main. **3/3 done-criteria** (E2E happy path con seña + cancelación MP→reintenta + timeout webhook→polling). **+ 1 P0 prod-affecting bug fixed (`notification_url` mismatch — webhook llegaba a 404)** + **1 P1 backend (`deposit_status` no se transicionaba a `'paid'`)** + 5 trust-but-verify catches (H7/H9/H10/H11/H12). Sin schema. 17 tests nuevos (5 unit + 8 integration + 4 E2E scenarios). `MP_MOCK_MODE` introducido (E2E/local), `LocalMockGateway` + `/mock-mp/checkout` (404 en prod) habilitan demo manual del flow.
2. **F8 — Player Area** es la siguiente fase (MASTER_PLAN 204-208, criticidad 🟡 Media). Done criteria: jugador ve sus reservas, cancela válidas, edita perfil, descarga datos, elimina cuenta. E2E player. Trigger humano: confirmar continuar o pausar.
3. **F7 deferred (no-blocking):** alinear `public.service.getPriceForSlot` con `booking.service.priceForDuration` (helpers tratan `to='00:00'` distinto — workaround en seed); fix hydration warning en `ExpiryCountdown` (server vs client `Date.now`); `.ics` "agregar al calendario" (US-RES-003); cablear recordatorios email 24h/2h pre-turno (US-RES-006, templates ya existen en B5).
4. **Decisión previa (mantengo entrada original):** F6 — Public Landing + Search + Portal Complejo → ✅ completado. **4/4 done-criteria** (sitemap dinámico filtrando tenants active|trialing; robots con allow + disallow + Sitemap directive; Schema.org SportsActivityLocation + BreadcrumbList + WebSite SearchAction + Organization; Lighthouse public harness con SEO=error minScore 1.0 hard CI assert). **Plus:** OG + Twitter Card + canonical en todas rutas públicas; tenants `UNAVAILABLE_STATUSES` retornan `robots: noindex,nofollow`; manifest PWA + favicon + apple-icon + OG default 1200x630 via Edge ImageResponse; 3 `<img>` → `<Image>` migration (cover priority/LCP + logo + card cover); 3 `loading.tsx` con Skeleton (CLS=0); 19 unit + 5 integration + 6 E2E scenarios. **Trust-but-verify + reviewer cazaron 6 issues** (force-dynamic/revalidate conflict, tsbuildinfo committed, manifest size mismatch, absoluteUrl mutation, robots.host deprecated, twitter.card discriminated union typecheck) — todos corregidos pre-merge. Sin cambios de schema. **Lighthouse local NO ejecutado en sesión** (harness listo, run delegado a CI o local con seed activo — honesto, F3 dejó script que mentía, F6 no replica).
2. **B11 backlog operacional (no code):** ejecutar backup restore drill 1 vez (doc19 §10.6), counsel review DPA template, AAIP inscripción. Todos pre-launch, no bloquean siguiente fase.
3. **F7 — Booking Flow Jugador End-to-End** es la siguiente fase (MASTER_PLAN 198-202, criticidad 🔴🔴🔴 Crítica). Done criteria: E2E completo search → complejo → slot → form → pago MP mock → confirmación + cancelación MP → reintenta + timeout webhook → polling actualiza. Trigger humano: confirmar continuar o pausar.
4. **Pendiente F12 (Performance):** `/grilla` Lighthouse 88-89 (LCP 3.8s vía shared bundle 150KB Sentry). Harness autenticado (`pnpm lighthouse:grilla`) listo para re-medir tras el adelgazamiento del bundle. Público F6 (`/explorar`, `/[slug]`) probablemente supera 90 por simplicidad, pero comparte el techo structural.
5. **F6 deferred (no-blocking):** ejecutar `pnpm lighthouse:public` con seed activo para validar SEO=100/Perf≥90 numéricamente; validar JSON-LD manual contra schema.org validator; validar OG preview con Facebook Sharing Debugger; rate-limit explícito en `/api/public/*` (CSP+CDN baseline, gap documentado).
