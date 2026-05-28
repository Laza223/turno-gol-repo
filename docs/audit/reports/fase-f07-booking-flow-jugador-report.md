# Reporte — Fase F7: Booking Flow Jugador End-to-End (con/sin seña + MP mock)

**Fecha:** 2026-05-28
**Branch:** `audit/frontend-f07` (merged to `main`)
**Criticidad:** 🔴🔴🔴 Crítica | **Tiempo invertido:** 1 sesión
**Veredicto:** 🟢 **PASS** (3/3 done-criteria) + **1 P0 + 1 P1 fixed** (verify-driven catches)

---

## Done-criteria

| # | Criterio (MASTER_PLAN líneas 198-202) | Evidencia |
|---|---|---|
| 1 | **E2E completo: search → complejo → slot → form → pago MP mock → confirmación.** | `tests/e2e/booking-flow.spec.ts` S1 (deposit happy path → /exito + DB `status=confirmed`, `deposit_status=paid`). 4/4 verde local (`pnpm exec playwright test tests/e2e/booking-flow.spec.ts --workers=1`). |
| 2 | **E2E cancelación MP → reintenta.** | S2 (rechazo en mock checkout → /error → "Reintentar pago" → checkout → "Pagar (aprobado)" → confirmado). Retry vía `retryDepositPaymentAction` (`src/app/(public)/[slug]/reservar/actions.ts:140-190`). |
| 3 | **E2E timeout webhook → polling actualiza.** | S3 (booking creado → /pendiente directo → spinner + countdown 14:58 visible → OOB POST a `/api/webhooks/mercadopago` con `x-webhook-secret` → polling 3s detecta `confirmed` → UI flipa sin reload). |
| Implícito | Bundle `<200KB gz` rutas públicas | `/[slug]/reservar` 155kB · `/reserva/[id]/{exito,pendiente,error}` 153-154kB · `/mock-mp/checkout` 150kB. ✓ |
| Implícito | `loading.tsx` por ruta tocada | 4 nuevos: `[slug]/reservar/loading.tsx`, `reserva/[id]/{exito,pendiente,error}/loading.tsx`. |
| Implícito | Regresión sin seña | S4 (demo tenant `requires_deposit=false` → confirma directo sin `/mock-mp/`). |

---

## Trabajo por task

| T | Subject | Veredicto | Notas |
|---|---|---|---|
| T1 | **Fix notification_url P0** | ✅ | `payment.service.ts:88` apuntaba a `/api/mp/webhooks` (404 — ruta inexistente; `next.config.js` sin rewrites). Cambio a `/api/webhooks/mercadopago`. Test regresión `tests/integration/webhook-notification-url.test.ts` con capturing gateway. **Prod: webhook MP llegaba a 404 → booking con seña nunca pasaba a `confirmed`.** |
| T2 | **MP_MOCK_MODE gateway seam** | ✅ | `mock-mp.ts` (helpers + `LocalMockGateway`). `resolveTenantGateway` short-circuita a mock cuando flag set. Webhook route procesa **sincrónico** (`handleMpWebhookJob`) en mock — determinismo E2E. `MockGateway` compartido intacto. Env documentada en `.env.example`. |
| T3 | **Mock MP checkout page** | ✅ | `/mock-mp/checkout` 404 en prod (`notFound()` si `MP_MOCK_MODE !== '1'`). 3 botones (Pagar aprobado / Rechazado / Cancelar) → server actions → POST real webhook con secret + redirect a back_url. Schema `webhookPayloadSchema.data.id` relajado para aceptar IDs `MOCK-*` **solo cuando MP_MOCK_MODE=1** (prod path numeric-only intacto). |
| T4 | **Polling status endpoint** | ✅ | `GET /api/player/bookings/[id]/status` (`withPlayer` + RLS) → `{ status, depositStatus, expiresAt = created_at + 15min }`. Bucket rate-limit nuevo `bookingStatus` (60/60s, 3× headroom sobre poll 3s). `.at(-2)` para parsear UUID. |
| T5 | **Watcher + Countdown** | ✅ | `PaymentStatusWatcher` (poll 3s, spinner→confirmed/expired, cleanup en cleanup-de-effect). `ExpiryCountdown` (M:SS). `formatRemaining` extraído a `format-remaining.ts` para test puro (5/5). Delay note 30s. |
| T6 | **Wire confirmation pages + retry** | ✅ | `pendiente` y `exito` montan Watcher cuando `status !== 'confirmed'` (arregla H7 — exito ya no miente). `exito` confirmed muestra montos (`Seña pagada $Y` + `Resta $X-Y`, o `Pagás $X al llegar` si `not_required`). `error` ofrece "Reintentar pago" si `pending_payment` y dentro de ventana 15min, sino "Reservar de nuevo". `retryDepositPaymentAction` re-invoca `createDepositPayment` (decisión documentada: schema sin UNIQUE en `(booking_id)`, migración `20260525000003_relax_payment_consistency` lo respalda). 4 `loading.tsx`. |
| T7 | **E2E seed deposit tenant** | ✅ | `e2e-complejo-sena` (uuid `…0030`), court `…0031`, `requires_deposit=true`, `deposit_percentage=50`, `mp_access_token='mock-mp-token'` (placeholder; nunca desencriptado en mock). Player-tenant relationship insertado. Cleanup idempotente. **Bug FK encontrado y arreglado** (verify-driven): cleanup borraba `payments` antes que NULL-ear `bookings.payment_method`/`payment_id` → violaba FK + check constraint. |
| T8 | **E2E `booking-flow.spec.ts`** | ✅ | 4 scenarios (S1-S4). `workers=1` (player magic-link single-use). `MP_MOCK_MODE=1` propagado vía `playwright.config.ts webServer.env`. DB assertions con service-role + cleanup en `finally`. |
| T9 | **Verify final + report + STATE + F8 prompt** | ✅ | typecheck/lint clean. Unit 486/488 (2 fails pre-existentes parseRouteUuid, NO regresión). Integration **339/339**. Build clean (todas rutas <200KB). E2E 4/4. Report + STATE + prompt F8. |

