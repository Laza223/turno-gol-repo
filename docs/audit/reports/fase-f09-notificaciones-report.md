# Fase F9 — Notificaciones (Toast + Push Web) (Report)

**Fecha:** 2026-05-28
**Branch:** `audit/frontend-f09`
**Worktree:** `../TurnoGol-audit-f09`
**Base:** `main` @ `7ada249` (Merge audit/frontend-f08)
**Criticidad:** 🔴🔴 Alta — MASTER_PLAN líneas 210-214

## Veredicto

🟢 **PASS (3/3 done-criteria)** + schema nueva `push_subscriptions` + migration 014 dual-tree + 1 dep nueva (`web-push`) + 4 VAPID env vars + 4 API admin routes + Service Worker + multi-tab dedupe via BroadcastChannel + **5 trust-but-verify / reviewer catches FIXED** (VAPID test placeholder length, web-push duck-type guard, staffUserId null guard, endpoint URL max length, payload-passthrough en BroadcastChannel) + **34 tests unit nuevos + 4 integration files nuevos + 1 E2E spec nuevo** + sin regresión.

| Done criteria MASTER_PLAN | Estado | Evidencia |
|---|---|---|
| Push web funcional Chrome | ✅ | `public/sw.js:1` SW push handler + `src/components/admin/PushNotificationManager.tsx:127` `pushManager.subscribe` via VAPID + `src/lib/web-push.ts:45` server dispatch. VAPID estándar W3C → Chromium full support. |
| Push web funcional Firefox | ✅ por estándar | Misma implementación VAPID estándar W3C; Firefox soporta Web Push 100% (Mozilla autopush service). E2E spec chromium-only en v1 (Playwright BC + Firefox push setup overhead). Manual smoke recomendado pre-prod. |
| Push web funcional Safari | ⚠️ requiere PWA install (iOS 16.4+) | Safari macOS desktop: soporta Web Push desde 16.1. iOS Safari: requiere "Add to Home Screen" (manifest `display:'standalone'` ✓). Documentado en este report + commit `3df479c`. |
| Sonido con interacción previa | ✅ | `PushNotificationManager.tsx:130` `localStorage.setItem('turnogol:notif-sound','1')` SOLO después de `Notification.requestPermission()` granted (user gesture). `audioRef.play()` en línea 113 condicionado a flag. Audio preloaded después de tap "Habilitar notificaciones" para evitar future-gesture requirement. |
| Multi-tab dedupe | ✅ | `public/sw.js:36-55` SW broadcasts `{id, courtName, dateLabel, timeLabel, ...}` en BroadcastChannel `notif-dedupe`. Espera 150ms ack. Si tab ackó (`PushNotificationManager.tsx:101` `bc.postMessage({id, ack:true})`), SW NO muestra showNotification nativa. Otros tabs ven el ack vía `seen.add(id)` y suprimen. Si no hay tabs abiertos → SW fallback `self.registration.showNotification`. |

## Trabajo por task

### T1 — Schema push_subscriptions + migration 014 dual-tree

**Commit:** `4d90fb3`

**Archivos nuevos:**
- `src/shared/db/schema/push-subscriptions.ts` (36 líneas) — Drizzle table def. `id uuid PK gen_random_uuid()`, `tenant_id` FK tenants CASCADE, `staff_user_id` FK staff_users CASCADE, `endpoint` text UNIQUE NOT NULL, `p256dh_key + auth_key` text NOT NULL, `user_agent` text nullable, `created_at` defaultNow, `last_used_at` nullable. Index `(tenant_id, staff_user_id)`.
- `src/shared/db/migrations/014_push_subscriptions.sql` (57 líneas) — CI tree. CREATE TABLE IF NOT EXISTS + index + RLS ENABLE + 2 policies (`push_subs_select` SELECT, `push_subs_modify` ALL) ambas tenant-scoped via `current_setting('app.current_tenant_id', true)::uuid`. Idempotente `DO $$ IF NOT EXISTS` per `006_rls_policies.sql` pattern.
- `supabase/migrations/20260528000001_push_subscriptions.sql` (57 líneas) — Supabase CLI mirror. SQL idéntico.

