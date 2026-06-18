# Fase F9 — Notificaciones (Toast + Push Web) — Plan

**Branch:** `audit/frontend-f09`
**Worktree:** `../TurnoGol-audit-f09`
**Base:** `main` @ `7ada249` (Merge audit/frontend-f08)
**Criticidad:** 🔴🔴 Alta — MASTER_PLAN líneas 210-214
**Tiempo estimado:** 1-2 sesiones

## Objetivo

Admin se entera de reservas en tiempo real, incluso cuando la grilla no está abierta. Web Push API del browser al admin cuando llega una reserva online (booking transitions pending_payment → confirmed via webhook MP). Sonido configurable (gesture-bound). Multi-tab dedupe vía Service Worker + BroadcastChannel.

## Done criteria (literal MASTER_PLAN líneas 210-214)

1. **Push web funcional Chrome + Safari + Firefox** — Web Push API estándar (VAPID) sirve los 3. Safari iOS limita a PWA instalado (documentado).
2. **Sonido con interacción previa** — usuario tap "Habilitar notificaciones" → permission granted + sound consent en `localStorage`. `Audio.play()` no se invoca sin user gesture previo.
3. **Multi-tab dedupe** — Service Worker recibe push → `BroadcastChannel('notif-dedupe').postMessage({id})`. Primer tab que ack within 100ms muestra toast; el resto suprime. Si no hay tabs abiertos → SW muestra notification nativa.

## Stack F9 (nueva schema, 1 dep, 4 env vars)

| Componente | Estado actual | F9 acción |
|---|---|---|
| `src/components/ui/toast.tsx` (Radix CVA) | ✅ existe | REUSAR |
| `src/components/ui/toaster.tsx` (provider) | ✅ existe | REUSAR |
| `src/hooks/use-toast.ts` (singleton emit) | ✅ existe | REUSAR |
| `<Toaster />` mounted en `src/app/layout.tsx:37` | ✅ existe | REUSAR |
| `src/modules/notifications/notification.service.ts` (email-only) | ✅ existe | NO TOCAR (push module separado) |
| `notificationChannelEnum` `['email']` | ✅ existe | NO TOCAR (push usa schema separado) |
| `src/lib/web-push.ts` | ❌ MISSING | CREAR |
| `src/modules/notifications/push.service.ts` | ❌ MISSING | CREAR |
| `src/shared/db/schema/push-subscriptions.ts` | ❌ MISSING | CREAR |
| Migration 014 dual-tree | ❌ MISSING | CREAR (014_push_subscriptions.sql + 20260528000001_*.sql) |
| `public/sw.js` Service Worker | ❌ MISSING | CREAR |
| `src/components/admin/PushNotificationManager.tsx` | ❌ MISSING | CREAR |
| 4 API routes `/api/admin/push/*` | ❌ MISSING | CREAR |
| `pg-boss QUEUE_PUSH_SEND` + worker | ❌ MISSING | CREAR |
| Hook en `mp-webhook.handler.ts` post-transition | ❌ MISSING | EDITAR (1 línea + import) |
| VAPID env vars (4) | ❌ MISSING | AGREGAR |
| CSP `worker-src 'self'` | ❌ MISSING | EDITAR `next.config.js` |
| `public/sounds/notification.mp3` | ❌ MISSING | CREAR |
| Tests push-* (unit/integration/E2E) | ❌ MISSING | CREAR |

Dep nueva: **web-push** (server-side VAPID encryption). NO `@types/web-push` necesario en deps de prod (typed inline).

Env nuevas (4):
- `VAPID_PUBLIC_KEY` (server, min 80 chars)
- `VAPID_PRIVATE_KEY` (server, min 40 chars)
- `VAPID_SUBJECT` (server, mailto:contact@turnogol.app)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client, debe matchear VAPID_PUBLIC_KEY)

## Decisión consciente: scope F9

- **F9 SÍ implementa** Web Push API al admin. CLAUDE.md tech stack lo confirma ("Web Push API"); MASTER_PLAN línea 211 lo confirma.
- **F9 NO implementa** US-NOT-003 in-app bell badge (out-of-scope: doc8 line 1477 dice "NO incluye push notifications nativas" pero refiere al EPIC NOT-003 que es la campana persistente in-app — backlog v1.5).
- **F9 NO implementa** recordatorios player. F7 deferred los dejó (US-RES-006 24h/2h pre-turno).
- **F9 SÍ dispara** push al admin del tenant cuando booking online se confirma (transitionFromPendingPayment → confirmed). NO dispara para `createManualBooking` (admin lo creó él mismo → ya lo sabe).
- **F9 NO dispara** push para cancel/no-show/diferencia caja (US-NOT-003 los lista; backlog v1.5).
- Sonido fijo (CLAUDE.md: "sonido fijo, no configurable"). User puede habilitar/deshabilitar globalmente; no elige qué evento suena.

