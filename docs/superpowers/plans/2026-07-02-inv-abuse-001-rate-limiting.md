# INV-ABUSE-001 — Rate Limiting y Defensa Anti-Abuso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el vector de Denial-of-Inventory del portal público: rate limit por IP en la creación de holds + tope duro de holds `pending_payment` simultáneos por jugador+tenant, sin afectar al dashboard admin.

**Architecture:** Reusa la infra de rate-limit existente (`src/shared/rate-limit/*`, Upstash `Ratelimit.tokenBucket`) agregando una policy `publicBookingCreate` (IP). El tope de holds es una regla de negocio nueva dentro de `createOnlineBookingImpl`, serializada con `pg_advisory_xact_lock` (mismo patrón que `autoCompleteOverdueBookings`) para evitar TOCTOU entre el COUNT y el INSERT.

**Tech Stack:** Next.js 14 Server Actions, Drizzle ORM (`tx.execute(sql\`...\`)`), Upstash Redis/Ratelimit, Vitest (unit + integration contra Postgres real vía `withTenantContext`).

## Global Constraints

- ENUMs y nombres de columnas: `canceled` (nunca `cancelled`) — no aplica a este ticket (no se tocan enums).
- Montos en centavos (integer) — no aplica (no se manejan montos nuevos).
- `SET LOCAL` para tenant context, nunca `SET` sin LOCAL — ya respetado por `withTenantContext`/`withPlayerContext`; no se toca.
- Correr `pnpm typecheck` después de cada cambio (regla de CLAUDE.md).
- El dashboard admin (`createManualBooking` / `createBookingAction`) NO debe tocarse — ya usa `adminRateLimited` (100/60s por tenant) y nunca inserta `pending_payment`, así que queda estructuralmente fuera del tope de holds.
- Valores default usados (sin respuesta del usuario a la pregunta de negocio, documentado en el spec): `MAX_ACTIVE_HOLDS_PER_PLAYER = 3`, policy `publicBookingCreate = 10 req / 60s por IP, failMode 'open'`.

---

## File Structure

- `src/shared/rate-limit/policies.ts` — agrega la policy `publicBookingCreate`.
- `src/shared/constants.ts` — agrega `MAX_ACTIVE_HOLDS_PER_PLAYER`.
- `src/modules/bookings/booking.errors.ts` — agrega `TooManyActiveHoldsError`.
- `src/modules/bookings/booking.service.ts` — agrega el guard de tope de holds en `createOnlineBookingImpl`.
- `src/app/(public)/[slug]/reservar/actions.ts` — wire del rate limit por IP + catch de `TooManyActiveHoldsError`.
- `src/app/(public)/[slug]/reservar/page.tsx` — mensaje UI para `error=too_many_holds`.
- Tests nuevos: `tests/integration/public-booking-create-rate-limit.test.ts`, `tests/integration/booking-active-holds-limit.test.ts`.

---

### Task 1: Policy `publicBookingCreate` (IP) + rate limit en creación de holds

**Files:**
- Modify: `src/shared/rate-limit/policies.ts`
- Modify: `src/app/(public)/[slug]/reservar/actions.ts:1-30,88-110`
- Test: `tests/integration/public-booking-create-rate-limit.test.ts`

**Interfaces:**
- Consumes: `enforce(name: PolicyName, key: string)` de `@/shared/rate-limit` (ya existe, sin cambios de firma). `parseClientIp(headers: Headers): string` de `@/shared/rate-limit` (ya existe).
- Produces: policy `PolicyName` `'publicBookingCreate'` — usada en Task 1 solamente.

- [ ] **Step 1: Agregar la policy**

En `src/shared/rate-limit/policies.ts`, agregar antes del cierre del objeto `POLICIES` (después de `bookingStatus`, antes de `pinAttempts`):

```ts
  // INV-ABUSE-001 (Denial of Inventory): un mismo origen no debería crear
  // muchos holds (bookings pending_payment) por minuto, sin importar cuántas
  // cuentas de jugador use — playerBooking (20/60s por player) no cubre el
  // caso de múltiples cuentas desde la misma IP. Más estricto que
  // playerBooking a propósito. Fail open: ante outage de Upstash, no se
  // bloquea el negocio (mismo criterio que playerBooking/publicAvailability).
  publicBookingCreate: { limit: 10,  window: '60 s', keyBy: 'ip',     failMode: 'open'   },
```

- [ ] **Step 2: Escribir el test que falla (mecánica de la policy)**

