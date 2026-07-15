import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'
import { insertBooking } from '../helpers/factories'

// Registro mp_payment_id -> resultado que devolverá el stub de getPaymentStatus.
// El handler usa external_reference para resolver la reserva, así que cada
// pago puede apuntar a una reserva distinta. Reemplaza al viejo __BOOKING_ID__
// (un único global) para poder testear pagos/eventos múltiples en el archivo.
type MpEntry = {
  externalReference: string
  amount: number
  status: 'approved' | 'rejected' | 'in_process' | 'refunded'
}

// Stub del SDK de MP: getPaymentStatus lee el registro global por mp_payment_id.
// Se evalúa en cada llamada (no al definir el mock), así beforeAll/los tests
// pueden poblar el registro antes de invocar el handler.
vi.mock('@/modules/payments/mp-gateway.implementation', () => ({
  MercadoPagoGateway: class {
    constructor(_: string) {}
    async getPaymentStatus(id: string) {
      const registry = (globalThis as Record<string, unknown>).__MP_REGISTRY__ as
        | Map<string, MpEntry>
        | undefined
      const entry = registry?.get(id)
      return {
        mpPaymentId: id,
        status: (entry?.status ?? 'approved') as MpEntry['status'],
        amount: entry?.amount ?? 100000,
        externalReference: entry?.externalReference ?? '',
        paymentMethodId: 'account_money',
      }
    }
  },
}))

import { handleMpWebhookJob } from '@/modules/payments/mp-webhook.handler'

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string
let bookingId: string
let mpRegistry: Map<string, MpEntry>

const DEPOSIT = 100000

function paymentJob(mpEventId: string, mpPaymentId: string) {
  return {
    tenantId: tenant.id,
    mpEventId,
    eventType: 'payment',
    mpPaymentId,
    rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
  }
}

