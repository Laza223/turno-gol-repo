# Fase 3 — Seguridad: Diseño

> Spec de brainstorming. Fuente de verdad del diseño. El plan de ejecución vive en
> `docs/superpowers/plans/fase-3-seguridad.md`.
> Fecha: 2026-05-22

## 1. Contexto y motivación

El codebase ya tiene una base de seguridad madura:

- **RLS** habilitado en 12 tablas (`006_rls_policies.sql`) con patrón de 4 policies
  (`tenant_isolation_{select,insert,update,delete}`) + RLS dual staff/jugador en `bookings`
  y `player_tenant_relationships` + RLS relacional en `players`/`staff_users` + RLS por
  `app.current_system_admin_id` en `system_admins`.
- **Aislamiento**: `withTenantContext()` / `withPlayerContext()` / `withSystemAdminContext()`
  en `src/shared/db/client.ts` setean `app.current_*` vía `set_config(..., true)`
  (transaction-scoped). Suite `tests/integration/isolation.test.ts` con 84 tests (BLOCKING).
- **Concurrencia**: `lockCourtOrThrow()` (SELECT FOR UPDATE) + `checkOverlapOrThrow()`
  (tsrange + exclusion constraint) en bookings; `transitionFromPendingPayment()`
  (UPDATE condicional con guard `won`); idempotencia de pagos por
  `processed_webhooks ON CONFLICT DO NOTHING` + upsert por `mp_payment_id`.
- **Validación**: Zod en módulos clave (`booking.schema.ts` con primitivas uuid/date/hhmm + max length).
- **Headers**: CSP + X-Frame-Options + nosniff + Referrer-Policy + Permissions-Policy en `next.config.js`.
- **Secrets**: todos vía `process.env` (MP_*, ENCRYPTION_KEY, PIN_COOKIE_SECRET,
  SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, SENTRY_*).

**Brechas conocidas que motivan esta fase:**

1. **No existe rate limiting.** Solo está especificado en docs (doc15 §9, doc5, doc14, doc12).
   No hay `middleware.ts` raíz de Next ni módulo de rate limit.
2. La cobertura de **Zod en Server Actions / Route Handlers no está verificada exhaustivamente**;
   `api/public/availability` valida a mano (regex), inconsistente con el resto.
3. `client.ts:106` usa `sql.unsafe(\`SET LOCAL ROLE ${opts.role}\`)` — interpolación de string.
4. CSP incluye `'unsafe-eval'` + `'unsafe-inline'` en `script-src`; falta **HSTS**.
5. Vectores **SSRF/IDOR** en flujos MercadoPago e ID-routing no auditados sistemáticamente.

Esta fase audita las 7 superficies y **remedia cada brecha bajo TDD** (test que falla → fix → verde),
aplicando `systematic-debugging` cuando se reproduce una condición de carrera o un bypass.

## 2. Objetivos / No-objetivos

**Objetivos**
- Auditar y endurecer 7 superficies: (1) SQLi + validación, (2) aislamiento RLS,
  (3) rate limiting, (4) concurrencia, (5) secrets + headers, (6) IDOR/Authz en Route Handlers,
  (7) SSRF en flujos MercadoPago.
- Implementar rate limiting token-bucket con Upstash Redis, claves híbridas según doc15 §9.
- Para cada brecha: test que la expone (rojo) → fix → verde. Dejar el código endurecido.
- Mantener la propiedad **BLOCKING** de la suite de aislamiento y extenderla.

**No-objetivos**
- No reescribir el modelo RLS ni el schema (solo cerrar gaps de cobertura).
- No introducir WAF externo (Vercel WAF) — rate limiting en app layer.
- No auditar dependencias de terceros más allá de `pnpm audit` + gitleaks.
- AFIP / facturación fuera de scope (ADR-011).

## 3. Decisiones tomadas (brainstorming)

| Decisión | Resolución | Razón |
|---|---|---|
| Backend de rate limiting | **Upstash Redis** (`@upstash/ratelimit` + `@upstash/redis`) | Deploy = Vercel serverless; in-memory no sobrevive multi-instancia/cold-start |
| Claves de rate limit | **Híbridas según doc15 §9** (no solo-IP) | doc15 es fuente de verdad; blueprint decía "solo IP" — ambigüedad resuelta a favor de doc |
| Alcance | **Auditar + remediar (TDD)** | Es "Fase 3 seguridad"; deja código endurecido, no solo reporte |
| Áreas extra | **IDOR/Authz + SSRF MercadoPago** | Solicitadas explícitamente |

## 4. Metodología

Sweep TDD por clase de vulnerabilidad. Por cada superficie:

1. **Enumerar** el inventario (grep/glob de actions, routes, queries, policies).
2. **Probe**: escribir test/probe que falle si la brecha existe (reproduce el bypass).
3. **Fix**: remediar el código de producción.
4. **Verde**: el test pasa; queda como regresión.