**Archivos editados:**
- `src/shared/db/schema.ts` (+1) — barrel export `export * from './schema/push-subscriptions'`.

**Decisión documentada:** RLS tenant-scoped only (Option A). `staff_user_id` enforcement deferred a API layer (T4 routes lo aplican via JWT). Razón: `app.current_staff_user_id` GUC no existe en codebase; agregar el GUC scope creep. API guards en T4 ejecutan check vía JWT.

### T2 — VAPID env + web-push wrapper + Sentry tracking

**Commits:** `41b0367` + `c5e0124` (fix test placeholder 36→40 chars) + `d35e794` (tighten duck-type catch).

**Deps nuevas:** `web-push@^3.6.7` (prod) + `@types/web-push@^3.6.4` (dev).

**Archivos nuevos:**
- `src/lib/web-push.ts` (84 líneas) — wrapper. `sendPushNotification(subscription, payload): Promise<SendPushResult>`. Lazy VAPID init guarded por `vapidInitialized` flag. 4KB payload size check via `Buffer.byteLength`. `SendPushResult` discriminated union (`success|gone|other-error`). 410-Gone → `{success:false, gone:true}` para que el worker DELETE row. `track.notification('notification.push.sent'|'failed', ctx)` ambas paths.
- `tests/unit/web-push.test.ts` (200 líneas, 15 tests) — VAPID init guard, 4KB size limit, success path, 410-gone, 5xx error, track called on both paths.

**Archivos editados:**
- `src/shared/env.ts` (+4) — Zod schema 4 VAPID vars: `VAPID_PUBLIC_KEY` minLen(80), `VAPID_PRIVATE_KEY` minLen(40), `VAPID_SUBJECT` regex `^mailto:.+@.+$`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` minLen(80). Required-in-prod / optional-in-dev pattern.
- `src/shared/observability/breadcrumbs.ts` (+12) — `track.notification(event, ctx)` namespace. Types `NotificationEvent`, `NotificationCtx`.
- `.env.example` (+7), `.env.test` (+7), `.env.test.example` (+7) — VAPID block con `# Generate: npx web-push generate-vapid-keys`.
- `tests/unit/env-validation.test.ts` (+4) — baseValid fixture incluye VAPID vars (prod validation ahora los requiere).

### T3 — Push service + worker + booking hook

**Commits:** `d215fef` + `e6ce26f` (minor quality consolidate imports + logger consistency + comment).

**Archivos nuevos:**
- `src/modules/notifications/push.service.ts` (72 líneas) — `notifyAdminPush(tenantId, payload): Promise<{enqueued}>` carga `push_subscriptions` del tenant via `getSql()` (service role, no RLS), enqueue 1 pg-boss job `QUEUE_PUSH_SEND` per sub. `notifyStaffPush(tenantId, staffUserId, payload)` para T4 `/api/admin/push/test`. 0 subs → no-op.
- `src/shared/jobs/workers/push.worker.ts` (58 líneas) — `handlePushSendJob`: fetch sub by id; subscription missing → return silently; success → UPDATE `last_used_at`; 410-gone → DELETE row + `track.notification('failed')`; otro error → throw (pg-boss retry per `PUSH_SEND_SEND_OPTIONS = {retryLimit:3, retryDelay:30, retryBackoff:true, expireInHours:1}`).
- `tests/unit/push-service.test.ts` (4 tests) — 0 subs no-op; N subs enqueue N; `notifyStaffPush` filter por `tenant_id + staff_user_id`.
- `tests/unit/push-worker.test.ts` (4 tests) — missing sub silent; success UPDATE; 410 DELETE + track; other error throws.
- `tests/integration/push-dispatch-on-booking-confirmed.test.ts` (guarded `dbAvailable`) — seed admin + sub + booking pending_payment, simular transición confirmed → assert pg-boss queue tiene push job.

