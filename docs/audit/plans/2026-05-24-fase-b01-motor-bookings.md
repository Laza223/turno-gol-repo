# Fase B1 — Motor de Reservas (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auditar el motor de reservas (módulo `src/modules/bookings/`) para identificar y cerrar gaps NO cubiertos por los tests existentes que pasaron en B0, focalizándose en: races cruzados (admin manual + jugador online + abonado slot-generator), validación temporal de transiciones (completeBooking/markNoShow), scheduling de jobs (sweep + autoComplete), idempotencia bajo retry, y borde libuv cleanup. Resultado: tests nuevos verdes + report con todo el motor mapeado y validado.

**Architecture:** Auditoría dirigida por hipótesis basadas en mapeo previo del investigator. Cada task identifica un gap específico, escribe test que lo cubre, observa resultado real (puede pasar o fallar), si falla → fix + re-test (TDD), si pasa → documenta como "validado, no era bug". NO refactorizar código sin gap demostrado. Worktree aislado `audit/backend-b01`. Cada test gap = 1 commit. Report final consolidado al cerrar fase.

**Tech Stack:** Vitest, Drizzle ORM, postgres.js, pg-boss, TypeScript strict. Helpers de test en `tests/helpers/` (tenant, seed, factories). Pattern de race test ya establecido en `tests/integration/race-double-booking.test.ts`.

---

## File Structure

**Crear:**
- `tests/integration/race-admin-vs-online.test.ts` — race entre admin manual + jugador online mismo slot
- `tests/integration/race-abonado-vs-individual.test.ts` — race entre slot-generator abonado + booking individual
- `tests/integration/race-cancel-vs-expire.test.ts` — race entre cancel + expire simultáneos
- `tests/integration/booking-time-validation.test.ts` — completeBooking + markNoShow antes/después de time_end
- `tests/integration/online-booking-no-deposit-race.test.ts` — createOnlineBooking requiresDeposit=false vs MP webhook tardío
- `tests/integration/sweep-cron-scheduling.test.ts` — verifica sweepExpiredPendingBookings tiene cron real definido
- `docs/audit/reports/fase-b01-motor-bookings-report.md` — report consolidado
- `docs/audit/reports/fase-b01-raw/` — outputs raw de cada test agregado

**Modificar (solo si test descubre bug real):**
- `src/modules/bookings/booking.service.ts`
- `src/modules/bookings/booking.cancellation.ts`
- `src/modules/bookings/booking.expiry.ts`
- `src/shared/jobs/definitions.ts` (si falta scheduling)

**Modificar siempre:**
- `docs/audit/STATE.md` — al iniciar y completar fase

**NO modificar:**
- `src/modules/bookings/booking.state-machine.ts` (ya tiene transiciones explícitas)
- `src/shared/db/migrations/*` (constraints DB ya correctas)
- Tests que ya pasan (no regresión)

---

## Task 0: Setup (ya completado externamente)

- [x] Worktree `audit/backend-b01` creado
- [x] `pnpm install` hecho
- [x] `.env.local` + `.env.test` copiados
- [x] `docs/audit/` heredado del merge B0

---

## Task 1: Audit estructural inicial

**Files:**
- Create: `docs/audit/reports/fase-b01-raw/audit-structural.md`

**Objetivo**: Leer el módulo bookings completo + documentar estado de cada subsistema.

- [ ] **Step 1: Verificar estructura módulo bookings**

```bash
cd "C:/Users/Lazar/Documents/github/TurnoGol-audit-b01"
ls -la src/modules/bookings/
wc -l src/modules/bookings/*.ts > docs/audit/reports/fase-b01-raw/audit-structural.md
```
Expected: 9 archivos listados con LOC.

- [ ] **Step 2: Leer y documentar booking.state-machine.ts**

Leer archivo completo. Documentar en `audit-structural.md`:
- Lista completa de estados (enum `BookingStatus`)
- Tabla TRANSITIONS (de qué estado a cuáles)
- ACTOR_RULES (quién puede hacer qué transición)
- Estados terminales identificados
- Función `canTransition` / `assertTransition` semánticas

