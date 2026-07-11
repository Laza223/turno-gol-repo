# Booking Physical Instants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Almacenar el instante físico absoluto de cada booking en `bookings.starts_at`/`ends_at` (timestamptz) como fuente única para lógica fuerte y el exclusion constraint, dejando `date`/`time_start`/`time_end` solo para día operativo + display.

**Architecture:** El instante se computa **app-side** con un helper puro testeado (`physicalRange`), stampeado en cada insert. El exclusion constraint pasa a `tstzrange(starts_at, ends_at)` — se cae el acople `date WITH =`. La lógica de lectura (workers, cancelación, pre-checks de overlap) pasa a leer `starts_at`/`ends_at` directo, eliminando la reconstrucción SQL ad-hoc (`PHYSICAL_*_SQL`) y sus JOINs a `tenants`.

**Tech Stack:** Next.js 14 + Drizzle ORM + Postgres (Supabase local) + Vitest + `postgres` (raw sql en factories/tests).

## Global Constraints

- Montos en centavos; timestamps UTC; conversión a ART solo en frontend (CLAUDE.md).
- **UTC-3 fijo, sin tz-database** en el código app (coherente con `src/shared/dates/art.ts`; Argentina sin DST). En SQL de migración se usa `AT TIME ZONE 'America/Argentina/Buenos_Aires'` (= -3 para toda fecha real 2026+, idéntico al offset fijo).
- ENUMs `canceled` (una L). Nunca reescribir migraciones existentes (004/035); migraciones aditivas nuevas.
- `pnpm typecheck` **y** `pnpm lint` verdes tras cada task; si fallan, revertir.
- TDD; commits frecuentes; DRY; YAGNI.
- Aplicar migraciones al Supabase local: `pnpm db:sync-supabase && pnpm supabase:reset` (reset re-corre 001..N; los tests se auto-seedean con `cleanupAll`/`seedIsolationData`).
- Pre-req entorno: Supabase local corriendo (`pnpm supabase:start`), `.env.local` presente.

**Insert sites de `bookings` (verificados, exhaustivo):**
1. `src/modules/bookings/booking.service.ts` — `createManualBooking` (`.values`, ~L282)
2. `src/modules/bookings/booking.service.ts` — `createOnlineBookingImpl` (`.values`, ~L474)
3. `src/modules/abonados/abonado.service.ts` — `insertBookingsForSlots` (`.values` array, ~L123)
4. `tests/helpers/factories.ts` — `insertBooking` (raw SQL, ~L78)
5. `tests/integration/tenant-context.test.ts` — 2× `INSERT INTO bookings` crudos (~L46, L55)

**Read-side a migrar (payoff):**
- `booking.service.ts`: `completeBooking` (~L591), `autoCompleteOverdueBookings` (~L638), `markNoShow` (~L662); constantes `PHYSICALLY_NEXT_DAY_SQL`/`PHYSICAL_START_SQL`/`PHYSICAL_END_SQL` (L155-167); `checkOverlapOrThrow` (~L202).
- `booking.cancellation.ts`: `artDateAt(b.date, b.time_start)` en L130 y L225 (bug latente de refund-window en madrugada — se arregla).
- `abonados/abonado.service.ts`: `checkBookingOverlap` (~L79).

---

### Task 1: Helper puro `physicalRange` + unit tests

**Files:**
- Create: `src/shared/time/physical-range.ts`
- Test: `tests/unit/physical-range.test.ts`

**Interfaces:**
- Produces: `physicalRange(args: { date: string; timeStart: string; timeEnd: string; physicallyNextDay: boolean }): { startsAt: Date; endsAt: Date }`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/unit/physical-range.test.ts
import { describe, expect, it } from 'vitest'
import { physicalRange } from '@/shared/time/physical-range'