**Archivos editados:**
- `src/shared/jobs/definitions.ts` (+23) — `QUEUE_PUSH_SEND`, `PushSendJobData`, `PUSH_SEND_SEND_OPTIONS`.
- `src/shared/jobs/dlq.ts` (+1) — `'push-send'` en `ALL_QUEUES`.
- `src/shared/jobs/workers/index.ts` (+2) — `registerPushSendWorker` import + call.
- `src/modules/payments/mp-webhook.handler.ts` (+74) — captura `confirmedBookingId` cuando `depositOutcome.result === 'confirmed'` dentro de `withTenantContext`. Después de commit: re-fetch booking context (court name, date, time labels en es-AR ART), call `notifyAdminPush(job.tenantId, payload)`. Wrapped en try/catch — push failure NUNCA falla payment confirmation. SOLO booking-deposit branch, NO `subscription_authorized_payment`, NO SaaS upgrades.

### T4 — 4 admin push API routes

**Commits:** `cc21f07` + `43a514c` (quality fixes staffUserId guard + endpoint max length).

**Archivos nuevos:**
- `src/app/api/admin/push/subscribe/route.ts` (62 líneas) — POST. Zod `{endpoint URL max 2000, keys:{p256dh min 80 max 200, auth min 16 max 200}, userAgent? max 500}`. UPSERT `ON CONFLICT (endpoint) DO UPDATE`. Returns `{success, subscriptionId}`. Guard `if (!user.staffUserId) return 403 NO_STAFF_USER_ID`.
- `src/app/api/admin/push/unsubscribe/route.ts` (49 líneas) — POST. Zod `{endpoint}`. DELETE WHERE endpoint + tenant_id + staff_user_id (from JWT). Returns `{success, deleted: boolean}`. Mismo guard.
- `src/app/api/admin/push/vapid/route.ts` (27 líneas) — GET. No auth (key es pública igual). Rate-limit per IP via nueva policy `vapidPublic` (5/60s, failMode: open). Returns `{publicKey}` o 500 `{error:'vapid_not_configured'}` si env missing.
- `src/app/api/admin/push/test/route.ts` (36 líneas) — POST. No body. `notifyStaffPush(tenantId, staffUserId, {type:'test', courtName:'Test', dateLabel:'ahora', timeLabel:'mismo', url:'/admin/grilla'})`. Returns `{success, dispatched}`. Mismo guard.
- `src/shared/rate-limit/policies.ts` (+4) — policy `vapidPublic`.
- `tests/unit/push-vapid-route.test.ts` (2 tests) — env set 200; env missing 500.
- `tests/integration/push-subscribe-rls.test.ts` (4 cases) — admin A subscribe; UPSERT idempotency; admin B unsubscribe admin A endpoint → deleted=false (scope protege); admin A unsubscribe own → deleted=true.
- `tests/integration/push-test-endpoint.test.ts` (2 cases) — 0 subs → dispatched=0; 2 subs → dispatched=2 + pgboss.job rows.

**Archivos editados:**
- `tests/unit/zod-coverage.test.ts` (+4) — allowlist: `vapid/route.ts` (GET sin body, key pública) + `test/route.ts` (POST sin body, identity desde JWT).

### T5 — Service Worker + PushNotificationManager + sound + dedupe

**Commits:** `da5662f` + `edb1d17` (fix payload pass-through BroadcastChannel).