function rejectionReasons(results: PromiseSettledResult<unknown>[]): string[] {
  return results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
  bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: player.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    depositAmount: DEPOSIT,
  })
  await sql`
    UPDATE tenants
    SET mp_access_token = ${'enc:fake'}
    WHERE id = ${tenant.id}
  `
  mpRegistry = new Map<string, MpEntry>()
  ;(globalThis as Record<string, unknown>).__MP_REGISTRY__ = mpRegistry
  // Pago del storm test → confirma la reserva compartida.
  mpRegistry.set('999000111', {
    externalReference: bookingId,
    amount: DEPOSIT,
    status: 'approved',
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('race: webhook storm (mismo evento entregado N veces)', () => {
  it('8 entregas idénticas del MISMO evento → 1 confirmación, 1 pago, 1 evento, 1 cashflow de seña (ENS-21) y NINGÚN job lanza error', async () => {
    const M = 8
    const jobs = Array.from({ length: M }, () => paymentJob('evt-race-1', '999000111'))

    const results = await Promise.allSettled(jobs.map((j) => handleMpWebhookJob(j)))

    // FUERZA: ningún job rechaza. `rejected <= M` era una tautología (jamás falla:
    // no puede haber más rechazos que jobs). Si una regresión hiciera explotar las
    // entregas concurrentes (deadlock, unique-violation sin tragar), esto lo caza
    // y muestra el mensaje exacto en el diff.
    expect(rejectionReasons(results)).toEqual([])

    const sql = getSql()
    const bk = await sql<{ status: string; deposit_status: string }[]>`
      SELECT status, deposit_status FROM bookings WHERE id = ${bookingId}
    `
    // La reserva quedó confirmada Y la seña marcada paga (doc7 Flujo 2 PASO 5).
    expect(bk[0].status).toBe('confirmed')
    expect(bk[0].deposit_status).toBe('paid')

    // Exactamente 1 fila de pago, en estado approved (no solo "existe": approved).
    const pays = await sql<{ c: number; approved: number }[]>`
      SELECT COUNT(*)::int AS c,
             COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
      FROM payments WHERE mp_payment_id = '999000111'
    `
    expect(pays[0].c).toBe(1)
    expect(pays[0].approved).toBe(1)

    // ENS-21 (supersede Fix #9): la seña MP confirmada SÍ crea su cash_flow
    // income/booking/mercadopago — la caja del día tiene que ver TODA la plata.
    // La invariante de carrera ahora es "exactamente 1": recordDepositCashFlow
    // corre solo en la rama won de handleApproved, y won gana UNA sola vez
    // (UPDATE ... WHERE status='pending_payment'), así que el storm no puede
    // duplicar el movimiento de caja.
    const cfs = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM cash_flows WHERE booking_id = ${bookingId}
    `
    expect(cfs[0].c).toBe(1)

    // Idempotencia a nivel evento: una sola fila en processed_webhooks.
    const evt = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks WHERE mp_event_id = 'evt-race-1'
    `
    expect(evt[0].c).toBe(1)
  }, 30_000)
})

// El storm de arriba comparte mp_event_id, así que solo UN job supera lockMpEvent;
// los otros 7 cortan antes de transitionFromPendingPayment. La carrera real de
// "doble pago" exige eventos DISTINTOS que superen el lock y compitan sobre la
// UPDATE condicional (WHERE status='pending_payment'). Eso es lo que sigue.
describe('race: dos eventos DISTINTOS sobre la misma reserva (la UPDATE condicional decide)', () => {
  it('dos eventos del MISMO pago aprobado, concurrentes → confirma una vez y deduplica en 1 sola fila de pago', async () => {
    const sql = getSql()
    // Reserva fresca: la compartida ya quedó confirmed por el storm test.
    const bk = await insertBooking(sql, {
      tenantId: tenant.id,
      courtId: seed.courtId,
      playerId,
      timeStart: '08:00',
      timeEnd: '09:00',
      status: 'pending_payment',
      depositStatus: 'pending',
      depositAmount: DEPOSIT,
    })
    // Un único pago real (mismo mp_payment_id) anunciado por dos eventos distintos:
    // MP emite varios eventos por el mismo pago (pending → approved). El UPSERT por
    // mp_payment_id debe colapsarlos en UNA fila.
    mpRegistry.set('pay-same-1', {
      externalReference: bk,
      amount: DEPOSIT,
      status: 'approved',
    })

    const results = await Promise.allSettled([
      handleMpWebhookJob(paymentJob('evt-same-a', 'pay-same-1')),
      handleMpWebhookJob(paymentJob('evt-same-b', 'pay-same-1')),
    ])
    expect(rejectionReasons(results)).toEqual([])

    const row = await sql<{ status: string; deposit_status: string }[]>`
      SELECT status, deposit_status FROM bookings WHERE id = ${bk}
    `
    expect(row[0].status).toBe('confirmed')
    expect(row[0].deposit_status).toBe('paid')

    // UPSERT por mp_payment_id: ambos eventos refieren al mismo pago → 1 fila.
    const pays = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM payments WHERE booking_id = ${bk}
    `
    expect(pays[0].c).toBe(1)

    // Ambos eventos quedaron registrados como procesados (lock por evento).
    const evts = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM processed_webhooks
      WHERE mp_event_id IN ('evt-same-a', 'evt-same-b')
    `
    expect(evts[0].c).toBe(2)

    // ENS-21: exactamente 1 cash_flow de la seña — solo el evento que ganó la
    // transición lo crea (ver comentario en el primer test del archivo).
    const cfs = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM cash_flows WHERE booking_id = ${bk}
    `
    expect(cfs[0].c).toBe(1)
  }, 30_000)

  it('dos pagos DISTINTOS aprobados sobre la misma reserva, concurrentes → confirma una sola vez y registra ambos pagos', async () => {
    const sql = getSql()
    const bk = await insertBooking(sql, {
      tenantId: tenant.id,
      courtId: seed.courtId,
      playerId,
      timeStart: '09:00',
      timeEnd: '10:00',
      status: 'pending_payment',
      depositStatus: 'pending',
      depositAmount: DEPOSIT,
    })
    // Dos pagos reales distintos (el jugador pagó dos veces): cada uno genera su
    // fila de pago, pero la reserva debe transicionar pending_payment → confirmed
    // UNA sola vez. La UPDATE condicional es lo único que evita la doble
    // confirmación: si alguien le sacara el WHERE status='pending_payment',
    // ambos "ganarían".
    mpRegistry.set('pay-dist-1', { externalReference: bk, amount: DEPOSIT, status: 'approved' })
    mpRegistry.set('pay-dist-2', { externalReference: bk, amount: DEPOSIT, status: 'approved' })

    const results = await Promise.allSettled([
      handleMpWebhookJob(paymentJob('evt-dist-a', 'pay-dist-1')),
      handleMpWebhookJob(paymentJob('evt-dist-b', 'pay-dist-2')),
    ])
    expect(rejectionReasons(results)).toEqual([])

    const row = await sql<{ status: string; deposit_status: string }[]>`
      SELECT status, deposit_status FROM bookings WHERE id = ${bk}
    `
    expect(row[0].status).toBe('confirmed')
    expect(row[0].deposit_status).toBe('paid')

    // Ambos pagos quedan en el trail de auditoría, cada uno approved.
    const pays = await sql<{ mp_payment_id: string; status: string }[]>`
      SELECT mp_payment_id, status FROM payments
      WHERE booking_id = ${bk}
      ORDER BY mp_payment_id
    `
    expect(pays.map((p) => p.mp_payment_id)).toEqual(['pay-dist-1', 'pay-dist-2'])
    expect(pays.map((p) => p.status)).toEqual(['approved', 'approved'])

    // Sigue siendo UNA sola reserva activa sobre ese court/slot (no se duplicó).
    const active = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM bookings
      WHERE court_id = ${seed.courtId}
        AND time_start = '09:00'::time
        AND status IN ('pending_payment', 'confirmed')
    `
    expect(active[0].c).toBe(1)

    // ENS-21: aunque el jugador pagó DOS veces (dos payments approved), la caja
    // registra UNA sola seña — el cash_flow nace en la rama won, y la UPDATE
    // condicional garantiza un único ganador.
    const cfs = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM cash_flows WHERE booking_id = ${bk}
    `
    expect(cfs[0].c).toBe(1)
  }, 30_000)
})