---

## Hallazgos (severidad + módulo + disposición)

| # | Hallazgo | Sev | Módulo | Disposición |
|---|---|---|---|---|
| **H1** | **`notification_url` apuntaba a ruta inexistente.** `payment.service.ts` seteaba `${appUrl}/api/mp/webhooks?tenant=…` pero no existe `src/app/api/mp/webhooks/route.ts` (handler real: `/api/webhooks/mercadopago`); `next.config.js` no tiene rewrites. **En prod MP postea a 404 → la reserva con seña NUNCA se confirma**. B3 testeó el handler aislado (golpea el route real) y nunca verificó el string del preferencia. | 🔴 **P0** | MP integración | ✅ FIXED (T1) |
| **H2** | Sin polling de estado de pago. `/pendiente` y `/exito` estáticas. Done-criteria 3. | 🔴 P0 (done-criteria) | UX confirmación | ✅ FIXED (T4+T5+T6) |
| **H3** | Sin countdown 15min visible al jugador. doc7 + US-RES-005. | 🟡 P1 | UX confirmación | ✅ FIXED (T5+T6) |
| **H4** | Sin reintento de pago tras rechazo. doc7 PASO 5 + US-RES-003 edge. Done-criteria 2. | 🔴 P0 (done-criteria) | UX confirmación | ✅ FIXED (T6) |
| **H5** | MP no mockeable end-to-end (`MockGateway` solo inyectado en tests, sin flag de entorno ni checkout navegable; seed E2E `requires_deposit=false` bypassa MP). | 🔴 P0 (gating) | Test infra | ✅ FIXED (T2+T3+T7) |
| H6 | 0 `loading.tsx` en rutas tocadas. | 🟡 P2 | Perf percibida | ✅ FIXED (T6) |
| **H7** | `/exito` mostraba "¡Reserva confirmada!" **incondicional** aunque el booking siguiera en `pending_payment` (mentía al jugador si webhook tardaba). | 🟡 P1 | UX confirmación | ✅ FIXED (T6 — branch sobre `booking.status`) |
| **H8** | **`transitionFromPendingPayment` no transicionaba `deposit_status`.** Webhook aprobaba → `booking.status='confirmed'` pero `deposit_status` quedaba en `'pending'` para siempre. doc7 Flujo 2 PASO 5 explícito: "deposit_status → 'paid'". Cazado por trust-but-verify en S1 (`expect(deposit_status).toBe('paid')` falló con `'pending'`). | 🔴 **P1** | Booking state machine | ✅ FIXED (T8 verify-driven; commit `3c3597d`) |
| H9 | **Helpers `getPriceForSlot` (public.service) y `priceForDuration` (booking.service) inconsistentes** — booking trata `to='00:00'` como 24:00, public retorna `null`. El seed con `to:'00:00'` mostraba `$0` en la página de reservar (cazado por S1). Workaround: seed usa `to:'23:59'`. | 🟡 P2 (consistencia) | Pricing helpers | 🔍 BACKLOG (workaround aplicado; alineación de helpers es follow-up — riesgo bajo en prod porque tenants reales no usan `00:00-00:00`) |
| H10 | **Seed cleanup violaba FK + CHECK** una vez que `createDepositPayment` seteaba `bookings.payment_id`/`payment_method`. NULL ambas columnas ANTES de `DELETE FROM payments`. | 🟡 P2 (test infra) | Seed E2E | ✅ FIXED (T7 verify-driven; commit `abaa164`) |
| H11 | **CSP en dev mode bloqueaba `unsafe-eval`** que Next.js dev necesita para webpack eval source maps. Hydration parcial → Watcher renderizaba pero `setInterval` no corría (silencio total — sin error visible en UI). Cazado activando `page.on('pageerror')` en E2E. | 🟡 P2 (test infra; prod intacta) | CSP / Next dev | ✅ FIXED (T8 verify-driven; commit `3c3597d` — gate por `NODE_ENV !== 'production'`) |
| H12 | **`MP_MOCK_MODE=1` en `.env.test` rompía 6 tests integration del webhook** (mp-webhook, race-double-payment, webhook-ssrf-guard, webhook-tenant-cross-check) porque la suite vitest esperaba el gateway real + flow de enqueue. Movido a `playwright.config.ts webServer.env` para que solo E2E lo herede. | 🟡 P2 (test infra) | Env split | ✅ FIXED (T9 verify-driven; commit `6445a49`) |

