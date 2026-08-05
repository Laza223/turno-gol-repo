import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * Decisión del dueño (2026-08-05): un reembolso hecho a mano desde el panel de
 * Mercado Pago reconcilia `bookings.deposit_status` a 'refunded' y avisa SOLO
 * al admin. Al jugador NO — el complejo hizo ese reembolso por afuera y puede
 * tener una conversación en curso con él.
 *
 * Estos casos van contra DB REAL a propósito: la garantía central del cambio
 * —que el filtro por estado del UPDATE evita que el trigger
 * `enforce_booking_invariants_fn` (migr. 070) vuele la transacción entera del
 * webhook— no existe en un mock de `tx.execute`.
 */

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  stopBoss: vi.fn(async () => {}),
}))

const mockGateway = new MockGateway()

vi.mock('@/modules/payments/mp-gateway.implementation', () => {
  return {
    MercadoPagoGateway: class {
      constructor(_encryptedAccessToken: string) {}
      createPreference = (...args: Parameters<MockGateway['createPreference']>) =>
        mockGateway.createPreference(...args)
      getPaymentStatus = (...args: Parameters<MockGateway['getPaymentStatus']>) =>
        mockGateway.getPaymentStatus(...args)
      createRefund = (...args: Parameters<MockGateway['createRefund']>) =>
        mockGateway.createRefund(...args)
    },
  }
})

import { handleMpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

const FUTURE_DATE = '2027-07-01'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Refund'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function setTenantMpToken(tenantId: string): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE tenants SET mp_access_token = ${'dummy-encrypted-token'} WHERE id = ${tenantId}
  `
}

/**
 * Inserta el booking YA en el estado deseado. No se llega por UPDATE a
 * propósito: el trigger de la 070 bloquea cualquier UPDATE sobre un booking
 * terminal, así que un `no_show` hay que nacerlo.
 */
async function insertBookingWithState(opts: {
  tenantId: string
  courtId: string
  playerId: string
  timeStart: string
  timeEnd: string
  status: string
  depositStatus: string
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      (${FUTURE_DATE}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + ${opts.timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${800000}, ${240000},
      ${opts.depositStatus}::deposit_status, NULL, ${opts.status}::booking_status
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function getBooking(bookingId: string): Promise<{ status: string; deposit_status: string }> {
  const sql = getSql()
  const rows = await sql<Array<{ status: string; deposit_status: string }>>`
    SELECT status, deposit_status FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!
}

async function externalRefundAudits(bookingId: string) {
  const sql = getSql()
  const rows = await sql<Array<{ metadata: Record<string, unknown> | string | null }>>`
    SELECT metadata
    FROM audit_logs
    WHERE resource_id = ${bookingId}
      AND action = 'payment.external_refund_detected'
    ORDER BY created_at
  `
  return rows.map((r) =>
    typeof r.metadata === 'string'
      ? (JSON.parse(r.metadata) as Record<string, unknown>)
      : ((r.metadata ?? {}) as Record<string, unknown>),
  )
}

async function refundNotifications(bookingId: string) {
  const sql = getSql()
  return sql<Array<{ recipient_type: string; recipient_id: string }>>`
    SELECT recipient_type, recipient_id
    FROM notifications
    WHERE template_name = 'admin_external_refund_detected'
      AND content::text LIKE ${'%' + bookingId + '%'}
  `
}

async function fireExternalRefund(tenantId: string, bookingId: string, suffix: string): Promise<void> {
  const mpPaymentId = `mp-extref-${suffix}`
  const mpEventId = `mp-evt-extref-${suffix}`
  mockGateway.statusByPaymentId[mpPaymentId] = {
    mpPaymentId,
    status: 'refunded',
    amount: 240_000,
    externalReference: bookingId,
    paymentMethodId: 'account_money',
  }
  await handleMpWebhookJob({
    tenantId,
    mpEventId,
    eventType: 'payment',
    mpPaymentId,
    rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
  })
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('refund externo de MP — reconciliación (decisión 2026-08-05)', () => {
  it('turno confirmado con seña paga: deposit_status pasa a refunded y el status NO cambia', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id, 'admin')
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertBookingWithState({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '10:00',
      timeEnd: '11:00',
      status: 'confirmed',
      depositStatus: 'paid',
    })

    await fireExternalRefund(tenant.id, bookingId, bookingId.slice(0, 8))

    const booking = await getBooking(bookingId)
    expect(booking.deposit_status).toBe('refunded')
    // Liberar el horario es decisión del complejo, no del webhook.
    expect(booking.status).toBe('confirmed')

    const audits = await externalRefundAudits(bookingId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!['reconciled']).toBe(true)
  })

  it('🔴 turno en estado terminal (no_show + seña capturada): no explota y NO pisa la seña', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id, 'admin')
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertBookingWithState({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '12:00',
      timeEnd: '13:00',
      status: 'no_show',
      depositStatus: 'captured',
    })

    // Sin el filtro por estado en el UPDATE, esto tira "Booking en estado
    // terminal (no_show) no puede modificarse" y el job termina en la DLQ.
    await expect(
      fireExternalRefund(tenant.id, bookingId, bookingId.slice(0, 8)),
    ).resolves.toBeUndefined()

    // La seña capturada de un no-show no se auto-reembolsa: se avisa y la mira
    // el dueño (mismo criterio que RI #1 de la auditoría D4).
    const booking = await getBooking(bookingId)
    expect(booking.deposit_status).toBe('captured')
    expect(booking.status).toBe('no_show')

    const audits = await externalRefundAudits(bookingId)
    expect(audits[0]!['reconciled']).toBe(false)
    expect(audits[0]!['bookingStatus']).toBe('no_show')
  })

  it('avisa SOLO al admin: ni al manager del complejo ni al jugador', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
    const admin = await createTestStaffUser(sql)
    const manager = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertBookingWithState({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '14:00',
      timeEnd: '15:00',
      status: 'confirmed',
      depositStatus: 'paid',
    })

    await fireExternalRefund(tenant.id, bookingId, bookingId.slice(0, 8))

    const notifs = await refundNotifications(bookingId)
    expect(notifs).toHaveLength(1)
    expect(notifs[0]!.recipient_id).toBe(admin.id)
    expect(notifs.some((n) => n.recipient_id === manager.id)).toBe(false)
    expect(notifs.some((n) => n.recipient_type === 'player')).toBe(false)
  })

  it('un segundo evento MP del mismo refund no revierte nada', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id, 'admin')
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertBookingWithState({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '16:00',
      timeEnd: '17:00',
      status: 'confirmed',
      depositStatus: 'paid',
    })

    const base = bookingId.slice(0, 8)
    await fireExternalRefund(tenant.id, bookingId, `${base}-a`)
    // Evento MP DISTINTO (otro mpEventId) reportando el mismo refund: el lock
    // de idempotencia no lo filtra, tiene que frenarlo el WHERE del UPDATE.
    await fireExternalRefund(tenant.id, bookingId, `${base}-b`)

    const booking = await getBooking(bookingId)
    expect(booking.deposit_status).toBe('refunded')
    expect(booking.status).toBe('confirmed')

    const audits = await externalRefundAudits(bookingId)
    expect(audits).toHaveLength(2)
    // El segundo ya no reconcilia: la seña estaba en 'refunded'.
    expect(audits[1]!['reconciled']).toBe(false)
  })
})