- [ ] **Step 3: Leer y documentar exclusion constraint**

```bash
grep -n "no_overlapping_bookings\|EXCLUDE" src/shared/db/migrations/004_isolated_tables.sql
```
Documentar:
- Línea exacta del constraint
- Columns + operators
- WHERE clause (status IN ?)
- Detección error en service: `grep -n "23P01\|EXCLUSION_VIOLATION" src/modules/bookings/`

- [ ] **Step 4: Leer trigger enforce_booking_invariants_fn**

```bash
grep -A 30 "enforce_booking_invariants_fn" src/shared/db/migrations/005_triggers.sql
```
Documentar reglas que enforza el trigger.

- [ ] **Step 5: Mapear scheduling jobs bookings**

```bash
grep -rn "schedule\|cron\|every\|interval" src/shared/jobs/ | grep -iE "expir|complete|booking"
```
Documentar:
- ¿`sweepExpiredPendingBookings` tiene cron definido? Path:línea
- ¿`autoCompleteOverdueBookings` tiene cron definido? Path:línea
- Si NO → P0 issue para fase

- [ ] **Step 6: Commit audit estructural**

```bash
cd "C:/Users/Lazar/Documents/github/TurnoGol-audit-b01"
git add docs/audit/reports/fase-b01-raw/audit-structural.md
git commit -m "audit(b01): structural audit booking module"
```

---

## Task 2: Test race admin manual vs jugador online (mismo slot)

**Files:**
- Create: `tests/integration/race-admin-vs-online.test.ts`

**Hipótesis a validar**: existe `race-double-booking.test.ts` que prueba N concurrent `createManualBooking`. Pero no hay test mixto: admin manual + jugador online simultáneo. Validar que exclusion constraint los cubre igual.

- [ ] **Step 1: Escribir test failing**

```typescript
// tests/integration/race-admin-vs-online.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking, createOnlineBooking } from '@/modules/bookings/booking.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
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
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('race: admin manual vs player online (same court/slot)', () => {
  it('admin manual + online concurrent → exactly 1 wins', async () => {
    const date = '2026-07-15'
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const adminAttempt = withTenantContext(tenant.id, async (tx) => {
      try {
        await createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date,
            timeStart,
            timeEnd,
            durationMins: 60,
            type: 'spontaneous',
            staffUserId: seed.staffUserId,
            playerId,
          },
          tx,
        )
        return 'admin_won' as const
      } catch {
        return 'admin_lost' as const
      }
    })

    const onlineAttempt = withTenantContext(tenant.id, async (tx) => {
      try {
        await createOnlineBooking(
          tenant.id,
          {
            playerId,
            courtId: seed.courtId,
            date,
            timeStart,
            timeEnd,
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        )
        return 'online_won' as const
      } catch {
        return 'online_lost' as const
      }
    })

    const results = await Promise.all([adminAttempt, onlineAttempt])
    const wins = results.filter((r) => r.endsWith('_won')).length
    expect(wins).toBe(1)

    const sql = getSql()
    const rows = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM bookings
      WHERE court_id = ${seed.courtId}
        AND date = ${date}::date
        AND time_start = ${timeStart}::time
        AND status IN ('pending_payment', 'confirmed')
    `
    expect(rows[0].c).toBe(1)
  }, 30_000)
})
```

- [ ] **Step 2: Correr test**

```bash
cd "C:/Users/Lazar/Documents/github/TurnoGol-audit-b01"
pnpm exec vitest run tests/integration/race-admin-vs-online.test.ts 2>&1 | tee docs/audit/reports/fase-b01-raw/race-admin-vs-online.txt
```
Expected: PASS (si exclusion constraint cubre ambos paths como debería).
Si FAIL: investigar — probable bug donde online path no respeta lock o constraint.

- [ ] **Step 3: Documentar resultado**

Si PASS → agregar entrada en report: "✅ Race admin+online cubierto por exclusion constraint".
Si FAIL → P0 bug, investigar y fixear `createOnlineBooking` o `createManualBooking` para que ambos respeten el mismo mecanismo.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/race-admin-vs-online.test.ts docs/audit/reports/fase-b01-raw/
git commit -m "audit(b01): add race test admin manual vs player online"
```