describe('physicalRange', () => {
  it('slot diurno same-day: 20:00–21:00 ART → instantes UTC-3', () => {
    const r = physicalRange({ date: '2026-06-15', timeStart: '20:00', timeEnd: '21:00', physicallyNextDay: false })
    expect(r.startsAt.toISOString()).toBe('2026-06-15T23:00:00.000Z')
    expect(r.endsAt.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it("slot 23:00→'24:00' termina exactamente a medianoche ART del día siguiente", () => {
    const r = physicalRange({ date: '2026-06-15', timeStart: '23:00', timeEnd: '24:00', physicallyNextDay: false })
    expect(r.startsAt.toISOString()).toBe('2026-06-16T02:00:00.000Z')
    expect(r.endsAt.toISOString()).toBe('2026-06-16T03:00:00.000Z') // 2026-06-16 00:00 ART
  })

  it('slot de madrugada post-medianoche (physicallyNextDay) se desplaza +1 día calendario', () => {
    const r = physicalRange({ date: '2026-06-15', timeStart: '01:00', timeEnd: '02:00', physicallyNextDay: true })
    expect(r.startsAt.toISOString()).toBe('2026-06-16T04:00:00.000Z') // 01:00 ART del 16
    expect(r.endsAt.toISOString()).toBe('2026-06-16T05:00:00.000Z')   // 02:00 ART del 16
  })

  it("tolera time con segundos ('20:00:00')", () => {
    const r = physicalRange({ date: '2026-06-15', timeStart: '20:00:00', timeEnd: '21:00:00', physicallyNextDay: false })
    expect(r.startsAt.toISOString()).toBe('2026-06-15T23:00:00.000Z')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test -- physical-range`
Expected: FAIL — `Cannot find module '@/shared/time/physical-range'`.

- [ ] **Step 3: Implementar el helper mínimo**

```ts
// src/shared/time/physical-range.ts
/**
 * Instante físico absoluto de un slot. UTC-3 fijo (idéntico al artDateAt del
 * módulo bookings; ART sin DST). Maneja time_end='24:00' por overflow de Date.UTC
 * (27h → día siguiente 00:00 ART). `physicallyNextDay` desplaza +1 día calendario
 * los slots de madrugada de complejos closes_next_day (start < apertura del día),
 * archivados bajo el día operativo anterior.
 */
export function physicalRange(args: {
  date: string // YYYY-MM-DD (día operativo)
  timeStart: string // HH:MM | HH:MM:SS
  timeEnd: string // HH:MM | HH:MM:SS | '24:00'
  physicallyNextDay: boolean
}): { startsAt: Date; endsAt: Date } {
  const at = (hhmm: string): Date => {
    const [y, mo, d] = args.date.split('-').map(Number)
    const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
    return new Date(
      Date.UTC(y!, (mo ?? 1) - 1, (d ?? 1) + (args.physicallyNextDay ? 1 : 0), (h ?? 0) + 3, m ?? 0),
    )
  }
  return { startsAt: at(args.timeStart), endsAt: at(args.timeEnd) }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test -- physical-range`
Expected: PASS (4 tests).

- [ ] **Step 5: typecheck + lint + commit**

Run: `pnpm typecheck && pnpm lint`
```bash
git add src/shared/time/physical-range.ts tests/unit/physical-range.test.ts
git commit -m "feat(bookings): helper puro physicalRange para instante físico de slots"
```

---

### Task 2: Columnas `starts_at`/`ends_at` (nullable) + backfill

**Files:**
- Modify: `src/shared/db/schema/bookings.ts:43-45`
- Create: `src/shared/db/migrations/040_booking_physical_instants_add.sql`

**Interfaces:**
- Produces: columnas `bookings.starts_at` / `bookings.ends_at` (timestamptz, nullable por ahora), backfilleadas en filas existentes. Drizzle: `bookings.startsAt` / `bookings.endsAt`.

- [ ] **Step 1: Agregar columnas nullable al schema Drizzle**

En `src/shared/db/schema/bookings.ts`, después de la línea `timeEnd: time('time_end').notNull(),` (L45):

```ts
    // Instante físico absoluto (fuente única para lógica fuerte + constraint).
    // date/time_start/time_end quedan para día operativo + display. NOT NULL se
    // activa en migr. 041 una vez que todos los inserts los populan.
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
```

- [ ] **Step 2: Escribir la migración aditiva de columnas + backfill**

```sql
-- src/shared/db/migrations/040_booking_physical_instants_add.sql
-- ============================================================
-- 040: bookings.starts_at / ends_at (timestamptz) — instante físico absoluto.
-- Aditiva, nullable + backfill. NOT NULL + swap de constraint van en 041.
-- El backfill usa la lógica PHYSICALLY_NEXT_DAY en SQL UNA sola vez (no runtime).
-- AT TIME ZONE nombrada = -3 para toda fecha real (2026+), idéntico al artDateAt
-- fijo del app. date + '24:00'::time rola a día siguiente 00:00 en Postgres.
-- Pre-deploy sin tenants reales → backfill toca solo filas de seed.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ends_at   TIMESTAMPTZ;

UPDATE bookings b SET
  starts_at = ((b.date + b.time_start) AT TIME ZONE 'America/Argentina/Buenos_Aires')
    + CASE WHEN (
        t.closes_next_day AND b.time_start < COALESCE(
          (t.opening_hours -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[EXTRACT(DOW FROM b.date)::int + 1] ->> 'open')::time,
          '08:00'::time)
      ) THEN INTERVAL '1 day' ELSE INTERVAL '0' END,
  ends_at = ((b.date + b.time_end) AT TIME ZONE 'America/Argentina/Buenos_Aires')
    + CASE WHEN (
        t.closes_next_day AND b.time_start < COALESCE(
          (t.opening_hours -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[EXTRACT(DOW FROM b.date)::int + 1] ->> 'open')::time,
          '08:00'::time)
      ) THEN INTERVAL '1 day' ELSE INTERVAL '0' END
FROM tenants t
WHERE t.id = b.tenant_id AND b.starts_at IS NULL;

COMMENT ON COLUMN bookings.starts_at IS 'Instante físico absoluto de inicio (tstz). Fuente única de lógica fuerte; date=día operativo, time_start=display.';
COMMENT ON COLUMN bookings.ends_at   IS 'Instante físico absoluto de fin (tstz). Corrige slots post-medianoche de complejos closes_next_day.';
```

- [ ] **Step 3: Aplicar la migración al Supabase local**

Run: `pnpm db:sync-supabase && pnpm supabase:reset`
Expected: reset corre 001..036 sin error; `bookings` tiene `starts_at`/`ends_at`.

- [ ] **Step 4: Verificar typecheck + suite de integración sigue verde**

Run: `pnpm typecheck && pnpm test:integration -- bookings`
Expected: PASS. (Columnas nullable → inserts viejos dejan NULL, permitido; nada se rompe.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/db/schema/bookings.ts src/shared/db/migrations/040_booking_physical_instants_add.sql supabase/migrations/
git commit -m "feat(bookings): columnas starts_at/ends_at (nullable) + backfill (migr. 036)"
```

---

### Task 3: Populate `starts_at`/`ends_at` en todos los insert sites + pre-checks de overlap a instantes

**Files:**
- Modify: `src/modules/bookings/booking.service.ts` (`createManualBooking`, `createOnlineBookingImpl`, `checkOverlapOrThrow`)
- Modify: `src/modules/abonados/abonado.service.ts` (`insertBookingsForSlots`, `checkBookingOverlap`)
- Modify: `tests/helpers/factories.ts` (`insertBooking`)
- Modify: `tests/integration/tenant-context.test.ts` (2 inserts crudos)

**Interfaces:**
- Consumes: `physicalRange` (Task 1), `slotIsPhysicallyNextDay(tenantId, dateStr, timeStart, tx): Promise<boolean>` (existente).
- Produces: `checkOverlapOrThrow(courtId: string, startsAt: Date, endsAt: Date, tx: DbTx): Promise<void>`; `checkBookingOverlap(courtId: string, startsAt: Date, endsAt: Date, tx: DbTx): Promise<boolean>`.

- [ ] **Step 1: Reescribir `checkOverlapOrThrow` a instantes** (`booking.service.ts:202-227`)

```ts
async function checkOverlapOrThrow(
  courtId: string,
  startsAt: Date,
  endsAt: Date,
  tx: DbTx,
): Promise<void> {
  const result = await tx.execute(sql`
    SELECT 1
    FROM bookings
    WHERE court_id = ${courtId}
      AND status IN ('pending_payment', 'confirmed')
      AND tstzrange(starts_at, ends_at) && tstzrange(${startsAt.toISOString()}, ${endsAt.toISOString()})
    LIMIT 1
  `)
  if ((result as unknown as unknown[]).length > 0) {
    throw new SlotTakenError()
  }
}
```

- [ ] **Step 2: `createManualBooking` — computar instante y pasarlo al overlap + insert** (`booking.service.ts` ~L241-300)

Después de `const court = await lockCourtOrThrow(...)` y su guard de tenant, y ANTES de `checkOverlapOrThrow`, insertar:

```ts
  const physicallyNextDay = await slotIsPhysicallyNextDay(
    tenantId, input.date, input.timeStart, tx,
  )
  const { startsAt, endsAt } = physicalRange({
    date: input.date, timeStart: input.timeStart, timeEnd: input.timeEnd, physicallyNextDay,
  })
```

Cambiar la llamada de overlap:

```ts
  await checkOverlapOrThrow(input.courtId, startsAt, endsAt, tx)
```

Agregar al `.values({ ... })` (junto a `timeStart`/`timeEnd`):

```ts
        startsAt,
        endsAt,
```

- [ ] **Step 3: `createOnlineBookingImpl` — idem antes del insert** (`booking.service.ts` ~L458-489)

Antes de `await checkOverlapOrThrow(...)` (~L458):

```ts
  const physicallyNextDay = await slotIsPhysicallyNextDay(
    tenantId, input.date, input.timeStart, tx,
  )
  const { startsAt, endsAt } = physicalRange({
    date: input.date, timeStart: input.timeStart, timeEnd: input.timeEnd, physicallyNextDay,
  })
```

Cambiar overlap: `await checkOverlapOrThrow(input.courtId, startsAt, endsAt, tx)`.
Agregar al `.values({ ... })`: `startsAt,` `endsAt,`.

- [ ] **Step 4: `abonado.service.ts` — `checkBookingOverlap` a instantes + `insertBookingsForSlots`** (~L79-143)

Reescribir `checkBookingOverlap`:

```ts
async function checkBookingOverlap(
  courtId: string,
  startsAt: Date,
  endsAt: Date,
  tx: DbTx,
): Promise<boolean> {
  const rows = await tx.execute(sql`
    SELECT id FROM bookings
    WHERE court_id = ${courtId}
      AND status NOT IN ('canceled_refunded','canceled_no_refund')
      AND tstzrange(starts_at, ends_at) && tstzrange(${startsAt.toISOString()}, ${endsAt.toISOString()})
    LIMIT 1
  `)
  return (rows as unknown[]).length > 0
}
```

Reescribir `insertBookingsForSlots` para computar `physicallyNextDay` una vez (constante: mismo `dayOfWeek`+`timeStart` para todo el abonado) y `physicalRange` por fecha:

```ts
async function insertBookingsForSlots(
  slotDates: string[],
  abonado: AbonadoRow,
  tenantId: string,
  tx: DbTx,
): Promise<{ slotsGenerated: number; conflictDates: string[] }> {
  const conflictDates: string[] = []
  const validRows: Array<{ dateStr: string; startsAt: Date; endsAt: Date }> = []

  const physicallyNextDay = slotDates.length > 0
    ? await slotIsPhysicallyNextDay(tenantId, slotDates[0]!, abonado.timeStart, tx)
    : false

  for (const dateStr of slotDates) {
    const { startsAt, endsAt } = physicalRange({
      date: dateStr, timeStart: abonado.timeStart, timeEnd: abonado.timeEnd, physicallyNextDay,
    })
    const hasConflict = await checkBookingOverlap(abonado.courtId, startsAt, endsAt, tx)
    if (hasConflict) {
      conflictDates.push(dateStr)
    } else {
      validRows.push({ dateStr, startsAt, endsAt })
    }
  }

  if (validRows.length > 0) {
    await tx.insert(bookings).values(
      validRows.map(({ dateStr, startsAt, endsAt }) => ({
        tenantId,
        courtId: abonado.courtId,
        playerId: abonado.playerId ?? null,
        abonadoId: abonado.id,
        date: new Date(`${dateStr}T00:00:00Z`),
        timeStart: abonado.timeStart,
        timeEnd: abonado.timeEnd,
        startsAt,
        endsAt,
        type: 'fixed' as const,
        status: 'confirmed' as const,
        priceSnapshot: abonado.pricePerSession,
        depositAmount: 0,
        depositStatus: 'not_required' as const,
        paymentMethod: null,
      })),
    )
  }

  return { slotsGenerated: validRows.length, conflictDates }
}
```

Agregar el import de `slotIsPhysicallyNextDay` y `physicalRange` si no están. `slotIsPhysicallyNextDay` está en `booking.service.ts` como función NO exportada — exportarla (`export async function slotIsPhysicallyNextDay`) e importarla acá; o mover a `physical-range.ts` una variante que reciba `openingHours`. **Decisión:** exportar `slotIsPhysicallyNextDay` desde `booking.service.ts` (mínimo cambio) e importarla en `abonado.service.ts`.

- [ ] **Step 5: Factory `insertBooking` — computar starts_at/ends_at en SQL** (`tests/helpers/factories.ts:78-91`)

```ts
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method
      ${opts.status ? sql`, status` : sql``}
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId ?? null},
      ${date}, ${timeStart}, ${timeEnd},
      (${date}::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${date}::date + ${timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${800000}, ${depositAmount}, ${depositStatus}, NULL
      ${opts.status ? sql`, ${opts.status}::booking_status` : sql``}
    )
    RETURNING id
  `
```

(La factory no usa `closes_next_day`; los tests que necesiten madrugada pasan tiempos explícitos y esta expresión los ubica correctamente igual, salvo la corrección next-day que no aplica a data de test estándar.)

- [ ] **Step 6: `tenant-context.test.ts` — agregar starts_at/ends_at a los 2 INSERT crudos** (L46, L55)

En cada `INSERT INTO bookings (...)`, agregar las columnas `starts_at, ends_at` a la lista y a los VALUES:

```sql
      starts_at, ends_at
```
y en VALUES (usando las mismas `date`/`time_start`/`time_end` del insert):
```sql
      (<date>::date + <time_start>::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (<date>::date + <time_end>::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires'
```
(Reemplazar `<date>`/`<time_start>`/`<time_end>` por los literales/placeholders que ya usa cada INSERT.)

- [ ] **Step 7: typecheck + integración**

Run: `pnpm typecheck && pnpm lint && pnpm test:integration`
Expected: PASS. `$inferInsert` sigue permitiendo omitir starts_at (nullable), pero ahora TODOS los inserts los setean.

- [ ] **Step 8: Commit**

```bash
git add src/modules/bookings/booking.service.ts src/modules/abonados/abonado.service.ts tests/helpers/factories.ts tests/integration/tenant-context.test.ts
git commit -m "feat(bookings): stampear starts_at/ends_at en los 3 insert sites + factory + overlap por instante"
```

---

### Task 4: NOT NULL + swap del exclusion constraint a `tstzrange` + test de closes_next_day

**Files:**
- Modify: `src/shared/db/schema/bookings.ts` (flip a `.notNull()`)
- Create: `src/shared/db/migrations/041_booking_physical_instants_enforce.sql`
- Create: `tests/integration/booking-physical-overlap.test.ts`

**Interfaces:**
- Consumes: `createManualBooking` (ya stampea instantes), `createTestTenant`/`seedIsolationData`/`insertCourt` (helpers de test existentes).

- [ ] **Step 1: Escribir el test de integración que falla (constraint por instante, closes_next_day)**

```ts
// tests/integration/booking-physical-overlap.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
import { SlotTakenError } from '@/modules/bookings/booking.errors'
import {
  cleanupAll, createTestPlayer, createTestTenant, ensureRoles, linkPlayerToTenant,
} from '../helpers/tenant'
import { insertCourt } from '../helpers/factories'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
  // Complejo que cierra después de medianoche: apertura 20:00, cierre 02:00.
  await sql`
    UPDATE tenants SET closes_next_day = true,
      opening_hours = ${sql.json({
        mon: { open: '20:00', close: '02:00' }, tue: { open: '20:00', close: '02:00' },
        wed: { open: '20:00', close: '02:00' }, thu: { open: '20:00', close: '02:00' },
        fri: { open: '20:00', close: '02:00' }, sat: { open: '20:00', close: '02:00' },
        sun: { open: '20:00', close: '02:00' },
      })}
    WHERE id = ${tenant.id}
  `
}, 30_000)

afterAll(async () => { await closeSql() })

function attempt(args: { timeStart: string; timeEnd: string; date: string }) {
  return withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await createManualBooking(tenant.id, {
        courtId: seed.courtId, date: args.date, timeStart: args.timeStart, timeEnd: args.timeEnd,
        type: 'spontaneous', staffUserId: seed.staffUserId, playerId, priceOverride: 800000,
      }, tx)
      return { outcome: 'won' as const, booking }
    } catch (error) {
      return { outcome: 'lost' as const, error }
    }
  })
}

describe('booking overlap por instante físico (closes_next_day)', () => {
  it('dos slots de madrugada idénticos (01:00–02:00, mismo día operativo) → 1 gana, 1 SlotTakenError', async () => {
    const [a, b] = await Promise.all([
      attempt({ date: '2026-06-15', timeStart: '01:00', timeEnd: '02:00' }),
      attempt({ date: '2026-06-15', timeStart: '01:00', timeEnd: '02:00' }),
    ])
    const winners = [a, b].filter((r) => r.outcome === 'won')
    const losers = [a, b].filter((r) => r.outcome === 'lost')
    expect(winners).toHaveLength(1)
    expect(losers[0].outcome === 'lost' && losers[0].error).toBeInstanceOf(SlotTakenError)
  }, 30_000)

  it('slot pre-medianoche 23:00→24:00 y slot madrugada 01:00→02:00 del mismo día operativo NO falsan solape', async () => {
    const [pre, madru] = await Promise.all([
      attempt({ date: '2026-06-16', timeStart: '23:00', timeEnd: '24:00' }),
      attempt({ date: '2026-06-16', timeStart: '01:00', timeEnd: '02:00' }),
    ])
    expect(pre.outcome).toBe('won')
    expect(madru.outcome).toBe('won')
  }, 30_000)
})
```

- [ ] **Step 2: Correr el test — verificar que falla ANTES del constraint nuevo**

Run: `pnpm test:integration -- booking-physical-overlap`
Expected: el primer caso puede fallar (el constraint viejo keyea `date WITH =` + tsrange sobre `time`; dos slots 01:00–02:00 mismo `date` sí colisionan bajo el viejo también, así que este test podría pasar ya). El objetivo real: que quede verde y estable con el constraint NUEVO. Si pasa con el viejo, igual sirve de regresión. Documentar el resultado observado.

- [ ] **Step 3: Flip del schema a NOT NULL** (`src/shared/db/schema/bookings.ts`)

```ts
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
```

- [ ] **Step 4: Migración de enforcement + swap de constraint**

```sql
-- src/shared/db/migrations/041_booking_physical_instants_enforce.sql
-- ============================================================
-- 041: NOT NULL sobre starts_at/ends_at + exclusion constraint por instante.
-- El constraint deja de keyear 'date WITH =': el overlap depende del instante
-- físico, no del día operativo bajo el que se archiva el slot. btree_gist ya
-- cargado (migr. 001); tstzrange no requiere extensión nueva.
-- ============================================================

ALTER TABLE bookings ALTER COLUMN starts_at SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN ends_at   SET NOT NULL;

ALTER TABLE bookings DROP CONSTRAINT no_overlapping_bookings;
ALTER TABLE bookings ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  )
  WHERE (status IN ('pending_payment', 'confirmed'));

CREATE INDEX IF NOT EXISTS idx_bookings_starts_at ON bookings(starts_at);
```

- [ ] **Step 5: Aplicar + correr race tests + el test nuevo**

Run: `pnpm db:sync-supabase && pnpm supabase:reset`
Run: `pnpm typecheck && pnpm test:integration -- race-double-booking race-admin-vs-online booking-physical-overlap`
Expected: PASS. Los race tests validan que el constraint nuevo sigue previniendo doble-booking del mismo instante y permite adyacentes/otras canchas.

- [ ] **Step 6: Commit**

```bash
git add src/shared/db/schema/bookings.ts src/shared/db/migrations/041_booking_physical_instants_enforce.sql supabase/migrations/ tests/integration/booking-physical-overlap.test.ts
git commit -m "feat(bookings): NOT NULL + exclusion constraint por tstzrange(starts_at,ends_at) (migr. 037)"
```

---

### Task 5: Payoff read-side — workers, cancelación y borrado de `PHYSICAL_*_SQL`

**Files:**
- Modify: `src/modules/bookings/booking.service.ts` (`completeBooking`, `autoCompleteOverdueBookings`, `markNoShow`; borrar L155-167)
- Modify: `src/modules/bookings/booking.cancellation.ts` (L130, L225; `artDateAt` local)

**Interfaces:**
- Consumes: columnas `bookings.starts_at`/`ends_at` (NOT NULL, Task 4).

- [ ] **Step 1: `completeBooking` — leer `b.ends_at` directo** (`booking.service.ts` ~L590-601)

```ts
  if (actor === 'admin') {
    const check = await tx.execute(sql`
      SELECT b.ends_at > NOW() AS not_yet_ended
      FROM bookings b
      WHERE b.id = ${bookingId}
    `)
    const row = (check as unknown as Array<{ not_yet_ended: boolean }>)[0]
    if (row?.not_yet_ended) {
      throw new BookingNotYetEndedError(bookingId)
    }
  }
```

- [ ] **Step 2: `autoCompleteOverdueBookings` — `b.ends_at < NOW() - grace`, sin JOIN a tenants** (~L638-646)

```ts
  const rows = await tx.execute(sql`
    UPDATE bookings b
    SET status = 'completed', updated_at = NOW()
    WHERE b.status = 'confirmed'
      AND b.ends_at < NOW() - (${graceMinutes} || ' minutes')::interval
    RETURNING b.*
  `)
```

- [ ] **Step 3: `markNoShow` — `b.starts_at > NOW()`** (~L662-669)

```ts
  const check = await tx.execute(sql`
    SELECT
      b.status,
      b.starts_at > NOW() AS not_yet_started,
      (NOW() - b.updated_at) < INTERVAL '24 hours' AS within_correction_window
    FROM bookings b
    WHERE b.id = ${bookingId}
  `)
```

- [ ] **Step 4: Borrar las constantes SQL muertas** (`booking.service.ts` L155-167)

Eliminar `PHYSICALLY_NEXT_DAY_SQL`, `PHYSICAL_START_SQL`, `PHYSICAL_END_SQL` y su bloque de comentario. `slotIsPhysicallyNextDay` (la función JS) SE MANTIENE — la usan los create paths y los guards de fecha.

- [ ] **Step 5: `booking.cancellation.ts` — refund-window por `b.starts_at`** (L130, L225)

En ambas funciones, reemplazar:
```ts
  const bookingStartUtc = artDateAt(b.date, b.time_start.slice(0, 5))
```
por:
```ts
  const bookingStartUtc = new Date(b.starts_at)
```
Verificar que `lockBooking` devuelve `starts_at` (si hace `SELECT *`, ya está; si lista columnas, agregar `starts_at`). Si el `artDateAt` local (L23) queda sin usos, borrarlo. Esto además corrige el bug latente: la ventana de reembolso de slots de madrugada ahora usa el instante real, no `date+time` sin corrección.

- [ ] **Step 6: typecheck + lint + suite completa**

Run: `pnpm typecheck && pnpm lint`
Run: `pnpm test && pnpm test:integration`
Expected: PASS. Verificar en particular `bookings.test.ts`, `booking-time-validation.test.ts`, cancelación y los workers.

- [ ] **Step 7: Commit**

```bash
git add src/modules/bookings/booking.service.ts src/modules/bookings/booking.cancellation.ts
git commit -m "refactor(bookings): lógica fuerte lee starts_at/ends_at directo; borra PHYSICAL_*_SQL; corrige refund-window madrugada"
```

---

### Task 6: Sweep de insert sites de test faltantes (gap del mapa de blast radius)

**Contexto:** El mapa "exhaustivo" de insert sites (§Global Constraints) subestimó los tests: hay **31 `INSERT INTO bookings` en 23 archivos** de `tests/`. Tasks 3/5 cubrieron 5 archivos (factories, tenant-context, bookings, cancellations, concurrent-cancellation). El `NOT NULL` de migr. 041 (Task 4) rompió los **18 restantes** con `null value in column starts_at`. Este task los cierra. (El "NOT NULL falla fuerte" del plan hizo su trabajo — detectó el gap.)

**Files (18, cada uno con `INSERT INTO bookings` crudo o helper local):**
`abonados.test.ts`, `abonado-credit-debt.test.ts`, `availability-search.test.ts`, `availability-search-perf.test.ts`, `booking-active-holds-limit.test.ts`, `booking-charges.test.ts`, `booking-api.test.ts`, `booking-expiry.test.ts`, `cashflow.test.ts`, `isolation.test.ts` (×3, **BLOQUEANTE doc16**), `mp-circuit-breaker-contract.test.ts` (×2), `mp-webhook.test.ts`, `payments.test.ts` (helper `insertPendingBooking`), `player-anonymization.test.ts`, `player-app.test.ts`, `race-abonado-vs-individual.test.ts`, `reconcile-pending-payments-idempotency.test.ts`, `reservas-queries.test.ts` — todos en `tests/integration/`. Además: grepear `scripts/` por seeds con inserts crudos.

**Patrón (igual que `factories.ts` en Task 3):** a cada `INSERT INTO bookings (...)` agregar columnas `starts_at, ends_at` y valores
`(<date>::date + <time_start>::time) AT TIME ZONE 'America/Argentina/Buenos_Aires'` y el gemelo con `<time_end>`, usando las variables/literales de fecha/hora de ESE insert. Para fixtures de madrugada (día operativo) que dependan del instante corregido, computar con `+ INTERVAL '1 day'` cuando el slot sea post-medianoche.

**Verificación (gate):** `pnpm test:isolation` VERDE (bloqueante). `pnpm test:integration` verde salvo ruido pre-existente documentado (flake cross-file `race-abonado-vs-individual` solo sin reset previo; `r2.ts` typecheck ajeno; unit tslib env). `payments.test.ts` y `cashflow.test.ts` (cobertura `cancelByPlayer`) verdes. Limpieza: borrar import muerto `insertCourt` en `booking-physical-overlap.test.ts:8`. Commit único.

## Self-Review

**Spec coverage:**
- `starts_at`/`ends_at` timestamptz NOT NULL → Task 2 (nullable+backfill) + Task 4 (NOT NULL). ✓
- App-side compute vía helper puro → Task 1 + Task 3. ✓
- Constraint a `tstzrange` sin `date WITH =` → Task 4. ✓
- `date`/`time_*` intactos para display → no se tocan. ✓
- `abonados` template sin cambios (solo sus bookings generados) → Task 3 Step 4. ✓
- Payoff read-side (workers + borrado PHYSICAL_*_SQL) → Task 5. ✓
- Bug latente de cancelación (extra, alineado con la clase de bug) → Task 5 Step 5. ✓
- `slotIsPhysicallyNextDay` se mantiene (create paths + guards) → Task 5 Step 4 lo aclara. ✓
- Known-edge block pre-apertura: pre-existente, documentado en el spec; sin task (no regresión). ✓

**Placeholder scan:** `tenant-context.test.ts` (Task 3 Step 6) usa `<date>`/`<time_start>` como marcadores porque no se leyó el contenido exacto de esos 2 INSERT — el implementador reemplaza por los literales/placeholders reales del archivo. Es el único punto que exige lectura in situ; todo lo demás tiene código completo.

**Type consistency:** `physicalRange` firma idéntica en Task 1 (define) y Task 3 (consume). `checkOverlapOrThrow(courtId, startsAt, endsAt, tx)` y `checkBookingOverlap(courtId, startsAt, endsAt, tx)` coherentes entre definición y llamadas. `slotIsPhysicallyNextDay` exportada en Task 3 Step 4, consumida en abonado.

**Riesgos abiertos para el implementador:**
1. `lockBooking` (cancelación) debe exponer `starts_at` — verificar el SELECT (Task 5 Step 5).
2. `db:sync-supabase` + `supabase:reset` asume Supabase local corriendo; si el runner de integración aplica migraciones distinto, ajustar el comando de "aplicar migración".
3. Si algún test de integración inserta bookings por una vía no listada, `NOT NULL` (Task 4) lo hará fallar fuerte — es el mecanismo de detección, no un problema silencioso.
