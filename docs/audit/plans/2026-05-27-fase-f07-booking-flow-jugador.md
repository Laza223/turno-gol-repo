# Plan — Fase F7: Booking Flow Jugador End-to-End (con/sin seña + MP mock)

> **For agentic workers:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`. Tasks con checkbox `- [ ]`.

**Fecha:** 2026-05-27
**Branch:** `audit/frontend-f07`
**Criticidad:** 🔴🔴🔴 Crítica | **Tiempo estimado:** 2 sesiones
**Referencia:** MASTER_PLAN líneas 198-202; doc7 Flujo 2; doc8 US-RES-003/004/005/006; doc11 ADR-004 (MP Checkout Pro) + ADR-012 (+18); doc15 §bookings/webhooks.

---

## Goal

El jugador reserva sin trabarse: ve el slot, completa el form, paga la seña en MercadoPago (o confirma sin seña), y obtiene confirmación **observable** (polling, porque el jugador NO tiene Realtime en v1 — CLAUDE.md). El motor (createOnlineBooking, createDepositPayment, webhook idempotente, cron expire) ya existe y fue auditado en B1/B3/B5/B11. **F7 cierra los gaps de la capa de jugador**: feedback de pago (polling + countdown), reintento de pago, mock de MP para E2E determinista, y **arregla un mismatch P0 del notification_url** que rompe la confirmación por webhook en producción.

**Done-criteria MASTER_PLAN (literal):**
1. E2E completo: search → complejo → slot → form → pago MP mock → confirmación.
2. E2E cancelación MP → reintenta.
3. E2E timeout webhook → polling actualiza.

**Implícito (consistencia fases previas + doc7/US-RES):**
- Bundle `<200KB gz` por ruta pública (`/[slug]/reservar` hoy 155KB; medir post-cambios).
- `loading.tsx` por ruta nueva/tocada (patrón F6).
- Mobile-first 100% (el jugador tipea en celular — design-system §6.2 touch targets ≥44px).
- Tests E2E honestos (sin mentir "passed"); `race-expiry-vs-confirm.test.ts` (B11) sigue verde.

---

## Architecture & Tech Stack

- **Server Action `createBookingAndCheckout`** (ya existe) sigue siendo el motor de creación + redirect a MP. NO se agrega endpoint público POST (CLAUDE.md: Route Handlers solo para webhooks/cross-origin/auth; la reserva es same-origin).
- **MP_MOCK_MODE** (env nueva): cuando `=1`, `resolveTenantGateway` devuelve un `MockGateway` cuyo `createPreference` retorna un `initPoint` local (`/mock-mp/checkout?...`) y `getPaymentStatus`/`createRefund` son deterministas. Además, el webhook route procesa **sincrónicamente** (sin pg-boss) en mock mode, para E2E determinista (controlar *cuándo* llega el webhook). En prod (`MP_MOCK_MODE` unset) nada cambia: gateway real + enqueue a pg-boss.
- **Página mock de checkout** `/mock-mp/checkout` (App Router, **404 si `MP_MOCK_MODE!=1`**): 3 botones (Pagar aprobado / Pago rechazado / Cancelar) que disparan Server Actions → POST al webhook real (aprobado) o redirect a back_url failure. Reutilizable para demo local del flujo (visibilidad humana).
- **Polling**: `GET /api/player/bookings/[id]/status` (Route Handler, `withPlayer`, rate-limit tolerante) → `{ status, depositStatus, expiresAt }`. Client component `PaymentStatusWatcher` hace fetch cada 3s.
- **Countdown**: client component `ExpiryCountdown` (M:SS desde `expiresAt = created_at + 15min`). Sin columna nueva (timer es job-driven, ya existe `scheduleBookingExpiry`).
- **Webhook real** `/api/webhooks/mercadopago` (ya existe, idempotente vía `processed_webhooks`). T1 corrige el `notification_url` que apunta a `/api/mp/webhooks` (ruta inexistente).
- Vitest unit + integration; Playwright E2E. shadcn/ui + Tailwind; `Skeleton`/`ErrorState` reusables (F1). `next/image` desde día 1 si hay imágenes (F6).

---

## Hallazgos (severidad + módulo + disposición)

| # | Hallazgo | Sev | Módulo | Disp. |
|---|----------|-----|--------|-------|
| **H1** | **`notification_url` apunta a ruta inexistente.** `payment.service.ts:88` setea `notificationUrl=${appUrl}/api/mp/webhooks?tenant=...` pero el route real es `/api/webhooks/mercadopago` (glob confirma: NO existe `src/app/api/mp/webhooks/route.ts`; `next.config.js` no tiene rewrites). En prod MP postea a 404 → **el webhook nunca llega → la reserva con seña nunca pasa a `confirmed`**. B3 testeó el handler golpeando el route directo, nunca verificó el string. | 🔴 **P0** | MP integración | T1 |
| H2 | **Sin polling de estado de pago.** `/reserva/[bookingId]/pendiente` y `/exito` son estáticas. Si el jugador vuelve de MP antes de que llegue el webhook (doc7: "Confirmando tu pago…" ~5-30s), ve info incorrecta o "confirmada" sin estarlo. Jugador NO tiene Realtime (v1) → necesita polling. Done-criteria 3. | 🔴 **P0** (done-criteria) | Confirmación UX | T4+T5+T6 |
| H3 | **Sin countdown de expiración.** US-RES-005 + doc7 "Timer 15 min". El jugador no ve cuánto le queda para pagar. | 🟡 P1 (UX done-criteria) | Confirmación UX | T5+T6 |
| H4 | **Sin reintento de pago tras rechazo/cancelación en MP.** doc7 PASO 5 + US-RES-003 edge: "El pago no se procesó. ¿Querés reintentar?". `/error` es estático sin acción. Done-criteria 2. | 🔴 **P0** (done-criteria) | Confirmación UX | T6 |
| H5 | **MP no mockeable end-to-end.** `MockGateway` solo se inyecta manualmente en tests unit/integration; no hay flag de entorno ni checkout navegable. El seed E2E usa `requires_deposit=false` → **bypassa MP entero** → el flujo de pago jamás se ejerce en E2E. Done-criteria 1+2+3 imposibles sin esto. | 🔴 **P0** (gating done-criteria) | Test infra | T2+T3+T7 |
| H6 | **0 `loading.tsx`** en `/[slug]/reservar` + `/reserva/[bookingId]/{exito,error,pendiente}`. F6 difirió `reservar/loading.tsx` explícitamente a F7. | 🟡 P2 (consistencia) | Perf percibida | T6 |
| H7 | `/exito` muestra "¡Reserva confirmada!" **incondicionalmente** aunque cargue un booking en `pending_payment` (no chequea `booking.status`). Miente al jugador si el webhook tardó. | 🟡 P1 | Confirmación UX | T6 |

**Out-of-scope F7 (no tocar / diferir):**
- **Cancelación de reserva por el jugador** (US-CAN-001/002): la "cancelación" del done-criteria 2 es **del pago en MP → reintento**, NO cancelar un booking confirmado. El cancel-by-player (`/api/player/bookings/[id]/cancel`) ya existe y se pule en **F8 (Player Area)**.
- **Mis-reservas listado / perfil / data-export / eliminar cuenta** → F8.
- **Recordatorios 24h/2h** (US-RES-006): el cron + templates existen (B5); F7 no los cablea (no es done-criteria). Diferir verificación a F8/F9.
- **"Agregar al calendario" (.ics)** (doc7 PASO 6 / US-RES-003): nice-to-have, no es done-criteria. Diferir a F8 salvo que sobre tiempo en T6.
- **Login con Google / registro inline** (doc7 PASO 2 opciones B/C): F2 ya entregó magic-link; el `LoginGate` actual usa magic-link. Google OAuth fuera de scope v1 de este flujo.
- **Rate-limit explícito `/api/public/*`** (B7 backlog): el endpoint de polling sí lleva guard; el resto queda como está.
- **Schema nuevo**: NO. El timer es `created_at + 15min` calculado; no se agrega columna `expires_at`.

---

## File Structure (cambios previstos)

```
src/
├── modules/payments/
│   ├── payment.service.ts                  [MOD: T1 notificationUrl → /api/webhooks/mercadopago]
│   ├── mp-oauth.ts                          [MOD: T2 resolveTenantGateway → MockGateway si MP_MOCK_MODE]
│   ├── mp-gateway.mock.ts                   [MOD: T2 createPreference→initPoint local; getPaymentStatus decodifica outcome+bookingId del mpPaymentId]
│   └── mock-mp.ts                           [NEW: T2 helpers encode/decode mock payment id + MOCK_INIT_POINT builder]
├── app/
│   ├── api/
│   │   ├── webhooks/mercadopago/route.ts    [MOD: T2 si MP_MOCK_MODE → procesar sincrónico (handleMpWebhookJob) en vez de enqueue]
│   │   └── player/bookings/[id]/status/route.ts  [NEW: T4 GET status polling]
│   ├── (public)/[slug]/reservar/
│   │   ├── actions.ts                       [MOD: T6 retryDepositPaymentAction (re-crear preferencia)]
│   │   └── loading.tsx                      [NEW: T6 Skeleton form]
│   ├── mock-mp/checkout/
│   │   ├── page.tsx                         [NEW: T3 mock checkout, 404 si !MP_MOCK_MODE]
│   │   └── actions.ts                       [NEW: T3 mockPay/mockReject/mockCancel server actions]
│   └── reserva/[bookingId]/
│       ├── exito/page.tsx                   [MOD: T6 si status!=confirmed → render Watcher]
│       ├── pendiente/page.tsx               [MOD: T6 render Watcher + Countdown]
│       ├── error/page.tsx                   [MOD: T6 botón Reintentar pago]
│       ├── exito/loading.tsx                [NEW: T6]
│       ├── pendiente/loading.tsx            [NEW: T6]
│       └── error/loading.tsx               [NEW: T6]
├── components/booking/
│   ├── PaymentStatusWatcher.tsx             [NEW: T5 client, poll 3s, spinner→confirmed/expired]
│   └── ExpiryCountdown.tsx                  [NEW: T5 client, M:SS]
scripts/seed-e2e.ts                          [MOD: T7 tenant deposit-enabled e2e-complejo-sena + court + mpAccessToken mock]
.env.example / .env.test / .env.test.example [MOD: T2 documentar MP_MOCK_MODE]
tests/
├── integration/
│   ├── mp-mock-gateway.test.ts              [NEW: T2 encode/decode + MockGateway determinista]
│   └── webhook-notification-url.test.ts     [NEW: T1 asserta que el route del notificationUrl existe/responde]
├── unit/
│   └── expiry-countdown.test.ts             [NEW: T5 formato M:SS + clamp a 0]
└── e2e/
    └── booking-flow.spec.ts                 [NEW: T8 4 scenarios]
```

**Total estimado:** ~22 archivos.

---

## Tasks

### T1: Fix `notification_url` mismatch (🔴 P0 H1)
**Files:** Modify `src/modules/payments/payment.service.ts:88`; Test `tests/integration/webhook-notification-url.test.ts` (new).

**Subtasks:**
1. **Verificar primero** (no asumir): `grep -rn "api/mp/webhooks" src/ tests/ vercel.json next.config.js 2>/dev/null` y `grep -rn "webhooks/mercadopago" src/`. Confirmar que el handler vive en `src/app/api/webhooks/mercadopago/route.ts` y que NO hay rewrite ni `/api/mp/webhooks/route.ts`. Si apareciera un rewrite, ajustar el fix en consecuencia y documentarlo.
2. En `createDepositPayment`, cambiar:
   ```ts
   notificationUrl: `${appUrl}/api/mp/webhooks?tenant=${booking.tenantId}`,
   // →
   notificationUrl: `${appUrl}/api/webhooks/mercadopago?tenant=${booking.tenantId}`,
   ```
3. `grep` adicional por el string `/api/mp/webhooks` en TODO el repo (incluye docs de runbook/doc19): si hay docs que documentan la URL vieja, NO tocar docs en esta task (anotar para el report); solo el código productivo.
4. Test de regresión `webhook-notification-url.test.ts`: construir el `CreatePreferenceInput` que arma `createDepositPayment` (vía un `MockGateway` que capture el input) y assertar `input.notificationUrl` termina en `/api/webhooks/mercadopago?tenant=<tenantId>`. Idealmente además: que `GET`/`POST` a ese path resuelva el route (no 404). Si invocar el route es caro, basta con assertar el path + un comentario explicando el porqué (B3 lo testeó aislado).

**Done-when:** `pnpm test:integration tests/integration/webhook-notification-url.test.ts` verde; `grep "/api/mp/webhooks" src/` sin hits en código productivo. Documentar en el report como hallazgo P0.

---

### T2: MP_MOCK_MODE — gateway seam + webhook síncrono (🔴 P0 H5)
**Files:** New `src/modules/payments/mock-mp.ts`; Modify `src/modules/payments/mp-oauth.ts` (`resolveTenantGateway`), `src/modules/payments/mp-gateway.mock.ts`, `src/app/api/webhooks/mercadopago/route.ts`; docs env (`.env.example`, `.env.test`, `.env.test.example`); Test `tests/integration/mp-mock-gateway.test.ts`.

**Contexto clave:** `resolveTenantGateway(tenantId, encryptedAccessToken)` (mp-oauth.ts:109) construye `new MercadoPagoGateway(...)` que en su ctor llama `mpClient(encryptedAccessToken)` → `decrypt(...)`. En mock mode hay que **short-circuitar ANTES** del ctor (el token del seed será un placeholder sin encriptar). El webhook route hoy hace `boss.send(QUEUE_PROCESS_MP_WEBHOOK, job, ...)`; en mock mode debe procesar inline.

**Subtasks:**
1. `src/modules/payments/mock-mp.ts`:
   ```ts
   export const MP_MOCK_ENABLED = process.env.MP_MOCK_MODE === '1'
   // mpPaymentId determinista que codifica outcome + bookingId, para que
   // getPaymentStatus pueda devolver externalReference sin acceso a DB.
   export type MockOutcome = 'approved' | 'rejected'
   export function buildMockPaymentId(outcome: MockOutcome, bookingId: string): string {
     return `MOCK-${outcome.toUpperCase()}-${bookingId}`
   }
   export function parseMockPaymentId(id: string): { outcome: MockOutcome; bookingId: string } | null {
     const m = /^MOCK-(APPROVED|REJECTED)-([0-9a-f-]{36})$/i.exec(id)
     if (!m) return null
     return { outcome: m[1]!.toLowerCase() as MockOutcome, bookingId: m[2]! }
   }
   export function buildMockEventId(bookingId: string, outcome: MockOutcome): string {
     return `mock-evt-${outcome}-${bookingId}` // idempotencia: 1 event id por (booking,outcome)
   }
   export function mockCheckoutInitPoint(appUrl: string, bookingId: string, prefId: string): string {
     return `${appUrl}/mock-mp/checkout?booking=${bookingId}&pref=${prefId}`
   }
   ```
2. `mp-gateway.mock.ts` — extender `MockGateway` para que `createPreference(input)` devuelva `{ preferenceId, initPoint: mockCheckoutInitPoint(...), sandboxInitPoint }` usando `process.env.NEXT_PUBLIC_APP_URL` y el `input.bookingId`; y `getPaymentStatus(mpPaymentId)` use `parseMockPaymentId` → si `approved` retorna `{ mpPaymentId, status:'approved', amount: <positivo, e.g. 1>, externalReference: bookingId }`, si `rejected` → `status:'rejected'`. (El `amount` es artefacto mock; las assertions E2E chequean `booking.status`, no el monto.) **No romper** los usos existentes de `MockGateway` en tests (mantener el modo "record calls" actual o agregar un flag al ctor). Revisar `mp-gateway.mock.ts:22-80` y `payment.types.ts` (`GatewayPaymentInfo`, `PreferenceResult`) para firmas exactas.
3. `resolveTenantGateway` (mp-oauth.ts): al inicio,
   ```ts
   if (MP_MOCK_ENABLED) return new MockGateway()
   ```
   (importar `MP_MOCK_ENABLED` + `MockGateway`). Esto cubre el flujo de seña del jugador. NO tocar `billing.gateway.ts` (SaaS, fuera de scope).
4. Webhook route (`/api/webhooks/mercadopago/route.ts`): tras armar `job`, en vez de `boss.send(...)`:
   ```ts
   if (MP_MOCK_ENABLED) {
     await handleMpWebhookJob(job)   // procesar inline, determinista para E2E
   } else {
     const boss = await getBoss(); await boss.send(QUEUE_PROCESS_MP_WEBHOOK, job, MP_WEBHOOK_SEND_OPTIONS)
   }
   ```
   Verificar que `handleMpWebhookJob` está exportado en `mp-webhook.handler.ts` y que auto-resuelve gateway+tx (resuelve a Mock vía paso 3). Importarlo. Si lanza, devolver 500 (igual que el path enqueue).
5. Env docs: agregar a `.env.example` y `.env.test.example` (y setear en `.env.test` para que la suite E2E lo herede):
   ```
   # E2E/local only — mock MercadoPago (no llamadas reales). Prod: dejar sin setear.
   MP_MOCK_MODE=1
   ```
   **NO** setear en `.env.local` (que se usa para dev real contra MP sandbox si el usuario quiere). Anotar en el report que CI debe exportar `MP_MOCK_MODE=1` para el job E2E.
6. Test `mp-mock-gateway.test.ts`: round-trip `buildMockPaymentId`/`parseMockPaymentId` (incluye uuid real); `MockGateway.getPaymentStatus(buildMockPaymentId('approved', id))` → `status:'approved'`, `externalReference:id`; `createPreference` → `initPoint` contiene `/mock-mp/checkout`.

**Done-when:** `pnpm test:integration tests/integration/mp-mock-gateway.test.ts` verde; `pnpm typecheck` clean; usos previos de `MockGateway` en la suite siguen pasando.

---

### T3: Página mock de checkout MP (🔴 P0 H5)
**Files:** New `src/app/mock-mp/checkout/page.tsx`, `src/app/mock-mp/checkout/actions.ts`.

**Subtasks:**
1. `page.tsx` (Server Component, `export const dynamic = 'force-dynamic'`):
   - Si `process.env.MP_MOCK_MODE !== '1'` → `notFound()` (import `next/navigation`). Garantiza 404 en prod.
   - Leer `searchParams.booking` (+ `pref` opcional). Cargar resumen mínimo del booking vía `withTenantContext`/service-role read (cancha, fecha, hora, deposit_amount) para que la pantalla muestre "Estás pagando $X de seña". Si no existe → `notFound()`.
   - Render mobile-first (max-w-md, centrado): título "MercadoPago (MOCK)", resumen, y un `<form>` con 3 botones que invocan las server actions (formAction): **"Pagar (aprobado)"**, **"Pago rechazado"**, **"Cancelar"**. Banner visible "⚠ Entorno de prueba — no se cobra dinero real". Touch targets ≥44px (h-11+).
2. `actions.ts` (`'use server'`):
   - `mockPay(formData)`: `bookingId = formData.get('booking')`. Resolver `tenantId` del booking (`findTenantByBookingId` o un SELECT). `POST` (fetch) a `${appUrl}/api/webhooks/mercadopago?tenant=${tenantId}` con header `x-webhook-secret: <env del verificador>` y body JSON que matchee `webhookPayloadSchema`:
     ```ts
     { id: buildMockEventId(bookingId,'approved'), type: 'payment', data: { id: buildMockPaymentId('approved', bookingId) } }
     ```
     Luego `redirect(`/reserva/${bookingId}/exito`)`. (El webhook en mock mode procesó sincrónico → booking ya `confirmed`.)
   - `mockReject(formData)`: POST análogo con `'rejected'` (el booking queda `pending_payment`), `redirect(`/reserva/${bookingId}/error`)`.
   - `mockCancel(formData)`: sin POST, `redirect(`/reserva/${bookingId}/error`)` (jugador abandonó).
   - Leer el secret del mismo lugar que `verifyWebhookSecret` (revisar `src/modules/payments/webhook-auth.ts` para el nombre exacto del env, p. ej. `MP_WEBHOOK_SECRET`). En `.env.test` debe existir ese secret.
   - Revisar la firma exacta de `webhookPayloadSchema` (`src/modules/payments/payment.schema.ts`) — `id` puede ser number|string; ajustar el body.

**Done-when:** con `MP_MOCK_MODE=1` + `pnpm dev`, navegar a `/mock-mp/checkout?booking=<id pending>` muestra los 3 botones; "Pagar" confirma el booking (verificable en `/reserva/<id>/exito`) y "Cancelar" lleva a `/error`. Sin `MP_MOCK_MODE` → 404. Visibilidad humana: screenshot en el report.

---

### T4: Endpoint de polling de estado (🔴 P0 H2)
**Files:** New `src/app/api/player/bookings/[id]/status/route.ts`. Revisar patrón en `src/app/api/player/bookings/[id]/route.ts` (usa `withPlayer` + `guard('playerBooking', user.playerId)` + `uuid.safeParse`).

**Subtasks:**
1. Implementar `GET` con `withPlayer` (RLS player vía `app.current_player_id`). Rate-limit: como el watcher poll-ea cada 3s, NO reusar `guard('playerBooking')` si es estricto — revisar `src/shared/rate-limit/route-guard.ts` y los buckets en su config. Si `playerBooking` es < ~30/min, agregar un bucket nuevo `bookingStatus` con límite tolerante (p. ej. 60/min) y usarlo aquí. Si ya es holgado, reusarlo.
2. Validar `id` con `uuid.safeParse(req.nextUrl.pathname.split('/').at(-2))` (ojo: `.at(-1)` es `"status"`, el id es el penúltimo segmento). Devolver 400 si inválido.
3. Query (player-scoped tx):
   ```sql
   SELECT status, deposit_status, created_at FROM bookings WHERE id = ${id} LIMIT 1
   ```
   404 si no hay fila (RLS oculta bookings de otros players → null → 404).
4. Respuesta:
   ```ts
   { data: { status, depositStatus, expiresAt: <created_at + 15min ISO> } }
   ```
   (15 min = constante compartida; reusar `DEPOSIT_TIMER_MINUTES` si se exporta, o definir local con comentario.)

**Done-when:** `curl -H cookie ... /api/player/bookings/<id>/status` → JSON con status/expiresAt; 404 para booking ajeno; rate-limit no estrangula 1 req/3s. Cubierto por E2E (T8).

---

### T5: Client components Watcher + Countdown (🔴 P0 H2/H3)
**Files:** New `src/components/booking/PaymentStatusWatcher.tsx`, `src/components/booking/ExpiryCountdown.tsx`; Test `tests/unit/expiry-countdown.test.ts`.

**Subtasks:**
1. `ExpiryCountdown.tsx` (`'use client'`): props `{ expiresAt: string }`. `useState`/`useEffect` con `setInterval` 1s; calcula `remaining = max(0, expiresAt - now)`; render `M:SS`. Cuando llega a 0, render "Expirada" (el Watcher hace el resto). Extraer la función pura `formatRemaining(ms): string` (e.g. `65000 → "1:05"`, `0 → "0:00"`, clamp negativos a `"0:00"`) y exportarla para testear.
2. `PaymentStatusWatcher.tsx` (`'use client'`): props `{ bookingId: string; initialStatus: string; expiresAt: string }`.
   - `useEffect` con `setInterval` 3s → `fetch('/api/player/bookings/'+bookingId+'/status')`.
   - Estados: si `status==='confirmed'` → parar polling, render éxito (CheckCircle + "¡Reserva confirmada!" + link "Ver mis reservas"); si `status==='expired'` o terminal `canceled_*` → parar, render "La reserva expiró" + link "Reservar de nuevo" a `/`; si sigue `pending_payment` → spinner "Confirmando tu pago…" + `<ExpiryCountdown expiresAt={expiresAt} />` ("Te queda M:SS para completar el pago").
   - Tras ~30s sin confirmar (doc7), mostrar además "Estamos procesando tu pago. Te avisamos por email." pero **seguir** poll-eando (frecuencia puede bajar a 5s). Limpiar interval en unmount.
   - Sin dependencias nuevas; `lucide-react` ya disponible (íconos Loader2/CheckCircle2/Clock).
3. Test `expiry-countdown.test.ts`: `formatRemaining(65000)==='1:05'`, `formatRemaining(0)==='0:00'`, `formatRemaining(-5000)==='0:00'`, `formatRemaining(600000)==='10:00'`.

**Done-when:** `pnpm test tests/unit/expiry-countdown.test.ts` verde; `pnpm typecheck` clean. Validación visual en T8/verify.

---

### T6: Cablear confirmation pages + retry + loading.tsx (🔴 P0 H2/H4/H7 + 🟡 H6)
**Files:** Modify `src/app/reserva/[bookingId]/{exito,pendiente,error}/page.tsx`, `src/app/(public)/[slug]/reservar/actions.ts`; New `src/app/(public)/[slug]/reservar/loading.tsx` + `src/app/reserva/[bookingId]/{exito,pendiente,error}/loading.tsx`.

**Subtasks:**
1. `pendiente/page.tsx` (es el back_url `pending` de MP — in_process/CBU, y también el destino cuando el complejo no tiene MP token): cargar booking (auth player, patrón de `exito/page.tsx` `loadBooking` que ya usa `withPlayerContext`). Añadir al SELECT `created_at` y `status`. Render `<PaymentStatusWatcher bookingId initialStatus={status} expiresAt={created_at+15min} />`. Mantener mensaje base "Pago en proceso / te avisamos por email".
2. `exito/page.tsx` (back_url `success`): cargar booking + `status` + `created_at` + `deposit_amount` + `price_snapshot`. **Si `status==='confirmed'`** → pantalla de éxito enriquecida (cancha/fecha/hora + "Seña pagada: $Y" + "Resta abonar en el complejo: $(price-deposit)"; si `deposit_status==='not_required'` → "Pagás $X al llegar"). **Si `status!=='confirmed'`** (llegó antes del webhook) → render `<PaymentStatusWatcher .../>` (corrige H7: no mentir). Usar helper de formato centavos→ARS (revisar si existe `formatArs`/equivalente en `src/lib` o `payment.service`; reusar, no duplicar).
3. `error/page.tsx` (back_url `failure`): cargar booking + `status`. Mensaje "El pago no se procesó." Si `status==='pending_payment'` y no expiró → `<form action={retryDepositPaymentAction}>` con hidden `bookingId` + botón **"Reintentar pago"**. Si expiró/terminal → link "Reservar de nuevo" a `/${tenant_slug}` (o `/`).
4. `retryDepositPaymentAction(formData)` en `reservar/actions.ts` (`'use server'`):
   - `bookingId = formData.get('bookingId')`. Auth player (`extractAuthUser`, type player) — debe ser el dueño.
   - Cargar booking (player-scoped): si `status!=='pending_payment'` → redirect a `/reserva/${id}/exito` (ya resuelto) o `/` si terminal.
   - Resolver tenant + `mpAccessToken`. Si hay token: `resolveTenantGateway` + `createDepositPayment(bookingId, gateway, tx, appUrl)` dentro de `withTenantContext` → `redirect(pref.initPoint)`. **OJO:** `createDepositPayment` inserta una fila `payments` nueva y setea `payment_id`; verificar que re-invocarlo sobre el mismo booking no viole constraint (puede haber ya un `payments` pending de la 1ª preferencia). Revisar `chk_booking_payment_consistency` + UNIQUE en payments. Si re-crear preferencia falla por duplicado, la estrategia mínima: permitir nueva preferencia (nueva fila payments pending es aceptable; MP usa la última). Si hay constraint que lo impide, documentar y, como fallback, reusar la preferencia existente (leer `mp_preference_id` del payment pending y reconstruir initPoint) — **decidir leyendo el schema**, no asumir.
   - Si no hay token → redirect a `/reserva/${id}/pendiente`.
5. `loading.tsx` (4 nuevos): Skeleton simple centrado (patrón F6 — `Skeleton` de F1). `reservar/loading.tsx`: skeleton de resumen + botón.

**Done-when:** flujo manual con `MP_MOCK_MODE=1`: pending muestra spinner+countdown y flipa a confirmado al pagar; exito con booking confirmado muestra montos; error muestra "Reintentar" que regresa al checkout mock; los 4 `loading.tsx` aparecen en throttled 3G. Bundle `/[slug]/reservar` sigue `<200KB`.

---

### T7: Seed E2E con complejo de seña (🔴 P0 H5)
**Files:** Modify `scripts/seed-e2e.ts`.

**Subtasks:**
1. Agregar al objeto `E2E` ids del complejo con seña:
   ```ts
   depositTenantId: '00000000-0000-4000-8000-000000000030',
   depositTenantSlug: 'e2e-complejo-sena',
   depositCourtId:   '00000000-0000-4000-8000-000000000031',
   ```
2. Nueva fn `seedDepositTenantAndCourt(sql)`: tenant `status:'active'`, **`settings.requires_deposit=true`, `deposit_percentage:50`**, `allow_online_booking:true`, mismas `opening_hours`/pricing que el court existente (reusar el objeto `pricing` 60→10000/120→18000). **Setear `mp_access_token` a un placeholder NO encriptado** (p. ej. `'mock-mp-token'`) — en `MP_MOCK_MODE` `resolveTenantGateway` short-circuita antes de desencriptar, así que el valor no se usa; pero `actions.ts:118` requiere `mpAccessToken != null` para entrar al path de MP. Insertar court `online` con ese pricing.
3. Relacionar el player E2E existente con el nuevo tenant (`player_tenant_relationships` insert para `depositTenantId` + `playerId`), para que el jugador autenticado pueda reservar ahí.
4. Extender `cleanup(sql)`: borrar en orden reverse-FK todo lo de `depositTenantId` (payments, bookings, courts, ptr, ...). Agregar al bloque de DELETE del tenant fijo (replicar las líneas del `E2E.tenantId` para `E2E.depositTenantId`).
5. Llamar `seedDepositTenantAndCourt` en `main()` tras `seedTenantAndCourt`. Loguear el nuevo slug.

**Done-when:** `pnpm e2e:seed` OK e idempotente (correr 2x sin error); el tenant `e2e-complejo-sena` existe `active` con `requires_deposit=true` + court online + ptr del player. **NO** romper los E2E que dependen de `e2e-complejo-demo` (requires_deposit=false).

---

### T8: E2E `booking-flow.spec.ts` — los 3 done-criteria (🔴 P0)
**Files:** New `tests/e2e/booking-flow.spec.ts`. Reusar `tests/e2e/fixtures.ts` (`playerStorageState`, worker-scoped). Correr con `MP_MOCK_MODE=1` (heredado de `.env.test`).

**Contexto:** slug con seña = `e2e-complejo-sena` (T7). El grid de `/[slug]` linkea a `/[slug]/reservar?court=<id>&date=<YYYY-MM-DD>&time=<HH:MM>&dur=60`. El form de reservar (player logueado) tiene `ConfirmBookingButton` → `createBookingAndCheckout` → redirect a `initPoint` (= `/mock-mp/checkout?...` en mock mode). Elegir una fecha futura dentro de `booking_advance_days:6` y un horario libre. Limpiar bookings creados en `finally` (service-role DELETE por court+date).

**Scenarios:**
1. **Happy path con seña → confirmación (done-criteria 1):** player (storageState) navega a `/e2e-complejo-sena` (o directo a `/e2e-complejo-sena/reservar?...`), confirma → aterriza en `/mock-mp/checkout` → click "Pagar (aprobado)" → redirect a `/reserva/<id>/exito` → assert "¡Reserva confirmada!" + montos visibles. Verificar en DB `status='confirmed'`, `deposit_status='confirmed'`.
2. **Cancelación MP → reintenta (done-criteria 2):** crear reserva → en `/mock-mp/checkout` click "Pago rechazado" (o "Cancelar") → `/reserva/<id>/error` → assert booking sigue `pending_payment` → click "Reintentar pago" → vuelve a `/mock-mp/checkout` → "Pagar (aprobado)" → `/exito` confirmado.
3. **Timeout webhook → polling actualiza (done-criteria 3):** crear reserva → ir directo a `/reserva/<id>/pendiente` (simula volver de MP antes del webhook) → assert spinner "Confirmando tu pago…" + countdown visible y booking aún `pending_payment` → disparar el webhook fuera de banda (`request.post('/api/webhooks/mercadopago?tenant=<depositTenantId>', { headers:{'x-webhook-secret':...}, data:{ id, type:'payment', data:{ id: MOCK-APPROVED-<bookingId> } } })`) → esperar (poll) a que el Watcher haga su fetch (≤3-4s) → assert UI cambió a confirmado (`expect(page.getByText('¡Reserva confirmada!')).toBeVisible({ timeout: 8000 })`).
4. **Regresión sin seña (done-criteria implícito):** player reserva en `e2e-complejo-demo` (requires_deposit=false) → confirma → redirect directo a `/reserva/<id>/exito` con `status='confirmed'` (sin pasar por checkout). Assert NO se navega a `/mock-mp/checkout`.

**Done-when:** `pnpm exec playwright test tests/e2e/booking-flow.spec.ts` verde local con `MP_MOCK_MODE=1` (suite full delegada a CI). Cleanup deja la DB como antes.

---

### T9: Verify final + report + STATE + prompt F8 (gating — ejecuta el CONTROLLER, no subagente)
**Goal:** Trust-but-verify. F3/F4/F5/F6 cazaron bugs leyendo diffs; replicar escrutinio.

**Subtasks:**
1. `pnpm typecheck` clean.
2. `pnpm lint` clean.
3. `pnpm test` (unit) — nuevos verdes; 2 fallos pre-existentes `zod-coverage` `bookings/[id]/{complete,no-show}` esperados (NO regresión).
4. `pnpm test:integration` — nuevos verdes; **`race-expiry-vs-confirm.test.ts` DEBE pasar**; flaky pre-existentes esperados (`daily-close-idempotency`, `race-abonado-vs-individual`).
5. `pnpm build` clean + First Load JS `/[slug]/reservar` y `/reserva/[bookingId]/*` `<200KB gz`.
6. `pnpm e2e:seed` + `pnpm exec playwright test tests/e2e/booking-flow.spec.ts` con `MP_MOCK_MODE=1`.
7. **Trust-but-verify diff scan:** notification_url efectivamente cambiado; `MockGateway` no rompe usos previos; webhook route mock-branch no afecta prod path; mock checkout `notFound()` sin `MP_MOCK_MODE`; polling endpoint valida el segmento correcto (`-2`, no `-1`); Watcher limpia intervals; retry no viola constraints de payments; seed idempotente.
8. Generar `docs/audit/reports/fase-f07-booking-flow-jugador-report.md` (house-style).
9. Actualizar `docs/audit/STATE.md` (F7 → completed 20/26; backlog; deferidos).
10. **Generar prompt F8 ANTES de commits/merge** (timing crítico — la sesión F4 se quedó sin tokens en el cleanup).

**Done-when:** 6 checks verdes (con caveats pre-existentes documentados); report + STATE + prompt F8 listos.

---

## Stats acumulados esperados post-F7

- **Fases: 20/26** (B0-B11 + F0-F7).
- **Tests nuevos:** ~10 (1 integration webhook-url + 1 integration mp-mock + 1 unit countdown + 4 E2E scenarios + posibles helpers).
- **Bugs fixed:** +1 **P0** (notification_url) → 39 acumulados.
- **Migraciones:** 0 (F7 no toca schema).
- **Env nueva:** `MP_MOCK_MODE` (documentada; CI debe exportarla para E2E).
- **Bundle:** `/[slug]/reservar` + `/reserva/[bookingId]/*` documentados `<200KB`.

---

## Hand-off al humano

Después del merge F7: trigger humano confirmar continuar con **F8 (Player Area**, MASTER_PLAN 204-208, criticidad 🟡 Media) o pausar. NO preguntar entre tasks.