Crear `tests/integration/public-booking-create-rate-limit.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_E2E = process.env.NEXT_PUBLIC_E2E

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    private prefix: string
    private _limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix
      this._limit = opts.limiter.limit
    }
    async limit(key: string) {
      const k = `${this.prefix}:${key}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return {
        success: n <= this._limit,
        limit: this._limit,
        remaining: Math.max(0, this._limit - n),
        reset: Date.now() + 60_000,
      }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Ratelimit } from '@upstash/ratelimit'
import { guard } from '@/shared/rate-limit/route-guard'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_E2E
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
})

afterAll(() => {
  if (ORIGINAL_E2E !== undefined) process.env.NEXT_PUBLIC_E2E = ORIGINAL_E2E
})

describe('publicBookingCreate rate limit (10/min por IP)', () => {
  it('10 OK, 11th throttled', async () => {
    const ip = '9.9.9.9'
    for (let i = 0; i < 10; i++) expect(await guard('publicBookingCreate', ip)).toBeNull()
    const r = await guard('publicBookingCreate', ip)
    expect(r?.status).toBe(429)
  })

  it('different IPs do not share buckets', async () => {
    for (let i = 0; i < 10; i++) await guard('publicBookingCreate', '1.1.1.1')
    expect(await guard('publicBookingCreate', '2.2.2.2')).toBeNull()
  })
})