## Schema push_subscriptions

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_staff
  ON push_subscriptions(tenant_id, staff_user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subs_admin_select ON push_subscriptions FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY push_subs_admin_modify ON push_subscriptions FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    AND staff_user_id = current_setting('app.current_staff_user_id', true)::uuid
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    AND staff_user_id = current_setting('app.current_staff_user_id', true)::uuid
  );
```

Worker bypassa RLS via service-role (cleanup 410-gone, no tenant context disponible).

## Tasks

### T1 — Schema push_subscriptions + migration 014 dual-tree

**Archivos nuevos:**
- `src/shared/db/schema/push-subscriptions.ts` — Drizzle table def.
- `src/shared/db/migrations/014_push_subscriptions.sql` — SQL idempotente con RLS.
- `supabase/migrations/20260528000001_push_subscriptions.sql` — mismo contenido SQL.

**Archivos editados:**
- `src/shared/db/schema/index.ts` — export pushSubscriptions.

**Tests:** ninguno nuevo en T1 (migration aplica via CI loop sin error; schema parsea typecheck).

**Commit:** `audit(f09): add push_subscriptions schema + migration 014 dual-tree`

### T2 — VAPID env + web-push lib wrapper + Sentry

**Deps nuevas:** `web-push@^3.6.7` (prod).

**Archivos nuevos:**
- `src/lib/web-push.ts` — wrapper sobre `web-push` npm lib. `setVapidDetails` lazy init. `sendPushNotification(subscription, payload): Promise<{success, statusCode?, gone?}>`. Payload size check (4KB max). 410-gone returns `{success:false, gone:true}`. Other errors return `{success:false, statusCode}`. Sentry track on `'notification.push.sent'` y `'notification.push.failed'` con statusCode.

**Archivos editados:**
- `src/shared/env.ts` — agregar 4 VAPID vars al schema Zod.
- `.env.example` — agregar VAPID vars con comentario `# Generar con: npx web-push generate-vapid-keys`.
- `.env.test.example` — agregar VAPID test values.
- `src/shared/observability.ts` o donde track esté — agregar `track.notification` namespace si no existe (sino reusar `track(...)`).

**Tests nuevos:**
- `tests/unit/web-push.test.ts` — payload size validation, 410 handling, 4xx vs 5xx, Sentry track called.

**Commit:** `audit(f09): add VAPID env + web-push wrapper + Sentry tracking`

### T3 — Push service + pg-boss queue + worker + booking hook

**Archivos nuevos:**
- `src/modules/notifications/push.service.ts` — `notifyAdminPush(tenantId, payload)` carga `push_subscriptions` del tenant (service-role getSql), enqueue 1 pg-boss job `QUEUE_PUSH_SEND` por subscription. NO usa la tabla `notifications` (canal push fuera del enum).
- `src/shared/jobs/workers/push.worker.ts` — fetch subscription by id, call `sendPushNotification`. On `gone: true` DELETE row. On success UPDATE `last_used_at = now()`. Throws on non-gone failure (pg-boss retries).

**Archivos editados:**
- `src/shared/jobs/definitions.ts` — agregar `QUEUE_PUSH_SEND = 'push-send'`, `PushSendJobData = { subscription_id: string, payload: PushPayload }`, `PUSH_SEND_SEND_OPTIONS = { retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInHours: 1 }`.
- `src/shared/jobs/workers/index.ts` (o bootstrap equivalente) — registrar push worker.
- `src/modules/payments/mp-webhook.handler.ts` — después del `transitionFromPendingPayment(bookingId, 'confirmed', tx)` en el branch `payment` deposit, capturar `bookingId`, `courtName`, `dateLabel`, `timeLabel`. Llamar `notifyAdminPush(tenantId, payload)` DESPUÉS de que `withTenantContext` commitee. Mismo pattern que `dispatchEmail` después de commit.

**Push payload type (max 4KB encrypted):**
```ts
type PushPayload = {
  type: 'booking.confirmed_online'
  bookingId: string
  courtName: string
  dateLabel: string  // "lun 28/05"
  timeLabel: string  // "20:00 — 21:00"
  url: string        // "/admin/grilla?date=2026-05-28&highlight={bookingId}"
}
```