`systematic-debugging` se aplica en las áreas 3 y 4 (rate limit, concurrencia): reproducir de forma
confiable → caso mínimo → causa raíz → fix → test de regresión. Asertar invariantes, nunca timing.

## 5. Las 7 superficies

### Área 1 — SQL injection + validación de input

**Inventario a auditar**
- Toda escritura DB pasa por Drizzle o tagged-templates de postgres.js (parametrizado).
- Puntos de interpolación cruda: `client.ts:106` `SET LOCAL ROLE ${role}`; cualquier
  `.unsafe(` / `sql.raw` / concatenación / `ORDER BY` o columna dinámica.

**Hallazgos a verificar / remediar**
- `SET LOCAL ROLE`: `role` es union `AppRole`, pero PG no parametriza nombres de rol.
  **Fix**: allowlist explícita (`['authenticated','anon','service_role','turnogol_app']`)
  validada antes de interpolar; lanzar si no matchea.
- Confirmar que `tx.unsafe(...)` solo aparece en tests, nunca en paths de producción.
- Cobertura Zod: enumerar **todo** `**/actions.ts` + `api/**/route.ts`; exigir parse Zod
  del input antes de usarlo. Migrar `api/public/availability` a Zod.
- Primitivas Zod compartidas en `src/shared/validation/`: `uuid`, `dateStr`, `hhmm`,
  `moneyCents` (int no-negativo), `boundedText(max)`. Max length obligatorio en todo
  free-text (anti-DoS por payload gigante).

**Tests**
- Por schema: válido / inválido / borde (longitud máxima, UUID malformado, enum fuera de rango).
- Meta-test (guard tipo lint): cada archivo `actions.ts` / `route.ts` referencia un schema Zod.
- Probe SQLi: inputs con `'; DROP`, `1=1`, unicode, null bytes → rechazados por Zod, nunca llegan a DB.

### Área 2 — Aislamiento RLS

**Estado**: `isolation.test.ts` cubre A–I (84 tests). Auditar **completitud** y cerrar gaps.

**Hallazgos a verificar / remediar**
- Cerrar los gaps declarados en el TODO del archivo (tests **positivos**, caminos player/dual = mayor riesgo):
  `player_update_self`, `player_self_insert` (bookings), `player_self_ptr_insert`,
  `system_admin_self` / `system_admin_self_update`.
- Matriz select/insert/update/delete × tabla: confirmar cobertura donde hay policy y
  cobertura **negativa** donde NO la hay (ej. `players` INSERT → solo service role; `staff_users` sin INSERT/UPDATE).
- `bookings.realtime_tenant_select` (TO authenticated, vía `auth.jwt()`): variantes de tampering del JWT
  (tenant_id ajeno, claim ausente, claim malformado) → 0 filas.
- Fail-safe (sin contexto → 0 filas) cubre las 15 tablas RLS — verificar que sigue completo.

**Propiedad invariante**: comentar cualquier policy en `006_rls_policies.sql` → ≥1 test rojo (mutation check manual documentado en el plan).

### Área 3 — Rate limiting (Upstash Redis, token bucket)

**Arquitectura**
- Dependencias nuevas: `@upstash/ratelimit`, `@upstash/redis`. Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Módulo `src/shared/rate-limit/`:
  - `client.ts`: singleton Redis + factory de limiters (uno por grupo, algoritmo token bucket).
  - `policies.ts`: tabla de políticas (grupo → límite/ventana/clave) según doc15 §9.
  - `key.ts`: derivación de clave + parseo seguro de `x-forwarded-for` (tomar **leftmost**, confiar solo en proxy Vercel).
  - `apply.ts`: helper `enforce(group, key)` → `{ success, limit, remaining, reset }`.
- **Capas** (el edge no conoce identidad pre-auth):
  - `middleware.ts` raíz (edge): límites por **IP** para rutas públicas y auth pre-identidad.
  - Capa action/route (node runtime, post-auth): límites por **tenant_id** / **player_id** / **email**
    una vez resuelta la identidad, usando el mismo módulo.

**Políticas (doc15 §9)**

| Grupo | Límite | Ventana | Clave | Capa |
|---|---|---|---|---|
| Auth magic-link / login | 5 | 1 min | email | action (post-parse) |
| Auth verify / callback | 10 | 1 min | IP | edge middleware |
| Public availability | 30 | 1 min | IP | edge middleware |
| Admin API (CRUD) | 100 | 1 min | tenant_id | route/action (post-auth) |
| Player API (booking) | 20 | 1 min | player_id | route/action (post-auth) |
| Webhooks MP | sin límite | — | — | — |

**Fail-mode**: fail-**open** en `availability` (no romper sitio público; loguear a Sentry);
fail-**closed** en auth (5xx si Redis cae, no permitir bypass de brute-force).

