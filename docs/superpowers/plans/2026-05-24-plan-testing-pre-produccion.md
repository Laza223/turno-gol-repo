# Plan de Testing Pre-Producción — Auditoría de Cobertura

> Fecha: 2026-05-24 · Alcance: seguridad de acceso (RLS), concurrencia, integración financiera (MP), control de abusos (rate-limit/SSRF), resiliencia (mail/health).
> Método: lectura directa de migración `006_rls_policies.sql`, services de booking/payments/notifications, middleware, y cruce contra los 38 tests de integración + 26 unit + 4 e2e existentes.

---

## 0. Veredicto

La cobertura de seguridad y concurrencia es **sólida y, en varios puntos, ejemplar** (RLS mutation-checked, idempotencia de webhooks de booking probada bajo storm de 8 concurrentes, IDOR admin/jugador, failover de Resend, cascada de `/api/status`). **No se debe reescribir nada de eso.**

Los gaps reales son pocos pero algunos son **críticos para "seguridad financiera"**: el módulo de cifrado AES-256-GCM (`encrypt.ts`) que protege los tokens OAuth de MercadoPago **no tiene un solo test**, y no existe regresión que garantice que esos tokens nunca se serialicen al frontend ni se guarden en claro.

### Correcciones a supuestos del pedido (ya cubierto — NO crear)

| Supuesto del pedido | Realidad en el repo |
|---|---|
| "Proponé un test para la carrera expiry-vs-confirm" | **Ya existe**: `tests/integration/race-expiry-vs-confirm.test.ts` (exactamente 1 transición gana). |
| "¿Verificado el comportamiento de tokens malformados en claims de Realtime?" | **Sí**: `isolation.test.ts` bloque I.2 + J cubre claim `tenant_id` ajeno, ausente, malformado (`not-a-uuid`) y sin `app_metadata`. |
| "¿La API pública está protegida frente a scraping?" | **Sí**: `middleware.ts` aplica `publicAvailability` (30/min/IP) a **todo** `/api/public/*` y `authVerify` a `/api/auth/*` + `/verify`; probado en `middleware-rate-limit.test.ts`. |
| "¿Riesgo de SSRF vía callbacks?" | **Mitigado + probado**: `webhook-ssrf-guard.test.ts` rechaza `mpPaymentId` no numérico (`../etc/passwd`, `https://evil`, `1 OR 1=1`, vacío). El callback OAuth usa `fetch` a URL **hardcodeada** de MP y `redirect_uri` desde `NEXT_PUBLIC_APP_URL` (no host-header injection). |
| "¿Testeado el flujo de reintentos/failed de Resend?" | **Sí**: `notifications.test.ts` cubre `provider falla 3× → status=failed, last_error` y el happy path `sent`. |
| "¿Tabla de las 19 sin pruebas de aislamiento?" | **No, entre las aisladas**: las 12 RLS + híbrida (PTR) + `players` + `staff_users` + `system_admins` están cubiertas (84 tests). Ver §1 para el matiz de las tablas **globales**. |

---

## 1. Matriz de cobertura por área

| Área | Cubierto | Gap |
|---|---|---|
| **RLS / aislamiento** | 12 aisladas + PTR + players + staff_users + system_admins: SELECT/INSERT/UPDATE/DELETE cross-tenant, fail-safe sin contexto, policies positivas (mutation-checked) | Realtime sólo en dirección negativa (M1); tablas globales sin barrera DB (§1.1) |
| **IDOR / rutas** | admin cross-tenant (404/409 sin mutación), jugador→jugador (404/403) | — |
| **Concurrencia** | double-booking N=10, webhook storm M=8, expiry-vs-confirm | idempotencia de **suscripción** duplicada (A1) |
| **MP webhooks** | firma (timing-safe + length), payload inválido, idempotencia 3× (booking), pago tardío, cross-tenant check, SSRF en payment_id | enqueue-fail → 500 (A2) |
| **OAuth / tokens** | state HMAC timing-safe, redirect_uri desde env, `getPublicTenant` con allow-list de columnas | **cifrado AES sin test (C1)**, **no-exposición/at-rest sin regresión (C2)** |
| **Rate-limit / SSRF** | 5 policies, fail-open/closed, parseClientIp (incl. spoofing leftmost), middleware público/auth, login | defensa en profundidad anti-scraping por tenant (M3) |
| **Resiliencia** | Resend 3×→failed, `/api/status` db-down/pgboss-perm/pgboss-down/env-missing | notif envenenada no bloquea lote (M2) |