**Tests nuevos:**
- `tests/unit/push-service.test.ts` — `notifyAdminPush` carga subs, enqueue por sub. 0 subs → no-op.
- `tests/unit/push-worker.test.ts` — happy: sub existe, web-push OK, last_used_at updated. Gone (410): DELETE row. Other error: throws.
- `tests/integration/push-dispatch-on-booking-confirmed.test.ts` — seed admin + sub + booking pending_payment, simular webhook MP approved → assert 1 push job encolado.

**Commit:** `audit(f09): add push.service + worker + dispatch hook on booking confirmation`

### T4 — API routes subscribe/unsubscribe/vapid/test

**Archivos nuevos:**
- `src/app/api/admin/push/subscribe/route.ts` — POST. Zod input `{endpoint, keys:{p256dh, auth}, userAgent?}`. Admin auth via JWT (tenant_id + staff_user_id). UPSERT (endpoint UNIQUE, ON CONFLICT update keys + last_used_at). Returns `{success, subscriptionId}`.
- `src/app/api/admin/push/unsubscribe/route.ts` — POST (Next 14 route handler; DELETE method tricky con body). Zod `{endpoint}`. DELETE scoped a `tenant_id + staff_user_id`. Returns `{success, deleted: boolean}`.
- `src/app/api/admin/push/vapid/route.ts` — GET. Returns `{publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}`. Sin auth (key es pública igual). Rate-limit Upstash por IP si configurado.
- `src/app/api/admin/push/test/route.ts` — POST. Admin auth. Carga subs del current staff, enqueue test payload `{type:'test', courtName:'Test', dateLabel:'hoy', timeLabel:'ahora', url:'/admin/grilla'}`. Returns `{dispatched: number}`.

**Tests nuevos:**
- `tests/integration/push-subscribe-rls.test.ts` — admin A POST subscribe → DB row con tenant_id=A. Admin B intenta DELETE con endpoint de A → 0 rows affected.
- `tests/integration/push-test-endpoint.test.ts` — POST /test sin sub → `{dispatched: 0}`. Con sub → `{dispatched: 1}` + pg-boss queue tiene job.

**Commit:** `audit(f09): add 4 admin push API routes (subscribe/unsubscribe/vapid/test)`

### T5 — Service Worker + PushNotificationManager + sound

**Archivos nuevos:**
- `public/sw.js` — minimal SW. `self.addEventListener('install', ()=>self.skipWaiting())`. `self.addEventListener('activate', e=>e.waitUntil(self.clients.claim()))`. `self.addEventListener('push', async e => { const data = e.data.json(); const bc = new BroadcastChannel('notif-dedupe'); const acked = new Promise(res => { const t = setTimeout(() => res(false), 100); bc.onmessage = m => { if (m.data.id === data.id && m.data.ack) { clearTimeout(t); res(true); } }; bc.postMessage({ id: data.id }); }); e.waitUntil(acked.then(wasAcked => { if (!wasAcked) return self.registration.showNotification(title, { body, data: { url } }); })); })`. `notificationclick` → focus existing /admin tab matching origin, else `clients.openWindow(url)`.
- `public/sounds/notification.mp3` — short chime, CC0, ≤30KB. (Implementer puede generar con tone.js stub o usar placeholder).
- `src/components/admin/PushNotificationManager.tsx` — client island. On mount: `navigator.serviceWorker.register('/sw.js', { scope: '/admin/' })`. Estados: `permission: Notification.permission`, `subscribed: boolean` (chequea `pushManager.getSubscription`). UI: si `default` → button "Habilitar notificaciones" → request permission + subscribe + POST /api/admin/push/subscribe + localStorage `notif_sound_enabled='1'`. Si `denied` → empty (no nag). Si `granted` y subscribed → null (nothing). Listener `BroadcastChannel('notif-dedupe')`: en mensaje `{id}` sin `ack`, primer tab que reciba responde `{id, ack:true}` y muestra `toast({ title: courtName, description: `${dateLabel} ${timeLabel}`, variant: 'success' })` + Audio play. `useEffect` cleanup BC close.
- `src/components/admin/PushNotificationToggle.tsx` (opcional, integra al PushNotificationManager si se quiere botón persistente en settings).

**Archivos editados:**
- `src/app/(admin)/layout.tsx` — montar `<PushNotificationManager />` (client island, no afecta SSR).

**Tests nuevos:**
- `tests/unit/push-broadcast-dedupe.test.ts` — mock BroadcastChannel + setTimeout, asegura primer ack gana y resto suprime.

**Commit:** `audit(f09): add Service Worker + client subscription manager + sound + dedupe`

### T6 — CSP + manifest + E2E + report sound limitations

**Archivos editados:**
- `next.config.js` — agregar `"worker-src 'self'"` al CSP array. Verificar `connect-src 'self'` cubre `/api/admin/push/*`.
- `src/app/manifest.ts` — confirmar `display: 'standalone'`, `scope: '/'`, `start_url: '/'`. Documentar limitación iOS Safari Push requiere PWA install (iOS 16.4+).