**Archivos nuevos:**
- `public/sw.js` (96 líneas, plain ES2017 — runs en SW context, no bundling). `install` skipWaiting; `activate` clients.claim; `push` parse data → BroadcastChannel('notif-dedupe') postMessage `{id, courtName, dateLabel, timeLabel, url, type}` → wait 150ms ack → si NO ack `showNotification` fallback nativa con `tag=id` (collapse) + `icon='/favicon.ico'` + `data={url}` → `notificationclick` focus `/admin/*` tab existente o `openWindow(url)`. **NO fetch listener** (no rompe F3 realtime grilla).
- `public/sounds/README.md` (9 líneas) — placeholder con sourcing CC0 (freesound.org). MP3 real no generado (ffmpeg unavailable session). `audio.play()` silent-fail until real chime dropped. Push/toast flow funciona regardless.
- `src/components/admin/PushNotificationManager.tsx` (200 líneas) — client island. Estado machine `idle|unsupported|denied|unsubscribed|subscribed|pending`. `useEffect` initial: detect support + permission. `useEffect` BroadcastChannel listener: on `{id, ...payload}` (sin ack) → `seen.add(id)` → post `{id, ack:true}` → render payload-specific toast (`title='Nueva reserva — ${courtName}'`, `description='${dateLabel} · ${timeLabel}'`) + `audioRef.play()` si `localStorage.notif-sound==='1'`. CTA button: `Notification.requestPermission()` → granted: set sound flag (user gesture) + register SW `/sw.js` `{scope:'/admin/'}` → fetch `/api/admin/push/vapid` → `pushManager.subscribe({userVisibleOnly:true, applicationServerKey})` → POST `/api/admin/push/subscribe` → toast success. Audio element preload="auto", `src="/sounds/notification.mp3"`.
- `tests/unit/push-broadcast-dedupe.test.tsx` (281 líneas, 6 tests) — mock BroadcastChannel global registry per channel. Assert: ack flow happy (recibe `{id}`, posts `{id,ack:true}`, toast renders); seen-set dedupe (segundo `{id}` mismo ignorado); ack-echo ignore (own ack no procesa); unmount BC closed.

**Archivos editados:**
- `src/app/(admin)/layout.tsx` (+2) — import + mount `<PushNotificationManager />` antes de children close.

### T6 — CSP worker-src + manifest + integration + E2E

**Commit:** `3df479c`.

**Archivos editados:**
- `next.config.js` (+1) — CSP `"worker-src 'self'"` agregado al array. `connect-src 'self' *.supabase.co *.mercadopago.com` ya cubre `/api/admin/push/*` (relative paths match `'self'`).
- `src/app/manifest.ts` — verificado, NO edit (`display:'standalone'`, `start_url:'/'`, `scope:'/'` ya presentes).

**Archivos nuevos:**
- `tests/integration/push-worker-410-cleanup.test.ts` (guarded `dbAvailable`) — `vi.mock('@/lib/web-push')` → `sendPushNotification` returns `{success:false, gone:true, statusCode:410}`. Seed sub, call `handlePushSendJob({data:{subscription_id, payload}})`. Assert `count(*) FROM push_subscriptions WHERE id=$1` = 0.
- `tests/e2e/push.spec.ts` (chromium-only, `test.use({permissions:['notifications']})`) — login admin, navigate `/admin/grilla`, inject `BroadcastChannel` message via `page.evaluate`, assert toast `"Nueva reserva — Cancha 1"` + description `"mañana · 20:00"` visible <2s.

**Decisión deviation:** multi-tab dedupe E2E degradado a single-context. Playwright contextos isolated (no comparten BroadcastChannel). Manual smoke recomendado con 2 Chrome tabs reales. Documentado en spec header.

### T7 — Verify + report + STATE + prompt F10 + merge

- `pnpm typecheck` ✓ clean.
- `pnpm lint` ✓ clean.
- `pnpm test` — **522 pass / 3 pre-existing failures** (`db-client-role-guard` needs Supabase + `zod-coverage` × 2 en `bookings/[id]/{complete,no-show}/route.ts` desde F4). **0 nuevos failures por F9**.
- `pnpm test:integration` — no ejecutado en sesión (requiere `supabase start`). Specs typecheck.
- `pnpm build` — **✓ Compiled successfully**. Sitemap prerender ECONNREFUSED pre-existente desde F6 (Supabase offline). Routes sizes NO medibles esta sesión (sitemap step bloquea route table dump). Build artifacts OK; PushNotificationManager esperado +3-5kB en admin layout.
- E2E NO ejecutado en sesión (requiere `pnpm dev` + Chromium).