### 1.1 Matiz crítico: las tablas globales no tienen barrera de DB

`tenants`, `plans`, `price_versions`, `processed_webhooks` son **globales (sin RLS)** por diseño (doc12). Consecuencia para seguridad financiera: **`tenants.mp_access_token` / `mp_refresh_token` no están protegidos por RLS**. Una conexión con contexto de tenant A puede, a nivel SQL, `SELECT mp_access_token FROM tenants WHERE id = <tenantB>`. La **única** barrera es (a) que estén cifrados at-rest y (b) que el código nunca haga `SELECT *` sin allow-list. Esto eleva la prioridad de C1 y C2: el cifrado no es defensa en profundidad, es la **última línea**.

---

## 2. Tests faltantes por prioridad

### 🔴 CRÍTICA

#### C1 — Unit del módulo de cifrado AES-256-GCM
- **Archivo (NUEVO):** `tests/unit/crypto-encrypt.test.ts`
- **Por qué:** `src/lib/crypto/encrypt.ts` protege los tokens OAuth de cada complejo y **no tiene ningún test** (grep confirmado: 0 referencias en `tests/`).
- **Casos a simular y asserts:**
  1. **Round-trip:** `decrypt(encrypt(s)) === s` para ASCII, UTF-8 multibyte (`"ñÁ€"`), string vacío y token largo (200+ chars).
  2. **Formato GCM:** `encrypt(s)` produce `iv:tag:ct` → 3 segmentos hex; `iv` = 24 hex (12 bytes), `tag` = 32 hex (16 bytes). `assert` por regex `^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$`.
  3. **IV único:** `encrypt(s) !== encrypt(s)` (dos cifrados del mismo texto difieren → IV aleatorio).
  4. **Auth-tag tamper:** mutar 1 char del `tag` → `expect(() => decrypt(t)).toThrow()` (GCM detecta).
  5. **Ciphertext tamper:** mutar `ct` → `toThrow()`.
  6. **Wrong key:** cifrar con KEY-A, `decrypt` con KEY-B → `toThrow()` (no devuelve basura silenciosa).
  7. **Key inválida:** `ENCRYPTION_KEY` ausente o ≠ 64 hex → `encrypt`/`decrypt` lanzan `/64 hex chars/`.
  8. **Formato malformado:** `decrypt('aa:bb')` (2 partes) → `/Invalid ciphertext format/`.
- **Mocks/inputs:** sin mocks; `beforeEach` setea `process.env.ENCRYPTION_KEY = '00'.repeat(32)` (64 hex), `afterEach` restaura.
- **Condición de éxito:** round-trip exacto + todos los `toThrow()` de tamper/wrong-key/bad-format + IVs distintos.

#### C2 — Tokens OAuth: cifrados at-rest y nunca expuestos
- **Archivo (NUEVO):** `tests/integration/mp-token-secrecy.test.ts`
- **Por qué:** `getPublicTenant` excluye los tokens vía allow-list de columnas + comentario `// NEVER: ...`, pero **nada falla** si un dev agrega `mpAccessToken: true`. Combinado con §1.1, el cifrado es la última barrera y debe verificarse.
- **Casos a simular y asserts:**
  1. **At-rest cifrado:** `connectMercadoPago(tenantId, { mpAccessToken: encrypt('AT-secreto'), mpRefreshToken: encrypt('RT-secreto'), ... })`; luego `SELECT mp_access_token, mp_refresh_token FROM tenants WHERE id = ...` (SQL crudo, service role). Assert: el valor **no** es `'AT-secreto'`, **matchea** el formato `iv:tag:ct`, y `decrypt(col) === 'AT-secreto'`.
  2. **No-exposición en service:** `getPublicTenant(slug)` → el objeto **no** contiene las keys `mpAccessToken|mpRefreshToken|mpUserId|mpPublicKey|email`; `JSON.stringify(result)` **no** incluye el substring `'AT-secreto'` ni `'mp_access'`.
  3. **No-exposición en route:** invocar el handler real `GET /api/public/complex/[slug]` → parsear body JSON, assert que ninguna key sensible ni el valor del token aparecen.
  4. **Regresión de allow-list (snapshot):** `expect(Object.keys(result).sort())` igual al set esperado de `PublicTenant`. Si alguien agrega un campo sensible, el test rompe.