**Respuesta**: `429` + body `{ error: 'RATE_LIMITED' }` + header `Retry-After` (segundos hasta reset).
Códigos consistentes con doc15 §error codes.

**Tests**
- Unit: matemática del token bucket; derivación de clave por grupo; parseo `x-forwarded-for`
  (un hop, múltiples hops, spoofing → solo leftmost confiable); construcción de respuesta 429 + Retry-After.
- Integración: adapter Redis in-memory; N requests → primeros OK, excedente 429; ventana resetea.
- Fail-mode: Redis inalcanzable → availability pasa (open) + auth bloquea (closed).

### Área 4 — Concurrencia (stress tests de condiciones de carrera)

Integración contra Supabase local, conexiones reales concurrentes (tx separadas, `Promise.all`
con barrier para maximizar solape). Asertar invariantes, no timing.

**Escenario 1 — Double booking** (manual staff vs online player, mismo court/slot)
- Defensa: `lockCourtOrThrow` (FOR UPDATE) + `checkOverlapOrThrow` (tsrange) + exclusion constraint (`PG_EXCLUSION_VIOLATION`).
- Test: N tx en paralelo apuntando al mismo slot → **exactamente 1** confirma; el resto recibe
  `SlotTakenError` o violación de exclusión. 0 dobles reservas. Mezclar `createManualBooking` + flujo online.

**Escenario 2 — Double payment** (webhook storm MP)
- Defensa: `lockMpEvent` (`processed_webhooks ON CONFLICT DO NOTHING`) + upsert por `mp_payment_id` + guard `won`.
- Test: M webhooks idénticos concurrentes (mismo `mp_event_id` / `mp_payment_id`) →
  **exactamente 1** confirma booking; 1 fila cash_flow; 1 fila payment; side-effects (email, audit) 1 vez.

**Escenario 3 — Expiración cruzada** (cron expiry vs webhook confirm, mismo booking)
- Defensa: `transitionFromPendingPayment` (UPDATE condicional `WHERE status='pending_payment'`, guard `won`).
- Test: confirm + expire en paralelo sobre el mismo booking → **exactamente uno gana**;
  estado final consistente; side-effects no se duplican.

Si un test revela una carrera real → `systematic-debugging`: reproducir de forma determinista
(seed/barrier), aislar causa raíz, fix, dejar el test como regresión.

### Área 5 — Secrets + headers

**Secrets**
- gitleaks (o trufflehog) sobre working tree **+ historial git completo**.
- Verificar `.env.example` / `.env.test.example` contienen solo placeholders (sin valores reales).
- Confirmar que todo secreto se lee de `process.env`; catálogo: MP_CLIENT_ID/SECRET,
  MP_WEBHOOK_SECRET, MP_TURNOGOL_ACCESS_TOKEN, ENCRYPTION_KEY, PIN_COOKIE_SECRET,
  SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, SENTRY_*.
- `SUPABASE_SERVICE_ROLE_KEY` y demás secretos nunca importados en componentes `'use client'`.
- `NEXT_PUBLIC_*` no contiene nada sensible.
- **Fix**: módulo `src/shared/env.ts` con validación Zod al arranque (fail-fast si falta/corto);
  `pin.ts` ya lo hace parcial para `PIN_COOKIE_SECRET` → generalizar.

**Headers / cookies**
- CSP: `'unsafe-eval'` + `'unsafe-inline'` en `script-src` → **fix**: quitar `unsafe-eval`;
  evaluar nonce para `unsafe-inline` (Next 14 requiere cuidado con inline scripts del runtime).
  Documentar residual si no se puede eliminar inline.
- **Agregar HSTS**: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- Cookies (`pin`, `tenant`, `with-pin`): httpOnly + secure(prod) + sameSite=lax → correcto;
  mantener `lax` (necesario para redirects de magic-link/OAuth). Confirmar cookies Supabase heredan secure+sameSite.
- **Tests**: asertar presencia de cada header de seguridad en la respuesta + flags de cookie (httpOnly/secure/sameSite).

### Área 6 — IDOR / Authz en Route Handlers

**Principio**: `tenant_id` / `player_id` del contexto deben venir **siempre de la sesión/JWT**,
nunca de params/body del request. RLS es defensa en profundidad; el handler debe además gatear authz.

**Inventario**: todas las rutas `api/**/[id]/**` (bookings admin: cancel/complete/no-show/route;
player bookings: cancel/route; player profile).

**Hallazgos a verificar**
- Patrón correcto observado en `api/player/bookings/[id]/cancel`: el pre-read corre dentro de
  `withPlayer` (contexto player) → RLS `player_own_bookings_select` filtra a reservas del jugador;
  si no es dueño → `pre` undefined → 404; además `cancelByPlayer` lanza `BookingNotOwnedByPlayerError` → 403.