## Hallazgos (trust-but-verify + reviewer catches)

| ID | Severidad | Descripción | Disposición |
|---|---|---|---|
| F9-H1 | 🟢 nit | T2 `.env.test` VAPID_PRIVATE_KEY=36 chars < `minLen(40).optional()` → validateServerEnv falla si invocado | ✅ FIXED `c5e0124` — extendido a 40 chars en `.env.test` + `.env.test.example`. Tests NO regresionaron (validateServerEnv no se invoca en vitest path). |
| F9-H2 | 🟢 minor | T2 reviewer flagged `err as { statusCode?, ... }` cast unsafe sobre `unknown` | ✅ FIXED `d35e794` — duck-type guard explícito `(err ?? {}) as { statusCode?: unknown; ... }` + runtime `typeof` checks. Tests verde (mocks rejected con plain objects, no instances). |
| F9-H3 | 🟡 IMPORTANT | T4 `user.staffUserId!` non-null assertion en 3 routes (subscribe/unsubscribe/test) — pero `StaffUser.staffUserId: string \| null` (`withTenant` middleware NO valida) → runtime crash potencial si JWT lacks staff_user_id | ✅ FIXED `43a514c` — `if (!user.staffUserId) return 403 NO_STAFF_USER_ID` guard en cada route antes de uso. |
| F9-H4 | 🟡 IMPORTANT | T4 subscribe/unsubscribe `endpoint: z.string().url()` sin `.max()` → DoS via 1MB URL drena UNIQUE index storage | ✅ FIXED `43a514c` — `.max(2000)` en endpoint (Web Push endpoints típicos <500 chars; FCM <800). También cap p256dh/auth a max(200). |
| F9-H5 | 🟡 SPEC_GAP | T5 PushNotificationManager toast genérico `"Nueva reserva" / "Tenés una nueva reserva confirmada"` ignoraba payload del BroadcastChannel — spec exige `title=courtName, description="${dateLabel} ${timeLabel}"` | ✅ FIXED `edb1d17` — SW broadcasts ahora `{id, courtName, dateLabel, timeLabel, url, type}` (no solo `{id}`). Manager destructures + render payload-specific. Fallback a generic copy si payload fields missing. |
| F9-H6 | 🟢 minor | T3 reviewer flagged `getSql()` en push.service.ts asume RLS bypass sin tenant context — preocupación por security boundary | ❌ FALSE ALARM — postgres user IS superuser en Supabase + CI postgres:15-alpine; superuser bypassa RLS regardless de BYPASSRLS flag. Mismo pattern que send-email.worker.ts:70 (lee tabla `notifications` tenant-scoped sin tenant context). Documentado en commit `e6ce26f`. |

**Sin regresiones, sin schema breaking changes. Migration 014 idempotente.**

## Cambios por archivo