- **Mocks/inputs:** DB real; `ENCRYPTION_KEY` seteado; tenant sembrado con `connectMercadoPago`.
- **Condición de éxito:** columna cruda ≠ plaintext y cumple formato; `decrypt` recupera original; cero keys/valores sensibles en respuestas públicas.

### 🟠 ALTA

#### A1 — Idempotencia de webhook de suscripción (duplicado y concurrente)
- **Archivo (MODIFICAR):** `tests/integration/billing.test.ts` — o NUEVO `tests/integration/mp-webhook-subscription-idempotency.test.ts`
- **Por qué:** el handler **no** llama `lockMpEvent` para `subscription_authorized_payment`; delega en `onPaymentApproved/onPaymentRejected` (que sí hacen `INSERT processed_webhooks ON CONFLICT DO NOTHING`). El **código** es idempotente pero **no hay test** de doble entrega → riesgo financiero (doble activación / doble registro). `billing.test.ts` sólo invoca `onPaymentApproved` una vez.
- **Casos a simular y asserts:**
  1. Mismo `mpEventId` de `subscription_authorized_payment` (status `approved`) ejecutado **3× secuencial** vía `handleMpWebhookJob`. Assert: `processed_webhooks` con ese `mp_event_id` = **1 fila**; suscripción `trialing→active` ocurre **una sola vez** (no re-transiciona ni duplica pago).
  2. **N× concurrente** (`Promise.allSettled`) del mismo evento. Assert: igual a (1) — 1 fila, 1 efecto.
  3. Variante `rejected`: `onPaymentRejected` duplicado **no** incrementa el contador de dunning dos veces.
- **Mocks/inputs:** `vi.mock('@/modules/payments/mp-gateway.implementation')` con `getPaymentStatus → { status: 'approved' }`; DB real; tenant con suscripción `trialing`.
- **Condición de éxito:** exactamente 1 fila en `processed_webhooks` y 1 transición de estado por `mpEventId`, sin importar cuántas entregas.

#### A2 — Fallo al encolar en la route de MP → 500 (MP reintenta)
- **Archivo (EXTENDER):** `tests/integration/webhook-ssrf-guard.test.ts` (ya importa el `POST`) — o NUEVO `tests/unit/mp-webhook-route-enqueue.test.ts`
- **Por qué:** la route devuelve `500 {error:'enqueue failed'}` si `boss.send` lanza (para que MP no marque entregado y reintente). Ese branch (route.ts:70-74) **no está testeado**; un fallo silencioso aquí = webhook perdido = seña cobrada sin confirmar la reserva.
- **Caso a simular y assert:** `getBoss().send` rechaza; POST con `x-webhook-secret` válido + payload `payment` con `data.id` numérico. Assert: `res.status === 500` y body `{ error: 'enqueue failed' }`.
- **Mocks/inputs:** `vi.mock('@/shared/jobs/boss', () => ({ getBoss: async () => ({ send: vi.fn().mockRejectedValue(new Error('boom')) }) }))`; `process.env.MP_WEBHOOK_SECRET` seteado.
- **Condición de éxito:** status 500 (no 200, no 400) → garantiza reintento de MP.

### 🟡 MEDIA

#### M1 — Test POSITIVO de Realtime (`realtime_tenant_select`)
- **Archivo (MODIFICAR):** `tests/integration/isolation.test.ts` (bloque J)
- **Por qué:** todos los tests de Realtime son **negativos** (cross-tenant → 0 filas, que pasan por fail-safe aunque la policy no exista). Comentar `realtime_tenant_select` **no rompe ningún test** en la dirección "la policy habilita ver lo propio". La grilla del admin depende de esta policy.
- **Caso a simular y assert:** `withContext({ role: 'authenticated', jwtClaims: { app_metadata: { tenant_id: tenantA.id } } })` → `SELECT id FROM bookings WHERE id = ${A.bookingId}`. Assert: `rows.length === 1`. Junto con I.2 (tenant ajeno → 0) cierra ambas direcciones (mutation-complete).
- **Mocks/inputs:** ninguno; el helper `withContext` ya setea `request.jwt.claims` (client.ts:128).
- **Condición de éxito:** el cliente con su propio `tenant_id` en el JWT **sí** ve su reserva.