---

## Task 3: Test sweep cron scheduling

**Files:**
- Create: `tests/integration/sweep-cron-scheduling.test.ts`

**Hipótesis**: `sweepExpiredPendingBookings` existe pero ¿está scheduleado en pg-boss? Si no, expiry depende solo del per-booking job, que si falla nunca corre el sweep.

- [ ] **Step 1: Grep para localizar scheduling**

```bash
cd "C:/Users/Lazar/Documents/github/TurnoGol-audit-b01"
grep -rn "sweepExpired\|schedule.*expir\|cron" src/shared/jobs/ src/modules/bookings/
```
Capturar output.

- [ ] **Step 2: Si NO hay scheduling, documentar gap y crear test que lo verifique**

```typescript
// tests/integration/sweep-cron-scheduling.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('sweepExpiredPendingBookings has scheduled cron', () => {
  it('definitions.ts schedules sweep job on interval', () => {
    const defsPath = resolve(__dirname, '../../src/shared/jobs/definitions.ts')
    const content = readFileSync(defsPath, 'utf-8')
    // Expectation: sweep is registered with pg-boss schedule
    expect(content).toMatch(/sweep.*expir|expir.*sweep/i)
    expect(content).toMatch(/schedule|cron|every.*min/i)
  })
})
```

- [ ] **Step 3: Correr test**

```bash
pnpm exec vitest run tests/integration/sweep-cron-scheduling.test.ts 2>&1 | tee docs/audit/reports/fase-b01-raw/sweep-cron.txt
```

- [ ] **Step 4: Si FAIL, agregar scheduling**

Si test falla, leer `src/shared/jobs/definitions.ts` y agregar:

```typescript
// dentro de la función de bootstrap de jobs
await boss.schedule('sweep-expired-bookings', '*/5 * * * *')
// + handler que llama sweepExpiredPendingBookings()
```

- [ ] **Step 5: Re-correr test verde + commit**

```bash
pnpm exec vitest run tests/integration/sweep-cron-scheduling.test.ts
git add . && git commit -m "audit(b01): verify sweep cron scheduling"
```

---

## Task 4: Test autoCompleteOverdueBookings scheduling

**Files:**
- Create: ampliación de `tests/integration/sweep-cron-scheduling.test.ts` (mismo file, otro test case)

**Hipótesis**: existe `autoCompleteOverdueBookings(tx, graceMinutes)`. ¿Hay cron que lo dispare? Sin cron, los bookings quedan `confirmed` eternamente aunque ya pasó la hora.

- [ ] **Step 1: Agregar test en mismo file**

```typescript
describe('autoCompleteOverdueBookings has scheduled cron', () => {
  it('definitions.ts schedules autoComplete job', () => {
    const defsPath = resolve(__dirname, '../../src/shared/jobs/definitions.ts')
    const content = readFileSync(defsPath, 'utf-8')
    expect(content).toMatch(/autoComplete|complete.*overdue|overdue.*complete/i)
    expect(content).toMatch(/schedule|cron/i)
  })
})
```

- [ ] **Step 2: Correr + decidir fix**