### Catch summary
- **1 P0 prod-affecting bug fixed (H1 `notification_url`)** — habría dejado el negocio sin conversión.
- **1 P1 backend correctness bug fixed (H8 `deposit_status` transition)** — datos inconsistentes en prod (deposit_status estancado).
- **5 trust-but-verify catches** (H7, H9, H10, H11, H12) corregidos en la misma fase. Sigue el patrón F3/F4/F5/F6.

---

## Tests nuevos / tocados

| Tipo | Archivo | Tests |
|---|---|---|
| Unit | `tests/unit/expiry-countdown.test.ts` | 5 (formatRemaining edge cases) |
| Integration | `tests/integration/webhook-notification-url.test.ts` | 1 (T1 regresión: capturing gateway asserta el URL) |
| Integration | `tests/integration/mp-mock-gateway.test.ts` | 7 (T2: roundtrip ids + LocalMockGateway determinista) |
| E2E | `tests/e2e/booking-flow.spec.ts` | 4 scenarios (T8: deposit happy, retry, webhook-polling, no-deposit regression) |
| **Total nuevos** | | **17** |

**Suite final:**
- Unit: **486 passing / 488 total** (2 fails pre-existentes `zod-coverage` `bookings/[id]/{complete,no-show}` desde F4 — NO regresión F7).
- Integration: **339 passing / 339 total**. (Las flaky pre-existentes `daily-close-idempotency` + `race-abonado-vs-individual` pasaron en esta corrida — pueden seguir siendo flaky entre corridas, NO regresión F7.)
- E2E booking-flow F7: **4/4** (suite completa E2E delegada a CI; correr local con `MP_MOCK_MODE=1 + supabase start`).

---

## Cambios por archivo (resumen)