**Tests nuevos:**
- `tests/integration/push-worker-410-cleanup.test.ts` — mock `webpush.sendNotification` throw `{statusCode: 410}` → worker DELETE row → assert 0 rows.
- `tests/e2e/push.spec.ts` — 2 browser contexts (`adminStorageState` + `secondAdminStorageState` mismo tenant). `permissions: ['notifications']` granted. Ambos navegan a `/admin/grilla`. Ambos confirm subscribe (mock subscription endpoint OR real Chromium-Headless push test mode). Trigger `POST /api/admin/push/test` desde 1 context. Assert toast aparece en EXACTAMENTE 1 context (multi-tab dedupe). Skip Firefox/WebKit si Playwright soporte limitado; documentar workers=1.

**Commit:** `audit(f09): CSP worker-src + manifest + E2E push spec + integration cleanup tests`

### T7 — Verify + bundle + report + prompt F10 + merge

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm test` — full suite incluyendo nuevos unit. Tolerar 2 pre-existentes zod-coverage F4 + 1 F8 (NO regresión).
- `pnpm test:integration` — `race-expiry-vs-confirm` debe pasar (F9 NO regresiona). Nuevos integration verdes.
- `pnpm build` — rutas admin `<200KB`. PushNotificationManager debe ser tree-shaken (client island) — esperado +1-2 kB en `/admin/*` por Service Worker registration JS. Bundle assert.
- Generar `docs/audit/reports/fase-f09-notificaciones-report.md` house-style.
- Actualizar `docs/audit/STATE.md` (F9 → completed, 22/26).
- **Generar prompt F10 EN EL CHAT (paso 11 workflow)** antes de commits/merge — F4 se quedó sin tokens en cleanup post-merge.
- Commits con prefijo `audit(f09):`. Merge `audit/frontend-f09 → main` con `--no-ff`. Push origin main. Worktree cleanup (rm + prune + branch -d).

**Commit:** `audit(f09): report + STATE.md update — Notificaciones complete (22/26)`

## Riesgos & mitigaciones

| Riesgo | Mitigación |
|---|---|
| iOS Safari Push solo funciona en PWA installed | Documentar limitación en report + UI muestra "Habilitar notificaciones" igual; iOS user ve mensaje "Instalá la app desde Compartir → Añadir a inicio" |
| Multi-tab dedupe BroadcastChannel NO soportado en Safari <15.4 | Fallback: `localStorage` event sentinel — primer tab sets `last_notif_id`; otros leen storage + suprimen. v1 puede aceptar Safari <15.4 sin dedupe (showNotification 2x es subóptimo no roto). |
| E2E Playwright Web Push API limitaciones cross-browser | Spec marca `test.describe.serial` + workers=1 + chromium-only en primera versión. Firefox/WebKit skip con comentario. Multi-tab dedupe assert con 2 contexts del mismo browser. |
| Payload > 4KB encrypted | F9 hard limit en `sendPushNotification` con error claro. Payload v1 ~250 bytes. |
| VAPID keys faltantes en `.env.test` rompe integration tests | T2 agrega valores de test válidos en `.env.test.example` + integration helpers stub `web-push.sendNotification` (no envía real). |
| Service Worker scope `/admin/` puede no aplicar si el SW está en `/sw.js` (max scope = ubicación archivo) | Mover SW a `/admin/sw.js` rompe Next 14 public layout. Alternativa: `Service-Worker-Allowed: /` header in next.config + scope explícito. Documentar. |
| Push deshabilita la grilla F3 (SW intercepta fetch) | `sw.js` NO implementa `fetch` listener. Solo `push`, `notificationclick`, `install`, `activate`. F3 fetch sigue red. |
| User cierra tab durante push → sound no toca | Esperado. SW `showNotification` es el fallback; el chime in-page es solo para tabs abiertos. |

## Criterios de éxito (post-T7)

- ✅ 3/3 done-criteria MASTER_PLAN F9.
- ✅ Schema dual-tree + RLS funcional.
- ✅ Push end-to-end: subscribe → DB → confirmed booking → pg-boss → web-push → SW → toast multi-tab dedupe.
- ✅ E2E push.spec.ts verde (≥1 browser).
- ✅ Sound gesture-bound, no warning console.
- ✅ Bundle admin rutas <200KB.
- ✅ 0 typecheck/lint errors. Tests pre-existentes flaky tolerados.
- ✅ Report F9 con visibility humana + stats acumulados 22/26.
- ✅ Prompt F10 emitido pre-merge.