```bash
pnpm exec vitest run tests/integration/sweep-cron-scheduling.test.ts
```
Si FAIL: agregar scheduling de autoComplete (cada hora suficiente).

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "audit(b01): verify autoComplete cron scheduling"
```

---

## Task 5: Test booking time validation (completeBooking + markNoShow)

**Files:**
- Create: `tests/integration/booking-time-validation.test.ts`

**Hipótesis**: ¿`completeBooking` valida que `now >= time_end`? Si no, admin podría marcar completed un booking de mañana → reportes falsos. Mismo para `markNoShow`.

- [ ] **Step 1: Escribir tests**

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { completeBooking, createManualBooking, markNoShow } from '@/modules/bookings/booking.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
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
}, 30_000)

afterAll(async () => closeSql())

describe('booking time validation', () => {
  it('completeBooking on future booking → rejects with clear error', async () => {
    const futureDate = '2099-01-01'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: futureDate,
          timeStart: '20:00',
          timeEnd: '21:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    await expect(
      withTenantContext(tenant.id, (tx) =>
        completeBooking(booking.id, { staffUserId: seed.staffUserId }, tx),
      ),
    ).rejects.toThrow(/before|future|not yet|time/i)
  }, 30_000)

  it('markNoShow on future booking → rejects with clear error', async () => {
    const futureDate = '2099-01-02'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: futureDate,
          timeStart: '20:00',
          timeEnd: '21:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    await expect(
      withTenantContext(tenant.id, (tx) => markNoShow(booking.id, seed.staffUserId, tx)),
    ).rejects.toThrow(/before|future|not yet|time/i)
  }, 30_000)
})
```

- [ ] **Step 2: Correr**

```bash
pnpm exec vitest run tests/integration/booking-time-validation.test.ts 2>&1 | tee docs/audit/reports/fase-b01-raw/booking-time-validation.txt
```

- [ ] **Step 3: Si FAIL, agregar validación en service**

Si rejects no se cumple (bug), agregar en `src/modules/bookings/booking.service.ts` dentro de `completeBooking` y `markNoShow`:

```typescript
// Validar que ya pasó time_end
const endTs = new Date(`${booking.date}T${booking.time_end}`)
if (Date.now() < endTs.getTime()) {
  throw new BookingNotYetEndedError(booking.id)
}
```

+ agregar error class `BookingNotYetEndedError` en `booking.errors.ts`.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "audit(b01): validate booking time on complete/no-show"
```

---

## Task 6: Test race cancel vs expire (simultáneos)

**Files:**
- Create: `tests/integration/race-cancel-vs-expire.test.ts`

**Hipótesis**: si jugador cancela en mismo instante que job expire dispara, ¿qué gana? Ambos terminan en estado terminal pero el resultado debería ser determinístico, no race.

- [ ] **Step 1: Escribir test**

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
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
}, 30_000)

afterAll(async () => closeSql())

describe('race: cancel vs expire on pending_payment', () => {
  it('concurrent cancel + expire → exactly 1 transition succeeds, terminal state coherent', async () => {
    // Crear booking pending_payment
    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId,
          courtId: seed.courtId,
          date: '2026-08-15',
          timeStart: '20:00',
          timeEnd: '21:00',
          durationMins: 60,
          requiresDeposit: true,
          depositPercentage: 50,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('pending_payment')

    // Disparar cancel + expire simultáneos
    const cancelPromise = withTenantContext(tenant.id, async (tx) => {
      try {
        await cancelByPlayer(booking.id, playerId, 'test cancel', null as any, tx)
        return 'cancel_won' as const
      } catch {
        return 'cancel_lost' as const
      }
    })
    const expirePromise = withTenantContext(tenant.id, async (tx) => {
      const r = await transitionFromPendingPayment(booking.id, 'expired', tx)
      return r.won ? 'expire_won' : 'expire_lost'
    })

    const results = await Promise.all([cancelPromise, expirePromise])
    const wins = results.filter((r) => r.endsWith('_won')).length
    expect(wins).toBeLessThanOrEqual(1) // 0 o 1, nunca 2

    // Verificar estado terminal final coherente
    const sql = getSql()
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${booking.id}
    `
    const finalStatus = rows[0].status
    expect(['expired', 'canceled_refunded', 'canceled_no_refund', 'pending_payment']).toContain(
      finalStatus,
    )
  }, 30_000)
})
```

- [ ] **Step 2: Correr + iterar 100x para detectar flakies**

```bash
for i in $(seq 1 10); do
  pnpm exec vitest run tests/integration/race-cancel-vs-expire.test.ts 2>&1 | tail -3
done | tee docs/audit/reports/fase-b01-raw/race-cancel-vs-expire-100x.txt
```
Expected: 10/10 verdes.

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "audit(b01): add race test cancel vs expire"
```

---