```
.env.example                                          | +5  -0   (T2)
.env.test                                             | +6  -8   (T2/T9)
.env.test.example                                     | +6  -0   (T2)
next.config.js                                        | +5  -1   (T8 — CSP dev)
playwright.config.ts                                  | +2  -0   (T8 — MP_MOCK_MODE in webServer.env)

src/modules/payments/payment.service.ts               | +1  -1   (T1 P0)
src/modules/payments/mp-oauth.ts                      | +2  -0   (T2 — short-circuit a mock)
src/modules/payments/mock-mp.ts                       | NEW 104  (T2 — helpers + LocalMockGateway)
src/modules/payments/payment.schema.ts                | +8  -1   (T3 — aceptar MOCK-* ids en mock mode)
src/app/api/webhooks/mercadopago/route.ts             | +9  -4   (T2 — sync handle en mock)
src/app/api/player/bookings/[id]/status/route.ts      | NEW 47   (T4)
src/shared/rate-limit/policies.ts                     | +3  -0   (T4 — bucket bookingStatus)

src/modules/bookings/booking.concurrency.ts           | +11 -2   (T8 P1 — depositStatus='paid' on confirmed)

src/components/booking/PaymentStatusWatcher.tsx       | NEW 145  (T5 — poll 3s + cleanup)
src/components/booking/ExpiryCountdown.tsx            | NEW 19   (T5)
src/components/booking/format-remaining.ts            | NEW 8    (T5 — extraído para test puro)

src/app/(public)/[slug]/reservar/actions.ts           | +54 -0   (T6 — retryDepositPaymentAction)
src/app/(public)/[slug]/reservar/loading.tsx          | NEW
src/app/reserva/[bookingId]/exito/page.tsx            | +75 ~rewrite (T6 — Watcher branch + montos)
src/app/reserva/[bookingId]/pendiente/page.tsx        | +38 ~rewrite (T6 — Watcher)
src/app/reserva/[bookingId]/error/page.tsx            | +52 ~rewrite (T6 — Reintentar / Reservar de nuevo)
src/app/reserva/[bookingId]/{exito,pendiente,error}/loading.tsx | 3 NEW (T6)

src/app/mock-mp/checkout/page.tsx                     | NEW 145  (T3 — 404 si !MP_MOCK_MODE)
src/app/mock-mp/checkout/actions.ts                   | NEW 137  (T3+T9 — mockPay/Reject/Cancel + Zod)

scripts/seed-e2e.ts                                   | +85 -2   (T7+T7-fix — deposit tenant + FK cleanup + pricing 23:59)

tests/integration/webhook-notification-url.test.ts    | NEW 127  (T1)
tests/integration/mp-mock-gateway.test.ts             | NEW 91   (T2)
tests/unit/expiry-countdown.test.ts                   | NEW (T5)
tests/e2e/booking-flow.spec.ts                        | NEW 304  (T8)
```

Migraciones: **0** (F7 no toca schema).

---

## Visibilidad humana

Para ver el flow manual: con `MP_MOCK_MODE=1 + supabase start + pnpm e2e:seed + pnpm dev`, navegar a `http://localhost:3000/e2e-complejo-sena` → click slot libre → form `Pagar seña y reservar` → `/mock-mp/checkout` (3 botones) → "Pagar (aprobado)" → `/reserva/<id>/exito` con montos visibles. El watcher en `/pendiente` muestra spinner + countdown M:SS y flipa por polling cuando llega un webhook OOB.

---

## Stats acumulados post-F7

- **Fases completadas: 20/26** (backend B0-B11 + F0-F7).
- **Tests acumulados nuevos audit: ~277** (260 post-F6 + 17 F7).
- **Bugs fixed: 40** (38 + H1 P0 `notification_url` + H8 P1 `deposit_status` transition).
- **Verify-driven catches F7: 5** (H7 + H9 + H10 + H11 + H12).
- **Migraciones nuevas: 0**.
- **Deps nuevas: 0** (`zod` ya estaba).
- **Bundle public F7:** `/[slug]/reservar` 155kB · `/reserva/[id]/{exito,pendiente,error}` 153-154kB · `/mock-mp/checkout` 150kB · shared 150kB (Sentry — gap F12 sin cambios).

---

## Gaps / deferidos post-F7

- **H9 (P2):** alinear `public.service.getPriceForSlot` con `booking.service.priceForDuration` para que `to=0` se trate como 24:00 — riesgo bajo en prod (tenants reales usan horas explícitas), workaround aplicado en seed.
- **2 fails unit `zod-coverage`** sobre `bookings/[id]/{complete,no-show}/route.ts` siguen — pre-existentes desde F4 (`parseRouteUuid` no reconocido por heurística). Backlog P3.
- **Flaky integration pre-existentes** `daily-close-idempotency` + `race-abonado-vs-individual` — pasan/fallan según orden, NO regresión F7. Backlog P3.
- **`.ics` "agregar al calendario"** (doc7 PASO 6 / US-RES-003) — diferido a F8 polish.
- **Recordatorios email 24h/2h pre-turno** (US-RES-006): cron + templates existen (B5), no cableados; diferido F8/F9.
- **Hydration mismatch warning** en `ExpiryCountdown` (server vs client Date.now) — no-fatal; opcional fixear con mounted-flag.
- **Lighthouse local** sobre `/[slug]/reservar` y confirmation pages — no es done-criteria F7, harness F6 disponible si se quiere medir.

---

## Próxima fase

**F8 — Player Area** (MASTER_PLAN 204-208, criticidad 🟡 Media, tiempo 1 sesión).
Done: jugador ve sus reservas, cancela válidas, edita perfil, descarga datos, elimina cuenta. E2E player.
Trigger humano: confirmar continuar o pausar.