describe('createBookingAndCheckout enforces publicBookingCreate', () => {
  it('calls enforce("publicBookingCreate", ip) before creating the hold', () => {
    const file = path.resolve(__dirname, '../../src/app/(public)/[slug]/reservar/actions.ts')
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/enforce\(\s*['"]publicBookingCreate['"]/)
  })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/integration/public-booking-create-rate-limit.test.ts`
Expected: FAIL — `publicBookingCreate` no existe en `POLICIES` (o el source-scan del segundo describe falla porque `actions.ts` todavía no la llama).

- [ ] **Step 4: Wire del enforce en `createBookingAndCheckout`**

En `src/app/(public)/[slug]/reservar/actions.ts`, agregar el import de `parseClientIp` junto al de `enforce` (línea 12):

```ts
import { enforce, parseClientIp } from '@/shared/rate-limit'
```

Y en `createBookingAndCheckout`, justo antes del `enforce('playerBooking', ...)` existente (línea 106), agregar:

```ts
  // publicBookingCreate (10/60s por IP): defensa de Denial-of-Inventory —
  // cubre el caso de múltiples cuentas de jugador desde el mismo origen, que
  // playerBooking (por player_id) no ve. INV-ABUSE-001.
  const ip = parseClientIp(headers())
  const ipRl = await enforce('publicBookingCreate', ip)
  if (!ipRl.ok) redirect(`${backTo}&error=rate_limited`)

  // playerBooking (20/60s per player): caps online-booking + MP-preference spam
  // from a single authenticated player (the public booking path, separate from
  // the /api/player/bookings route which is already guarded).
  const rl = await enforce('playerBooking', user!.playerId)
  if (!rl.ok) redirect(`${backTo}&error=rate_limited`)
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/integration/public-booking-create-rate-limit.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add src/shared/rate-limit/policies.ts src/app/"(public)"/[slug]/reservar/actions.ts tests/integration/public-booking-create-rate-limit.test.ts
git commit -m "feat(security): rate limit por IP en creación de holds públicos (INV-ABUSE-001)"
```

---

### Task 2: Tope duro de holds activos simultáneos por jugador+tenant

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/modules/bookings/booking.errors.ts`
- Modify: `src/shared/observability/breadcrumbs.ts:3-12` (agregar el literal nuevo al union `BookingEvent`)
- Modify: `src/modules/bookings/booking.service.ts:360-402` (dentro de `createOnlineBookingImpl`, entre el guard de balance y `lockCourtOrThrow`)
- Test: `tests/integration/booking-active-holds-limit.test.ts`

**Interfaces:**
- Consumes: `DbTx` de `@/shared/db/client` (ya usado en el archivo). `createOnlineBooking(tenantId, input, tx)` (firma sin cambios — el tope corre internamente, no agrega parámetros). `track.booking(ev: BookingEvent, ctx: BookingCtx)` de `@/shared/observability` — `BookingEvent` es un union literal estricto (`src/shared/observability/breadcrumbs.ts:3-12`), así que el evento nuevo debe agregarse ahí ANTES de usarlo o el typecheck falla.
- Produces: `MAX_ACTIVE_HOLDS_PER_PLAYER: number` (export de `src/shared/constants.ts`). `TooManyActiveHoldsError` (clase, export de `src/modules/bookings/booking.errors.ts`) con props `playerId: string`, `tenantId: string`, `activeCount: number` — Task 3 la consume en el catch de `createBookingAndCheckout`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/integration/booking-active-holds-limit.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { TooManyActiveHoldsError } from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { MAX_ACTIVE_HOLDS_PER_PLAYER } from '@/shared/constants'

const FUTURE_DATE = '2027-05-10' // Monday, far in the future

const PRICING = {
  rules: [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 },
  ],
}

async function insertCourt(tenantId: string, name: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${name}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertPendingHold(opts: {
  tenantId: string
  courtId: string
  playerId: string
  timeStart: string
  timeEnd: string
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${800000}, ${240000}, 'pending', NULL, 'pending_payment'
    )
    RETURNING id
  `
  return rows[0]!.id
}

beforeAll(async () => {
  setExpiryScheduler(async () => {})
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  setExpiryScheduler(null)
  await closeSql()
})

describe('createOnlineBooking — tope de holds activos (INV-ABUSE-001)', () => {
  it(`rechaza el hold ${MAX_ACTIVE_HOLDS_PER_PLAYER + 1} cuando ya hay ${MAX_ACTIVE_HOLDS_PER_PLAYER} pending_payment en el mismo tenant`, async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const holdCourt = await insertCourt(tenant.id, 'Cancha Holds')
    for (let i = 0; i < MAX_ACTIVE_HOLDS_PER_PLAYER; i++) {
      const h = String(8 + i).padStart(2, '0')
      const hNext = String(9 + i).padStart(2, '0')
      await insertPendingHold({
        tenantId: tenant.id,
        courtId: holdCourt,
        playerId: player.id,
        timeStart: `${h}:00`,
        timeEnd: `${hNext}:00`,
      })
    }

    const newCourt = await insertCourt(tenant.id, 'Cancha Nueva')
    const err = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId: newCourt,
          date: FUTURE_DATE,
          timeStart: '20:00',
          timeEnd: '21:00',
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      ),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(TooManyActiveHoldsError)
    expect((err as TooManyActiveHoldsError).activeCount).toBe(MAX_ACTIVE_HOLDS_PER_PLAYER)

    const count = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings WHERE court_id = ${newCourt}
    `
    expect(count[0]!.n).toBe(0)
  })

  it(`permite el hold cuando hay menos de ${MAX_ACTIVE_HOLDS_PER_PLAYER} pending_payment`, async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const holdCourt = await insertCourt(tenant.id, 'Cancha Holds')
    for (let i = 0; i < MAX_ACTIVE_HOLDS_PER_PLAYER - 1; i++) {
      const h = String(8 + i).padStart(2, '0')
      const hNext = String(9 + i).padStart(2, '0')
      await insertPendingHold({
        tenantId: tenant.id,
        courtId: holdCourt,
        playerId: player.id,
        timeStart: `${h}:00`,
        timeEnd: `${hNext}:00`,
      })
    }

    const newCourt = await insertCourt(tenant.id, 'Cancha Nueva')
    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId: newCourt,
          date: FUTURE_DATE,
          timeStart: '20:00',
          timeEnd: '21:00',
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('pending_payment')
  })

  it('holds en OTRO tenant no cuentan para el tope', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtA = await insertCourt(tenantA.id, 'Cancha A')
    for (let i = 0; i < MAX_ACTIVE_HOLDS_PER_PLAYER; i++) {
      const h = String(8 + i).padStart(2, '0')
      const hNext = String(9 + i).padStart(2, '0')
      await insertPendingHold({
        tenantId: tenantA.id,
        courtId: courtA,
        playerId: player.id,
        timeStart: `${h}:00`,
        timeEnd: `${hNext}:00`,
      })
    }

    const courtB = await insertCourt(tenantB.id, 'Cancha B')
    const booking = await withTenantContext(tenantB.id, (tx) =>
      createOnlineBooking(
        tenantB.id,
        {
          playerId: player.id,
          courtId: courtB,
          date: FUTURE_DATE,
          timeStart: '20:00',
          timeEnd: '21:00',
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('pending_payment')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/integration/booking-active-holds-limit.test.ts`
Expected: FAIL — `MAX_ACTIVE_HOLDS_PER_PLAYER` y `TooManyActiveHoldsError` no existen todavía.

- [ ] **Step 3: Agregar la constante**

En `src/shared/constants.ts`, agregar al final:

```ts

/**
 * INV-ABUSE-001 (Denial of Inventory): tope duro de bookings `pending_payment`
 * (holds sin pagar) que un mismo jugador puede tener a la vez en el mismo
 * tenant. Defensa de negocio, complementaria al rate-limit por IP/player —
 * ver docs/superpowers/specs/2026-07-02-inv-abuse-001-rate-limiting-design.md.
 */
export const MAX_ACTIVE_HOLDS_PER_PLAYER = 3
```

- [ ] **Step 4: Agregar el error**

En `src/modules/bookings/booking.errors.ts`, agregar al final del archivo:

```ts

// INV-ABUSE-001: tope duro de holds (pending_payment) simultáneos sin pagar
// por jugador+tenant — defensa de Denial-of-Inventory del portal público.
export class TooManyActiveHoldsError extends Error {
  constructor(
    public readonly playerId: string,
    public readonly tenantId: string,
    public readonly activeCount: number,
  ) {
    super(
      `Player ${playerId} already has ${activeCount} active pending_payment holds in tenant ${tenantId}`,
    )
    this.name = 'TooManyActiveHoldsError'
  }
}
```

- [ ] **Step 5: Agregar el evento de breadcrumb**

En `src/shared/observability/breadcrumbs.ts`, agregar el literal nuevo al union `BookingEvent` (líneas 3-12):

```ts
type BookingEvent =
  | 'booking.online.create.start'
  | 'booking.online.create.success'
  | 'booking.online.create.slot_taken'
  | 'booking.online.create.blocked_balance'
  | 'booking.online.create.too_many_holds'
  | 'booking.manual.create.success'
  | 'booking.transition.confirmed'
  | 'booking.transition.expired'
  | 'booking.cancel.by_player'
  | 'booking.cancel.by_admin'
```

- [ ] **Step 6: Implementar el guard en `createOnlineBookingImpl`**

En `src/modules/bookings/booking.service.ts`:

1. Agregar el import de la constante y del error nuevo. La línea de import de `booking.errors` (líneas 26-38) queda:

```ts
import {
  BookingDateOutOfRangeError,
  BookingNotInConfirmedError,
  BookingNotYetEndedError,
  BookingNotYetStartedError,
  BookingValidationError,
  CourtOfflineError,
  NoShowCorrectionWindowExpiredError,
  PlayerBannedError,
  PlayerHasOutstandingBalanceError,
  PriceUnavailableError,
  SlotTakenError,
  TooManyActiveHoldsError,
} from './booking.errors'
```

Y la línea de import de constants (línea 40) queda:

```ts
import { MAX_ACTIVE_HOLDS_PER_PLAYER, SLOT_DURATION_MINUTES } from '@/shared/constants'
```

2. Insertar, inmediatamente después del bloque del guard de balance deudor (después de la línea que hoy es `376  }` — el cierre del `if (isBlockedForOnlineBooking(blockState)) { ... }`, y ANTES de `const court = await lockCourtOrThrow(...)`):

```ts
  // INV-ABUSE-001: tope duro de holds activos (pending_payment) sin pagar
  // por jugador+tenant. Advisory lock (mismo patrón que
  // autoCompleteOverdueBookings) serializa intentos concurrentes del MISMO
  // jugador+tenant dentro de la tx, cerrando la ventana entre el COUNT y el
  // INSERT — sin esto, dos requests simultáneas podrían colar N+1 holds.
  const holdLockKey = `hold_limit:${tenantId}:${input.playerId}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${holdLockKey}))`)
  const activeHoldsRows = (await tx.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND player_id = ${input.playerId}
      AND status = 'pending_payment'
  `)) as unknown as Array<{ count: number }>
  const activeHoldsCount = activeHoldsRows[0]?.count ?? 0
  if (activeHoldsCount >= MAX_ACTIVE_HOLDS_PER_PLAYER) {
    track.booking('booking.online.create.too_many_holds', {
      tenantId,
      playerId: input.playerId,
    })
    throw new TooManyActiveHoldsError(input.playerId, tenantId, activeHoldsCount)
  }

```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/integration/booking-active-holds-limit.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Correr la suite de bookings existente (no regresión)**

Run: `pnpm vitest run tests/integration/bookings.test.ts tests/unit/booking-balance-guard.test.ts`
Expected: PASS — el guard nuevo no debe afectar los flujos ya cubiertos (usan <3 holds previos).

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos.

- [ ] **Step 10: Commit**

```bash
git add src/shared/constants.ts src/modules/bookings/booking.errors.ts src/modules/bookings/booking.service.ts tests/integration/booking-active-holds-limit.test.ts
git commit -m "feat(security): tope duro de holds pending_payment simultáneos por jugador (INV-ABUSE-001)"
```

---

### Task 3: Mapear `TooManyActiveHoldsError` en el flujo público

**Files:**
- Modify: `src/app/(public)/[slug]/reservar/actions.ts:17-25,168-176`
- Modify: `src/app/(public)/[slug]/reservar/page.tsx:132-141`

**Interfaces:**
- Consumes: `TooManyActiveHoldsError` de `@/modules/bookings/booking.errors` (Task 2).
- Produces: nada consumido por tasks posteriores — es el último eslabón de la cadena.

- [ ] **Step 1: Importar el error nuevo**

En `src/app/(public)/[slug]/reservar/actions.ts`, agregar `TooManyActiveHoldsError` al import existente de `@/modules/bookings/booking.errors` (líneas 17-25):

```ts
import {
  BookingDateOutOfRangeError,
  BookingValidationError,
  CourtOfflineError,
  PlayerBannedError,
  PlayerHasOutstandingBalanceError,
  PriceUnavailableError,
  SlotTakenError,
  TooManyActiveHoldsError,
} from '@/modules/bookings/booking.errors'
```

- [ ] **Step 2: Agregar el catch**

En el bloque `catch (err)` de `createBookingAndCheckout` (líneas 168-176), agregar la rama ANTES del `throw err` final:

```ts
  } catch (err) {
    if (err instanceof BookingValidationError) redirect(`${backTo}&error=unavailable`)
    if (err instanceof BookingDateOutOfRangeError) redirect(`${backTo}&error=date_out_of_range`)
    if (err instanceof SlotTakenError) redirect(`${backTo}&error=slot_taken`)
    if (err instanceof PlayerBannedError) redirect(`${backTo}&error=banned`)
    if (err instanceof PlayerHasOutstandingBalanceError) redirect(`${backTo}&error=debt`)
    if (err instanceof TooManyActiveHoldsError) redirect(`${backTo}&error=too_many_holds`)
    if (err instanceof CourtOfflineError || err instanceof PriceUnavailableError) redirect(`${backTo}&error=unavailable`)
    throw err
  }
```

- [ ] **Step 3: Agregar el mensaje UI**

En `src/app/(public)/[slug]/reservar/page.tsx`, agregar un bloque nuevo después del de `debt` (después de la línea 136 `)}` que cierra el bloque `debt`, antes del bloque `rate_limited`):

```tsx
      {searchParams.error === 'too_many_holds' && (
        <p role="alert" className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300 ring-1 ring-inset ring-amber-500/30">
          Ya tenés reservas pendientes de pago en este complejo. Completá o esperá a que venzan antes de reservar otra.
        </p>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores nuevos.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add src/app/"(public)"/[slug]/reservar/actions.ts src/app/"(public)"/[slug]/reservar/page.tsx
git commit -m "feat(security): mensaje UI para tope de holds activos (INV-ABUSE-001)"
```

---

### Task 4: Verificación final

**Files:** ninguno (solo comandos)

- [ ] **Step 1: Typecheck completo**

Run: `pnpm typecheck`
Expected: 0 errores.

- [ ] **Step 2: Lint completo**

Run: `pnpm lint`
Expected: 0 errores.

- [ ] **Step 3: Suite unitaria completa**

Run: `pnpm test`
Expected: todos los tests en verde, incluyendo los 3 archivos nuevos/tocados de este plan.

- [ ] **Step 4: Suite de integración relevante**

Run: `pnpm test:integration -- tests/integration/public-booking-create-rate-limit.test.ts tests/integration/booking-active-holds-limit.test.ts tests/integration/bookings.test.ts tests/integration/middleware-rate-limit.test.ts tests/integration/player-rate-limit.test.ts`
Expected: todos en verde.

- [ ] **Step 5: Registrar en docs/qa o PROGRESS si el proyecto lo usa**

Si existe convención de changelog/PROGRESS.md activa en el repo, agregar una línea describiendo INV-ABUSE-001 cerrado (archivo/línea de los cambios, cobertura de tests). Si no existe tal archivo activo para este tipo de ticket, omitir este paso — no crear un archivo nuevo solo para esto.