#### M2 — Una notificación envenenada no bloquea el lote
- **Archivo (MODIFICAR):** `tests/integration/notifications.test.ts`
- **Por qué:** `processQueuedNotifications` itera y traga errores por fila (line 67-72). Está cubierto el caso 1-notif-falla, pero no que **un elemento malo en un lote** no impida enviar los buenos (resiliencia del barrido).
- **Caso a simular y assert:** encolar 3 notifs en el mismo tenant: una con `templateName` inválido (o recipient inexistente) + dos válidas; correr `processQueuedNotifications()` **una vez**. Assert: las 2 válidas → `status='sent'` y el provider fue invocado 2 veces; la mala queda `queued`/`failed` con `last_error`, sin abortar el barrido.
- **Mocks/inputs:** `EmailProvider` que registra envíos y nunca lanza para las válidas.
- **Condición de éxito:** 2 enviadas pese a la 1 fallida en el mismo sweep.

#### M3 — Defensa en profundidad anti-scraping de disponibilidad pública
- **Archivo (NUEVO):** `tests/integration/public-availability-scrape.test.ts` (+ posible cambio de diseño)
- **Por qué:** la única defensa es 30/min **por IP** (`publicAvailability`), con IP tomada del **leftmost X-Forwarded-For** (confiable sólo en Vercel; documentado en `key.ts`). Sin tope por tenant/slug, un scraper con IPs rotadas o XFF forjado (fuera de Vercel) extrae disponibilidad de todos los complejos (inteligencia competitiva, doc2). El test `parseClientIp` confirma que **toma el valor que el cliente puede controlar** si la infra no lo sanea.
- **Caso a simular y assert:** 60 requests al **mismo** `slug` desde 60 IPs distintas. *Comportamiento actual:* todas pasan (sólo cap por IP) → el test **documenta** y previene regresión. *Si se decide endurecer:* agregar key compuesta o tope por `slug`; entonces el request 31+ del mismo slug → 429 aunque cambie la IP.
- **Mocks/inputs:** `Ratelimit` mock como en `middleware-rate-limit.test.ts`; variar header IP por request.
- **Condición de éxito:** depende de la decisión (documentar vs. endurecer). Subir a **ALTA** si el deploy no garantiza XFF saneado por la plataforma.

#### M4 — Endurecimiento opcional del compare del webhook secret (nota de diseño)
- **Archivo:** `tests/unit/mp-webhook-route.test.ts` (comportamiento ya cubierto)
- **Por qué:** `verifyWebhookSecret` retorna `false` ante distinta longitud **antes** del `timingSafeEqual` → oráculo de timing para la **longitud** del secreto. Impacto bajo (secreto ≥ 32 chars), pero para constant-time total: hashear ambos (`sha256`) y comparar digests de longitud fija. No es un test nuevo de seguridad; si se reimplementa, mantener los asserts existentes verdes.

---

## 3. Resumen accionable

| ID | Prioridad | Archivo | Esfuerzo |
|---|---|---|---|
| C1 | 🔴 Crítica | `tests/unit/crypto-encrypt.test.ts` (nuevo) | 1-2 h |
| C2 | 🔴 Crítica | `tests/integration/mp-token-secrecy.test.ts` (nuevo) | 2-3 h |
| A1 | 🟠 Alta | `billing.test.ts` (mod) o webhook-subscription-idempotency (nuevo) | 2 h |
| A2 | 🟠 Alta | `webhook-ssrf-guard.test.ts` (extender) | 30 min |
| M1 | 🟡 Media | `isolation.test.ts` (mod, bloque J) | 20 min |
| M2 | 🟡 Media | `notifications.test.ts` (mod) | 45 min |
| M3 | 🟡 Media | `public-availability-scrape.test.ts` (nuevo) + decisión de diseño | 1-3 h |
| M4 | 🟡 Media | nota de diseño (sin test nuevo) | — |

**Orden sugerido:** C1 → C2 (cubren el agujero financiero/secretos) → A1 → A2 → M1 → M2 → M3 → M4.

**Bloqueante de lanzamiento (recomendado):** C1 y C2. Sin ellos no hay garantía verificada de que los tokens de cobro de los complejos estén cifrados ni ocultos al frontend, y son la única barrera real (las tablas globales no tienen RLS, §1.1).