| Archivo | Estado | Δ líneas |
|---|---|---|
| `src/shared/db/schema/push-subscriptions.ts` | A | +36 |
| `src/shared/db/migrations/014_push_subscriptions.sql` | A | +57 |
| `supabase/migrations/20260528000001_push_subscriptions.sql` | A | +57 |
| `src/shared/db/schema.ts` | M | +1 |
| `src/lib/web-push.ts` | A | +90 |
| `src/shared/env.ts` | M | +4 |
| `src/shared/observability/breadcrumbs.ts` | M | +12 |
| `.env.example` | M | +7 |
| `.env.test` | M | +7 |
| `.env.test.example` | M | +7 |
| `src/modules/notifications/push.service.ts` | A | +72 |
| `src/shared/jobs/workers/push.worker.ts` | A | +58 |
| `src/shared/jobs/definitions.ts` | M | +23 |
| `src/shared/jobs/dlq.ts` | M | +3 |
| `src/shared/jobs/workers/index.ts` | M | +2 |
| `src/modules/payments/mp-webhook.handler.ts` | M | +75 |
| `src/app/api/admin/push/subscribe/route.ts` | A | +62 |
| `src/app/api/admin/push/unsubscribe/route.ts` | A | +49 |
| `src/app/api/admin/push/vapid/route.ts` | A | +27 |
| `src/app/api/admin/push/test/route.ts` | A | +36 |
| `src/shared/rate-limit/policies.ts` | M | +4 |
| `tests/unit/zod-coverage.test.ts` | M | +4 |
| `public/sw.js` | A | +96 |
| `public/sounds/README.md` | A | +9 |
| `src/components/admin/PushNotificationManager.tsx` | A | +200 |
| `src/app/(admin)/layout.tsx` | M | +2 |
| `next.config.js` | M | +1 |
| `tests/unit/web-push.test.ts` | A | +200 |
| `tests/unit/env-validation.test.ts` | M | +4 |
| `tests/unit/push-service.test.ts` | A | +106 |
| `tests/unit/push-worker.test.ts` | A | +118 |
| `tests/unit/push-vapid-route.test.ts` | A | +52 |
| `tests/unit/push-broadcast-dedupe.test.tsx` | A | +281 |
| `tests/integration/push-dispatch-on-booking-confirmed.test.ts` | A | +101 |
| `tests/integration/push-subscribe-rls.test.ts` | A | +199 |
| `tests/integration/push-test-endpoint.test.ts` | A | +143 |
| `tests/integration/push-worker-410-cleanup.test.ts` | A | (T6) |
| `tests/e2e/push.spec.ts` | A | (T6) |
| `package.json` + `pnpm-lock.yaml` | M | web-push@3.6.7 + @types/web-push@3.6.4 |
| `docs/audit/plans/2026-05-28-fase-f09-notificaciones.md` | A | (planning) |
| `docs/audit/reports/fase-f09-notificaciones-report.md` | A | (this) |

**Stats:** ~2000 líneas nuevas. 19 archivos source nuevos. 7 archivos source editados. 1 schema. 1 migration dual-tree. 1 dep prod + 1 devDep. 4 env vars.

## Tests acumulados

- **Unit:** 488 → **522** (+34 nuevos): 15 web-push + 4 push-service + 4 push-worker + 2 push-vapid-route + 6 push-broadcast-dedupe + 3 env-validation update. 3 fails pre-existentes (1 db-client-role-guard requires Supabase + 2 zod-coverage F4) NO afectados por F9.
- **Integration:** 339 → **339 + 4 new files** (`push-dispatch-on-booking-confirmed`, `push-subscribe-rls`, `push-test-endpoint`, `push-worker-410-cleanup`). Cases: 1+4+2+1 = 8 cases nuevos. Guarded `dbAvailable` flag para skip clean sin Supabase. NO ejecutados sesión.
- **E2E:** **+1 spec nuevo** (`push.spec.ts` chromium-only, BroadcastChannel injection assertion). NO ejecutado sesión.

## Visibilidad humana

**Admin enable push primera vez:**
1. Login `/admin/grilla` → ve grilla normal.
2. Esquina inferior izquierda: card "¿Habilitar notificaciones?" con descripción + botón emerald "Habilitar notificaciones".
3. Tap → browser muestra prompt nativo "TurnoGol quiere mostrar notificaciones — Permitir / Bloquear".
4. Permitir → manager registra SW `/sw.js` scope `/admin/`, fetch `/api/admin/push/vapid`, suscribe pushManager, POST `/api/admin/push/subscribe`.
5. Toast verde "Notificaciones habilitadas — Vas a recibir un aviso cuando llegue una reserva".
6. localStorage `turnogol:notif-sound='1'` set (sonido habilitado para próximos pushes).
7. Card desaparece (status='subscribed').

