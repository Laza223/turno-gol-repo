# INV-ABUSE-001 — Rate Limiting y Defensa Anti-Abuso (Denial of Inventory)

## Problema
El portal público permite crear "holds" (bookings `pending_payment`) sin fricción fuerte más allá del magic-link. Un atacante puede agotar el inventario de un tenant generando muchos holds simultáneos, bloqueando slots reales para jugadores legítimos.

## Estado existente (auditado antes de codificar)
- Infra de rate limit ya existe: `src/shared/rate-limit/{policies,apply,client,key,route-guard,server-action}.ts`, sobre Upstash `Ratelimit.tokenBucket`.
- `publicAvailability` (30/60s por IP) YA está wireado en `middleware.ts` sobre `/api/public/:path*` — cubre disponibilidad pública. Sin cambios ahí.
- `playerBooking` (20/60s por `player_id`) YA está wireado en `createBookingAndCheckout` (`src/app/(public)/[slug]/reservar/actions.ts:106`). Cubre volumen de requests por cuenta autenticada, pero NO por IP — un atacante con múltiples cuentas (múltiples magic links) no cae ahí.
- El dashboard admin usa `createManualBooking` (inserta directo en `confirmed`, nunca `pending_payment`) + `adminRateLimited` (100/60s por tenant) en `createBookingAction`. Es un código path totalmente separado del público — no requiere exención adicional, ya está aislado.
- No existe ningún tope de "holds activos simultáneos" — gap real, confirmado por grep en `booking.service.ts`.

## Diseño

### 1. Rate limit por IP en creación de holds
Nueva policy `publicBookingCreate` (`limit: 10, window: '60s', keyBy: 'ip', failMode: 'open'`) en `policies.ts`. Se aplica en `createBookingAndCheckout` ANTES del `enforce('playerBooking', ...)` existente (ambos deben pasar). IP vía `parseClientIp(headers())` (ya se importa `headers` en ese archivo). fail-open: si Upstash cae, no se bloquea el negocio (igual criterio que `playerBooking`/`publicAvailability`).

Al 429: mismo redirect `error=rate_limited` que ya usa `playerBooking` (el UI ya tiene el mensaje en `page.tsx:137`, no requiere cambio de copy).

`retryDepositPaymentAction` NO se toca: no crea un hold nuevo, reintenta pago de uno existente.

### 2. Tope duro de holds activos concurrentes
Constante `MAX_ACTIVE_HOLDS_PER_PLAYER = 3` en `src/shared/constants.ts` (default recomendado; sin respuesta del usuario a la pregunta de negocio, así que queda documentado como ajustable).

En `createOnlineBookingImpl` (`booking.service.ts`), después de los guards de ban/balance y antes de `lockCourtOrThrow`:
1. `pg_advisory_xact_lock(hashtext(tenantId || ':' || playerId))` — serializa intentos concurrentes del mismo jugador+tenant dentro de la tx (mismo criterio que el `SELECT ... FOR UPDATE` de `lockCourtOrThrow`, pero acá no hay una fila existente que lockear).
2. `COUNT(*)` de `bookings` con `tenant_id`, `player_id`, `status = 'pending_payment'`.
3. Si `count >= MAX_ACTIVE_HOLDS_PER_PLAYER` → throw `TooManyActiveHoldsError`.

Nuevo error `TooManyActiveHoldsError` en `booking.errors.ts` (mismo patrón que `PlayerHasOutstandingBalanceError`). En `createBookingAndCheckout`, catch → `redirect(&error=too_many_holds)`. Nuevo bloque de mensaje en `page.tsx` (mismo patrón visual que los otros `searchParams.error === '...'`).

Alcance: solo cuenta contra el jugador+tenant (el "cliente" real, autenticado). El tope NO aplica a `createManualBooking` (admin) porque ese path nunca inserta `pending_payment`. La defensa por IP (parte 1) es la capa que cubre multi-cuenta/multi-sesión — la tabla `bookings` no registra IP de creación, así que el tope de negocio usa la identidad real disponible (`player_id`).

### 3. Admins sin fricción
Ya resuelto por diseño existente: `createManualBooking` es un código path distinto (sin `playerBooking`/`publicBookingCreate`/tope de holds), solo `adminRateLimited` (100/60s por tenant). Sin cambios necesarios — se deja documentado para que quede explícito en el ticket.

### 4. Tests
- `tests/unit/rate-limit-apply.test.ts`-style o nuevo `tests/unit/policies.test.ts`: cobertura de que `publicBookingCreate` existe con los valores esperados (sigue el patrón de `rate-limit-admin-coverage.test.ts`).
- Nuevo `tests/integration/booking-create-ip-rate-limit.test.ts`: mismo patrón que `player-rate-limit.test.ts`/`middleware-rate-limit.test.ts` (mock de `@upstash/ratelimit`), 10 OK + 11º 429 por IP.
- Nuevo test en `booking.service` (unit, mockeando `checkPlayerBanned`/`getPlayerBlockState` como `booking-balance-guard.test.ts`, o integration usando `insertPendingBooking` de `tests/integration/bookings.test.ts`): 3 holds existentes → 4º `createOnlineBooking` lanza `TooManyActiveHoldsError`; con 2 holds existentes, no lanza ese error (avanza más allá del guard).

## Riesgos aceptados
- Sin lock, dos requests concurrentes del mismo jugador podrían colar N+1 holds en teoría — mitigado con `pg_advisory_xact_lock` (cierra la ventana real de la mayoría de los casos; no es una garantía matemática absoluta bajo relojes de Postgres distribuidos, pero es el mismo nivel de rigor que el resto del código de bookings).
- `failMode: 'open'` en ambas policies de public booking: si Upstash cae, prioriza disponibilidad del negocio sobre bloqueo total (igual criterio que `playerBooking`/`publicAvailability` existentes).