- **Verificar** que NINGÚN handler setee contexto tenant/player desde un id de request **antes** de
  validar ownership. (En cancel, el `tenant_id` usado proviene de una fila ya filtrada por RLS player → OK.)
- Rutas admin `[id]`: confirmar que corren en contexto tenant de sesión → RLS scope al tenant;
  id de otro tenant → 0 filas → 404 (no 403 que filtra existencia).

**Tests**
- Player A intenta cancelar/leer booking de player B → 404/403, nunca muta.
- Staff de tenant A intenta operar `[id]` de tenant B → 404, sin efecto.
- Confirmar que el id de la URL nunca sobreescribe el tenant/player del contexto de sesión.

### Área 7 — SSRF en flujos MercadoPago

**Inventario**: `api/mp/oauth-start`, `api/mp/callback`, `api/webhooks/mercadopago`,
`mp-webhook.handler.ts`, `MercadoPagoGateway`.

**Hallazgos a verificar / remediar**
- `mp/callback:56`: `appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin`.
  Fallback al origin del request = **host-header injection** sobre `redirect_uri`.
  **Fix**: exigir `APP_URL`/`NEXT_PUBLIC_APP_URL` (env-validation, Área 5); no derivar de `req.url`.
- `gateway.getPaymentStatus(job.mpPaymentId)`: `mpPaymentId` viene del payload del webhook y se
  interpola en la URL de la API de MP. **Fix**: validar `mpPaymentId` con regex numérico estricto
  antes de usarlo; base URL de MP hardcodeada (nunca tomar URL del payload). Prevenir path traversal/SSRF.
- Webhook tenant desde query `?tenant=` + secret **compartido** (no per-tenant): un actor con el
  secret podría encolar jobs para un `tenant_id` arbitrario, que luego usa el token MP de ese tenant.
  **Verificar/Fix**: validar que el `tenant_id` del query corresponde al pago (cross-check
  `external_reference` / collector vs tenant) o documentar el riesgo y mitigación. CSRF state HMAC ya OK.
- Redirects de `callback` usan paths hardcodeados (`/dashboard`, `/onboarding?error=...`) sobre `req.url`
  → no son open-redirect (path fijo). Confirmar que ningún redirect usa un valor del request.

**Tests**
- `mpPaymentId` no numérico (`../`, URL, inyección) → rechazado antes del fetch.
- `callback` sin `APP_URL` en producción → falla controladamente (no usa host del request).
- Webhook con `?tenant=` que no corresponde al pago → rechazado / no procesa.

## 6. Estrategia de testing

- **Unit** (Vitest): schemas Zod, token bucket, key derivation, x-forwarded-for, allowlist de rol,
  validación de `mpPaymentId`, construcción de headers/429.
- **Integración** (Vitest + Supabase local): extensión de `isolation.test.ts` (gaps RLS),
  3 escenarios de concurrencia, rate-limit con adapter in-memory, IDOR cross-tenant/cross-player.
- **Headers/secrets**: test de respuesta HTTP (headers presentes) + gitleaks en CI.
- Toda suite de aislamiento + concurrencia es **BLOCKING** en CI.
- `pnpm typecheck` después de cada cambio (regla CLAUDE.md).

## 7. Entregables

**Código**
- `middleware.ts` (raíz, edge) + `src/shared/rate-limit/{client,policies,key,apply}.ts`.
- `src/shared/validation/` (primitivas Zod compartidas) + migración de `availability` a Zod.
- `src/shared/env.ts` (validación Zod de env, fail-fast).
- Fix `SET LOCAL ROLE` (allowlist) en `client.ts`.
- CSP endurecido + HSTS en `next.config.js`.
- Validación de `mpPaymentId` + `redirect_uri` en flujos MP.

**Tests**
- Rate limit (unit + integración), concurrencia (3 escenarios), RLS gaps (~4 positivos + matriz),
  validación/SQLi probes, IDOR cross-tenant/player, headers/secrets.

**Docs**
- Este spec + plan de ejecución (`plans/fase-3-seguridad.md`) con log de hallazgos
  (cada brecha → severidad → test → fix).

## 8. Riesgos

- **CSP nonce en Next 14**: quitar `unsafe-inline` puede romper scripts inline del runtime/Sentry.
  Mitigación: priorizar quitar `unsafe-eval`; nonce solo si no rompe build; documentar residual.
- **Tests de concurrencia flaky**: usar barrier/seed determinista; asertar invariantes, no timing.
- **Rate limit en edge**: el middleware edge no resuelve tenant/player → diseño en 2 capas (IP en edge, identidad en node).
- **Webhook cross-tenant**: si el cross-check de tenant no es viable en v1, documentar como riesgo aceptado + monitoreo.