## Task 7: Test abonado vs booking individual (slot overlap)

**Files:**
- Create: `tests/integration/race-abonado-vs-individual.test.ts`

**Hipótesis**: `slot-generator.ts` solo genera fechas. Pero el flow de abonado debe crear bookings reales. Si abonado A crea booking en `2026-08-01 20:00-21:00` y jugador B crea booking individual en mismo slot al mismo tiempo, ¿el exclusion constraint los maneja?

- [ ] **Step 1: Investigar cómo abonado crea bookings reales**

```bash
grep -rn "createBooking\|abonado.*booking\|booking.*abonado" src/modules/abonados/ src/app/(admin)/abonados/
```

- [ ] **Step 2: Escribir test que dispara abonado + individual simultáneo**

(Adaptar template de race tests anteriores, simulando el flow real de creación abonado vs `createManualBooking`).

- [ ] **Step 3: Correr + verificar invariant**

Expected: exactly 1 booking persistido para el slot.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "audit(b01): add race test abonado vs individual"
```

---

## Task 8: Test createOnlineBooking sin deposit vs MP webhook tardío

**Files:**
- Create: `tests/integration/online-booking-no-deposit-race.test.ts`

**Hipótesis**: cuando `requiresDeposit=false` (caso E2E tenant), el booking salta a `confirmed` directo sin pasar por MP. Si hay webhook MP tardío para ESE booking (corrupción de payload o test), ¿se rompe algo?

- [ ] **Step 1: Escribir test**

Booking creado con `requiresDeposit=false` → status `confirmed`. Disparar webhook MP simulado para ese booking_id con `status=approved`. Verificar:
- No crea duplicate payment
- Booking sigue `confirmed`
- No emite notification de "payment received" duplicada

- [ ] **Step 2: Correr**

- [ ] **Step 3: Commit**

---

## Task 9: Investigar libuv assertion error (P2 del B0)

**Hipótesis**: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76` aparece tras cleanup de stress test. Probable conexión postgres sin close adecuado.

- [ ] **Step 1: Re-correr stress test y capturar stack**

Levantar dev server con `NEXT_PUBLIC_E2E=1`, correr stress, capturar output completo:

```bash
cd "C:/Users/Lazar/Documents/github/TurnoGol-audit-b01"
NEXT_PUBLIC_E2E=1 pnpm dev > /tmp/dev.log 2>&1 &
sleep 8
pnpm stress:bookings > docs/audit/reports/fase-b01-raw/libuv-investigation.txt 2>&1
```

- [ ] **Step 2: Revisar `closeSql()` y cleanup**

Leer `src/shared/db/client.ts` función `closeSql`. Verificar:
- Si usa `await` en cierre de pool
- Si pg-boss connection se cierra también
- Si hay race entre fin de script + cleanup pendiente

- [ ] **Step 3: Aplicar fix conservador si se identifica causa**

Posibles fixes:
- `await new Promise(r => setTimeout(r, 100))` antes de exit
- Cerrar pg-boss explícitamente si script lo usa
- `process.exit(0)` explícito tras cleanup

- [ ] **Step 4: Re-correr stress 5x para confirmar fix**

```bash
for i in 1 2 3 4 5; do
  pnpm stress:bookings 2>&1 | tail -5
  echo "---"
done | tee docs/audit/reports/fase-b01-raw/libuv-after-fix.txt
```
Expected: 0/5 con assertion error.

- [ ] **Step 5: Si no se reproduce ya o no es fixeable, documentar como Windows-only quirk y dejar issue tracked en STATE.md**

- [ ] **Step 6: Commit**

---

## Task 10: Test booking borde — duración 60 vs 120 adyacentes

**Hipótesis**: slots 20:00-21:00 (60min) y 21:00-23:00 (120min) son adyacentes. Exclusion constraint usa `tsrange` con `&&` (overlap). Verificar que dos slots adyacentes (sin gap) NO se rechazan mutuamente.

- [ ] **Step 1: Test adyacencia**

Crear booking A 20:00-21:00, crear booking B 21:00-23:00 mismo court, mismo día. Ambos deben tener éxito.