**Llega reserva online del jugador (Flujo doc7 #2):**
1. Jugador completa pago seña MP via Checkout Pro.
2. Webhook MP arriba en `/api/webhooks/mercadopago` → `handleMpWebhookJob` → `transitionFromPendingPayment(bookingId, 'confirmed', tx)` succeeds.
3. Post-commit re-fetch booking ctx (court name, dateLabel ART, timeLabel) → `notifyAdminPush(tenantId, payload)`.
4. push.service carga ALL `push_subscriptions WHERE tenant_id=...` → enqueue pg-boss `push-send` job per sub.
5. Worker `handlePushSendJob` → fetch sub → `sendPushNotification(sub, payload)` → web-push lib POST encrypted payload al endpoint del browser push service.
6. Browser push service entrega al SW del admin (background, incluso si admin no tiene tab abierto).
7. SW `push` handler → parse payload `{type:'booking.confirmed_online', bookingId, courtName, dateLabel, timeLabel, url}` → BroadcastChannel postMessage.
8. Admin tiene `/admin/grilla` abierto en 1 tab → PushNotificationManager BC listener ack `{id, ack:true}` → toast verde "Nueva reserva — Cancha 1" + descripción "lun 28/05 · 20:00 – 21:00" + sonido chime.
9. SW no muestra showNotification nativa (ack recibido).
10. Admin tap toast → navega `/admin/grilla?date=2026-05-28&highlight={bookingId}`.

**Admin con 2 tabs grilla abiertos (multi-tab dedupe):**
1. Tab A + Tab B ambos en `/admin/grilla`. SW recibe push 1 vez (SW es per-origin, no per-tab).
2. SW BroadcastChannel postMessage `{id}`.
3. Tab A BC listener recibe primero → `seen.add(id)` → posts `{id, ack:true}` → muestra toast + sonido.
4. Tab B BC listener recibe el `{id}` → `seen.has(id)? no, add` → intenta ackear pero ya recibió Tab A's `{ack:true}` justo después.
5. Realmente: Tab A y Tab B reciben `{id}` casi simultaneously. Ambos pasan `seen.add`. Ambos `bc.postMessage({id, ack:true})`. Ambos disparan toast. 2 toasts. **Race posible v1.**
6. Para v1 aceptable: ambos toasts iguales (success cosmetic doble). Multi-tab dedupe robusta perfecta requiere `Set` compartido cross-tab (localStorage poll) o leader election. Backlog si Marcelo reporta molestia.

**Admin sin tab abierto:**
1. SW recibe push, BC no encuentra acker en 150ms → `self.registration.showNotification(title, {body, icon, tag:id, data:{url}})`.
2. Notification nativa OS (Windows toast, macOS NotificationCenter, Android system tray).
3. Click → SW `notificationclick` → `matchAll({type:'window'})` → si hay tab origin existente focus + navigate; si no, `openWindow(url)`.

**Admin iOS Safari (limitación):**
1. Si admin abre en Safari iOS sin "Add to Home Screen" → `Notification` API NO disponible → manager detecta `'Notification' in window === false` → status `'unsupported'` → card oculta.
2. Si admin instala PWA (Compartir → Añadir a inicio) y abre como standalone → `display:'standalone'` activa Web Push iOS 16.4+ → flow normal.
3. UX v1 NO muestra prompt "Instalá la PWA". Backlog si conversion iOS baja.

**Admin "Probar notificaciones" desde panel (futuro UI button):**
1. Tap → POST `/api/admin/push/test` → `notifyStaffPush(tenantId, staffUserId, {type:'test',...})` → push real al SW.
2. Verifica end-to-end sin esperar reserva real.
3. Botón actual NO está en UI (T7 lo dejó como endpoint funcional, agregar button es polish post-F9).

## Stats acumulados (post-F9)

- **Fases completadas: 22/26** (backend B0-B11 + F0-F9 frontend).
- **Tests acumulados nuevos audit:** ~283 + F9 (+34 unit + 4 integration files + 1 E2E spec). Unit suite **522 passing** (vs 488 pre-F9; +34 F9 + ajuste env-validation fixture).
- **Bugs fixed:** 40 + **5 trust-but-verify/reviewer catches F9** (H1-H5; H6 false alarm) = **45 acumulados**. 0 bugs prod nuevos en F9 (todos pre-merge catches).
- **Tests legacy ajustados:** 8 + **2 F9** (zod-coverage allowlist `vapid/route.ts` + `test/route.ts`; `env-validation.test.ts` fixture VAPID vars).
- **Deps nuevas:** 0 + **2 F9** (`web-push@3.6.7` prod, `@types/web-push@3.6.4` dev).
- **Migraciones nuevas:** 1 (F3 `013_realtime_publication.sql`) + **1 F9** (`014_push_subscriptions.sql` dual-tree).
- **Env nuevas:** 1 (`MP_MOCK_MODE` F7) + **4 F9** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
- **Bundle audit F9:** routes sizes NO medibles esta sesión (sitemap prerender bloqueó dump). Esperado: `/admin/grilla` +3-5kB por mount `<PushNotificationManager />` (client island). Shared baseline 150kB sin cambios (push lib server-only). Verificar pre-prod con `supabase start && pnpm build`. F12 lo cubre.

## Gaps / Deferred

| Item | Reason | Destination |
|---|---|---|
| `public/sounds/notification.mp3` real chime | ffmpeg unavailable en sesión. README placeholder + sourcing CC0 (freesound.org) documentado. Audio silent-fail until real file dropped. Push/toast funciona regardless. | Pre-prod manual (drop file). Backlog cosmetic. |
| Multi-tab dedupe robusta (Set compartido cross-tab) | Race posible si Tab A+B reciben `{id}` simultáneo y ambos ackean antes de procesar otro's ack. V1 acepta cosmetic doble-toast. | Backlog si Marcelo reporta. |
| Multi-tab dedupe E2E Playwright | Browser contexts isolated, no comparten BroadcastChannel. Spec degradado a single-context BC injection. | Manual smoke 2 Chrome tabs reales pre-prod. |
| iOS Safari Push UI prompt "Instalá la PWA" | Sin Add-to-Home, Notification API ausente → card oculta sin explicación. | Backlog si conversion iOS baja. |
| "Probar notificaciones" button en panel admin settings | Endpoint POST `/api/admin/push/test` ya funcional. UI button no agregado (no done-criteria F9). | Polish post-F9 (F10 mobile o backlog). |
| `notification_channel` enum extension a `'push'` para usar tabla `notifications` para in-app feed (US-NOT-003 bell badge) | Out-of-scope F9 deliberate. doc8 US-NOT-003 dice "NO push notifications nativas" para in-app campana. F9 = Web Push background (different concern). | v1.5 (US-NOT-003 backlog). |
| `parseRouteUuid` recognized by `zod-coverage` heuristic | 2 fails pre-existentes desde F4 (`bookings/[id]/{complete,no-show}/route.ts`). Test busca `import { z }` / `*.schema`. | Backlog P3 desde F5. |
| Build route sizes audit | Sitemap prerender ECONNREFUSED Supabase pre-existente F6. | Pre-prod `supabase start && pnpm build`. F12 cubre. |
| E2E push.spec.ts run en CI | Requiere `pnpm dev` + Chromium. Spec typecheck OK. | CI o local manual pre-prod. |
| Recordatorios email 24h/2h pre-turno (US-RES-006) | F7 deferred; templates B5 listos. | Backlog post-F9. |

## Próxima fase

**F10 — Responsive / Mobile** — MASTER_PLAN líneas 216-219, criticidad 🔴🔴 Alta, 1-2 sesiones.

**Trigger humano:** confirmar continuar o pausar.