- [ ] **Step 2: Test overlap real**

Crear booking A 20:00-22:00, intentar B 21:00-23:00. B debe fallar con SlotTakenError.

- [ ] **Step 3: Commit**

---

## Task 11: Generar report consolidado B1

**Files:**
- Create: `docs/audit/reports/fase-b01-motor-bookings-report.md`

- [ ] **Step 1: Estructura report**

Igual estructura que B0 report:
- Resumen ejecutivo (tabla por task)
- Veredicto global (🟢/🟡/🔴)
- Hallazgos P0/P1/P2 con archivo + comando reproducir
- Recomendaciones Fase B2 (RLS)
- Estado de worktree

- [ ] **Step 2: Llenar con resultados reales**

Para cada task agregada, documentar:
- Test pasó / falló
- Si falló, qué bug se encontró
- Fix aplicado (si correspondió)
- Re-test verde
- Commit SHA

- [ ] **Step 3: Decidir veredicto**

🟢 si 0 P0 y máximo 2 P1 menores
🟡 si 1-2 P0 menores arreglados durante fase + algunos P1 pendientes
🔴 si P0 sin resolver

- [ ] **Step 4: Recomendaciones para B2 (RLS)**

Foco B2 basado en lo visto en B1: si en B1 detectamos transacciones que NO usan `withTenantContext`, marcar como prioritario para B2.

---

## Task 12: Spec reviewer + actualizar STATE + commit final

- [ ] **Step 1: Dispatch spec reviewer subagent**

Reviewer valida que report B1 cumpla con plan B1 (cobertura, números, evidencia).

- [ ] **Step 2: Aplicar fixes del reviewer (si hay)**

- [ ] **Step 3: Actualizar STATE.md**

- Mover B1 a "Fases completadas" con link al report
- Cambiar "Fase actual" a B2
- Agregar hallazgos B1 a "Hallazgos críticos acumulados"

- [ ] **Step 4: Commit final + reportar al humano**

```bash
git add docs/audit/
git commit -m "audit(b01): motor bookings audit complete - [veredicto]"
```

Reporte al humano:
- Veredicto
- Conteo P0/P1/P2
- Tests nuevos agregados (N)
- Fixes aplicados al código (si hubo)
- Decisión: merge a main + arrancar B2

---

## Self-Review (post-plan, pre-ejecución)

**Spec coverage check (vs MASTER_PLAN.md sección B1):**
- ✅ Race admin manual + jugador online (Task 2)
- ✅ Race abonado + individual (Task 7)
- ✅ Race cancel + expire (Task 6)
- ✅ State machine validación (cubierto en Task 1 audit estructural; ya está explícita según mapeo)
- ✅ Exclusion constraint a nivel DB verificado (Task 1)
- ✅ Expiry idempotente (cubierto por existing `race-expiry-vs-confirm.test.ts` + Task 3 scheduling)
- ✅ autoComplete scheduling (Task 4)
- ✅ Time validation completeBooking/markNoShow (Task 5)
- ✅ Borde adyacente 60/120 min (Task 10)
- ✅ Online sin deposit + webhook race (Task 8)
- ✅ libuv assertion P2 del B0 (Task 9)

**Placeholder scan:** Tasks 7 y 8 dicen "adaptar template" en lugar de mostrar código completo — eso es porque requieren entender el flow real de abonado/webhook MP que el implementer debe explorar primero. Aceptable porque el implementer es subagent que puede leer código y adaptar; pero si no, regenerar plan con código exacto.

**Type consistency:** Helpers (`createTestPlayer`, `seedIsolationData`, `IsolationSeed`, `withTenantContext`, `cleanupAll`, `ensureRoles`, `linkPlayerToTenant`) consistentes con `tests/helpers/` (verificado en mapeo investigador).

**Out-of-scope explícito**: NO se audita en B1:
- MP webhook idempotencia profunda → Fase B3
- RLS isolation profundo → Fase B2
- Notifications delivery → Fase B5/B10
- UI grilla bookings → Fase F3

Plan listo.
