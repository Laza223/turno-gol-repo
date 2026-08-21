import { randomUUID } from 'crypto'
import type { Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'
import {
  runAccountingReconciliation,
  type DriftFinding,
  type DriftInvariant,
} from '@/modules/payments/reconciliation.service'
import { runReconciliationSweep } from '@/shared/jobs/workers/reconcile-accounting-drift.worker'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

// Ambos apuntan a la misma DB local (getWorkerSql() cae a DATABASE_URL cuando
// WORKER_DATABASE_URL no está seteado — client.ts): acá se usa getSql() tanto
// para el seed como para ejecutar runAccountingReconciliation/
// runReconciliationSweep, igual que ya hacen otros tests de integración con
// ensureRoles (el rol de test conecta como superusuario local, BYPASSRLS de
// hecho, así que se comporta igual que el pool worker real en prod).

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

const FUTURE_DATE = '2027-08-20'

async function createTestCourt(sql: Sql, tenantId: string): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Reconciliación'}, 10, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return id
}

type BookingOverrides = {
  depositAmount?: number
  depositStatus?: string
  paymentMethod?: string | null
  paymentId?: string | null
  status?: string
}

/**
 * Booking crudo con `created_at`/`updated_at` 20 minutos en el pasado —
 * fuera del margen de 15 minutos que todas las queries de
 * reconciliation.service.ts aplican para no leer una tx todavía en vuelo.
 */
async function createTestBooking(
  sql: Sql,
  tenantId: string,
  courtId: string,
  playerId: string,
  overrides: BookingOverrides = {},
): Promise<string> {
  const depositAmount = overrides.depositAmount ?? 240000
  const depositStatus = overrides.depositStatus ?? 'paid'
  const paymentMethod = overrides.paymentMethod ?? null
  const paymentId = overrides.paymentId ?? null
  const status = overrides.status ?? 'confirmed'

  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, payment_id, status,
      created_at, updated_at
    )
    VALUES (
      ${tenantId}, ${courtId}, ${playerId},
      ${FUTURE_DATE}::date, '20:00'::time, '21:00'::time,
      (${FUTURE_DATE}::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      800000, ${depositAmount}, ${depositStatus}, ${paymentMethod}, ${paymentId}, ${status},
      NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '20 minutes'
    )
    RETURNING id
  `
  return id
}

type PaymentOverrides = {
  amount?: number
  type?: string
  status?: string
  method?: string
  /** 'Refund of <id de la seña>' — cómo `prepareRefund` ata un reembolso a su original. */
  description?: string
}

async function createTestPayment(
  sql: Sql,
  tenantId: string,
  bookingId: string | null,
  playerId: string,
  overrides: PaymentOverrides = {},
): Promise<string> {
  const amount = overrides.amount ?? 240000
  const type = overrides.type ?? 'deposit'
  const status = overrides.status ?? 'approved'
  const method = overrides.method ?? 'mercadopago'
  const mpPaymentId = `mp-${randomUUID()}`
  const description = overrides.description ?? null

  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO payments (
      tenant_id, booking_id, player_id, amount, type, method, status, mp_payment_id, description,
      created_at
    )
    VALUES (
      ${tenantId}, ${bookingId}, ${playerId}, ${amount}, ${type}, ${method}, ${status}, ${mpPaymentId},
      ${description}, NOW() - INTERVAL '20 minutes'
    )
    RETURNING id
  `
  return id
}

async function createTestCashFlow(
  sql: Sql,
  tenantId: string,
  bookingId: string,
  staffId: string,
  overrides: { amount?: number; description?: string } = {},
): Promise<string> {
  const amount = overrides.amount ?? 240000
  const description = overrides.description ?? depositCashFlowDescription(bookingId)

  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO cash_flows (
      tenant_id, type, category, amount, method, description, booking_id, registered_by,
      occurred_at, created_at
    )
    VALUES (
      ${tenantId}, 'income', 'booking', ${amount}, 'mercadopago', ${description}, ${bookingId},
      ${staffId}, NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '20 minutes'
    )
    RETURNING id
  `
  return id
}

/** Filas de un `invariant` puntual dentro del array agregado. */
function idsFor(findings: DriftFinding[], invariant: DriftInvariant): string[] {
  return findings.filter((f) => f.invariant === invariant).map((f) => f.resourceId)
}

async function auditLogCountFor(sql: Sql, action: string, resourceId: string): Promise<number> {
  const [row] = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c FROM audit_logs
    WHERE action = ${action} AND resource_id = ${resourceId}
  `
  return row.c
}

type Fixture = { tenantId: string; courtId: string; playerId: string; staffId: string }

async function setupFixture(sql: Sql): Promise<Fixture> {
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const staff = await createTestStaffUser(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  const courtId = await createTestCourt(sql, tenant.id)
  return { tenantId: tenant.id, courtId, playerId: player.id, staffId: staff.id }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => closeSql())

describe('reconciliation-drift: INV1 payment sin cashflow', () => {
  it('payment approved deposit MP sin cash_flow reflejo → finding + audit_log', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId)
    const paymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId)
    // Sin insertar cash_flows a propósito.

    const total = await runReconciliationSweep()
    expect(total).toBeGreaterThan(0)

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv1_payment_without_cashflow')).toContain(paymentId)

    const auditCount = await auditLogCountFor(
      sql,
      'reconciliation.drift_inv1_payment_without_cashflow',
      paymentId,
    )
    expect(auditCount).toBeGreaterThan(0)
  }, 30_000)

  it('control negativo: payment + cash_flow reflejo correcto → sin finding', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId)
    const paymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId)
    await createTestCashFlow(sql, fx.tenantId, bookingId, fx.staffId)

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv1_payment_without_cashflow')).not.toContain(paymentId)
  }, 30_000)
})

/**
 * La forma del pago tardío, que es la que destapó estas dos exclusiones: la
 * plata entra DESPUÉS de que la reserva venció, el sistema la devuelve sola
 * (#183) y no puede tocar ni la seña original ni el booking, porque el trigger
 * `enforce_booking_invariants` prohíbe modificar una reserva terminal. Sin las
 * exclusiones, cada devolución correcta dejaba dos alarmas encendidas para
 * siempre — y un monitor que suena todos los días deja de mirarse.
 */
async function seedPagoTardioReembolsado(
  sql: Sql,
  fx: Fixture,
  opts: { montoReembolso?: number; estadoBooking?: string } = {},
): Promise<{ bookingId: string; depositId: string; refundId: string }> {
  const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
    status: opts.estadoBooking ?? 'expired',
    depositStatus: 'pending',
  })
  const depositId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
    amount: 240000,
  })
  const refundId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
    amount: opts.montoReembolso ?? 240000,
    type: 'refund',
    status: 'approved',
    description: `Refund of ${depositId}`,
  })
  return { bookingId, depositId, refundId }
}

describe('reconciliation-drift: un reembolso correcto no es un descuadre', () => {
  it('INV1: seña devuelta al 100% y sin cash_flow → NO es finding', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const { depositId } = await seedPagoTardioReembolsado(sql, fx)

    const findings = await runAccountingReconciliation(sql)

    // No hay movimiento en Caja a propósito: no entró plata que registrar.
    expect(idsFor(findings, 'inv1_payment_without_cashflow')).not.toContain(depositId)
  }, 30_000)

  it('INV1: si el reembolso fue PARCIAL, la parte que quedó adentro sigue alarmando', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    // Devuelve 100.000 de 240.000: quedan 140.000 en la cuenta del complejo,
    // y esa plata sí tiene que estar en Caja.
    const { depositId } = await seedPagoTardioReembolsado(sql, fx, { montoReembolso: 100000 })

    const findings = await runAccountingReconciliation(sql)

    expect(idsFor(findings, 'inv1_payment_without_cashflow')).toContain(depositId)
  }, 30_000)

  it('INV5: el reembolso sobre una reserva `expired` NO reclama un reflejo imposible', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const { refundId } = await seedPagoTardioReembolsado(sql, fx)

    const findings = await runAccountingReconciliation(sql)

    // `deposit_status` sigue en 'pending' y así va a quedar: el trigger de la
    // migración 070 no deja actualizar una reserva terminal.
    expect(idsFor(findings, 'inv5_refund_not_reflected')).not.toContain(refundId)
  }, 30_000)

  it('INV5: control positivo — sobre una reserva viva el reflejo se sigue exigiendo', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    // Misma forma, pero con la reserva `confirmed`: acá el sistema SÍ puede
    // dejar la seña en 'refunded', así que no haberlo hecho es un descuadre.
    const { refundId } = await seedPagoTardioReembolsado(sql, fx, { estadoBooking: 'confirmed' })

    const findings = await runAccountingReconciliation(sql)

    expect(idsFor(findings, 'inv5_refund_not_reflected')).toContain(refundId)
  }, 30_000)
})

describe('reconciliation-drift: INV2 monto payment vs cashflow', () => {
  it('cash_flow reflejo con monto distinto al payment → finding + audit_log', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId)
    await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, { amount: 240000 })
    const cashFlowId = await createTestCashFlow(sql, fx.tenantId, bookingId, fx.staffId, {
      amount: 200000,
    })

    await runReconciliationSweep()

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv2_amount_mismatch_cashflow')).toContain(cashFlowId)

    const auditCount = await auditLogCountFor(
      sql,
      'reconciliation.drift_inv2_amount_mismatch_cashflow',
      cashFlowId,
    )
    expect(auditCount).toBeGreaterThan(0)
  }, 30_000)

  it('control negativo: mismo monto payment/cashflow → sin finding', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId)
    await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, { amount: 240000 })
    const cashFlowId = await createTestCashFlow(sql, fx.tenantId, bookingId, fx.staffId, {
      amount: 240000,
    })

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv2_amount_mismatch_cashflow')).not.toContain(cashFlowId)
  }, 30_000)
})

describe('reconciliation-drift: INV3 monto payment vs booking.deposit_amount', () => {
  it('payment.amount distinto de bookings.deposit_amount → finding + audit_log', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
      depositAmount: 240000,
    })
    const paymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
      amount: 300000,
    })

    await runReconciliationSweep()

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv3_amount_mismatch_booking')).toContain(paymentId)

    const auditCount = await auditLogCountFor(
      sql,
      'reconciliation.drift_inv3_amount_mismatch_booking',
      paymentId,
    )
    expect(auditCount).toBeGreaterThan(0)
  }, 30_000)

  it('control negativo: payment.amount === bookings.deposit_amount → sin finding', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
      depositAmount: 240000,
    })
    const paymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
      amount: 240000,
    })

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv3_amount_mismatch_booking')).not.toContain(paymentId)
  }, 30_000)
})

describe('reconciliation-drift: INV4 booking pagado sin payment approved', () => {
  it('deposit_status paid + payment_method mercadopago sin payment approved → finding + audit_log', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    // El CHECK chk_booking_payment_consistency exige payment_id NOT NULL
    // cuando payment_method='mercadopago' — se satisface con una fila de
    // payments 'pending' (la invariante exige AUSENCIA de fila 'approved',
    // no de cualquier fila). El payment se crea ANTES que el booking
    // (booking_id NULL temporal) y el booking apunta a `payment_id` desde
    // su propio INSERT: el trigger `set_updated_at` (005_triggers.sql)
    // resetea bookings.updated_at en CUALQUIER UPDATE sobre bookings, así
    // que un UPDATE posterior ahí rompería el margen de 15 min que esta
    // query exige sobre updated_at. payments no tiene ese trigger (ni
    // siquiera columna updated_at), así que vincular booking_id post-hoc
    // en `payments` es seguro.
    const pendingPaymentId = await createTestPayment(sql, fx.tenantId, null, fx.playerId, {
      status: 'pending',
    })
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
      depositStatus: 'paid',
      paymentMethod: 'mercadopago',
      paymentId: pendingPaymentId,
    })
    await sql`UPDATE payments SET booking_id = ${bookingId} WHERE id = ${pendingPaymentId}`

    await runReconciliationSweep()

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv4_booking_without_payment')).toContain(bookingId)

    const auditCount = await auditLogCountFor(
      sql,
      'reconciliation.drift_inv4_booking_without_payment',
      bookingId,
    )
    expect(auditCount).toBeGreaterThan(0)
  }, 30_000)

  it('control negativo: booking pagado CON payment approved → sin finding', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    // Fix del verificador adversarial: el trigger `set_updated_at`
    // (005_triggers.sql:13-19,32-34, BEFORE UPDATE ON bookings, incondicional)
    // pisa bookings.updated_at a NOW() en CUALQUIER UPDATE — un UPDATE
    // posterior acá dejaría la fila con antigüedad de segundos en vez de los
    // ~20 minutos que el margen de la query exige, y el test pasaría por la
    // razón equivocada (la excluiría el filtro de tiempo, no el NOT EXISTS).
    // Mismo patrón que el control positivo de arriba: el payment se crea
    // ANTES que el booking (booking_id NULL temporal, para no romper la FK
    // payments.booking_id → bookings.id) y el booking nace YA con
    // payment_method/payment_id finales en su propio INSERT — sin ningún
    // UPDATE posterior sobre bookings. El UPDATE que queda es sobre
    // `payments` (sin ese trigger, ni siquiera tiene columna updated_at), así
    // que vincular booking_id post-hoc ahí es seguro.
    const approvedPaymentId = await createTestPayment(sql, fx.tenantId, null, fx.playerId, {
      status: 'approved',
    })
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
      depositStatus: 'paid',
      paymentMethod: 'mercadopago',
      paymentId: approvedPaymentId,
    })
    await sql`UPDATE payments SET booking_id = ${bookingId} WHERE id = ${approvedPaymentId}`

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv4_booking_without_payment')).not.toContain(bookingId)
  }, 30_000)
})

describe('reconciliation-drift: INV5 refund approved no reflejado', () => {
  it('payment refund approved con booking.deposit_status <> refunded → finding + audit_log', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
      depositStatus: 'paid',
      paymentMethod: null,
    })
    const originalPaymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
      status: 'approved',
    })
    await sql`
      UPDATE bookings SET payment_method = 'mercadopago', payment_id = ${originalPaymentId}
      WHERE id = ${bookingId}
    `
    const refundPaymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
      type: 'refund',
      status: 'approved',
    })

    await runReconciliationSweep()

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv5_refund_not_reflected')).toContain(refundPaymentId)

    const auditCount = await auditLogCountFor(
      sql,
      'reconciliation.drift_inv5_refund_not_reflected',
      refundPaymentId,
    )
    expect(auditCount).toBeGreaterThan(0)
  }, 30_000)

  it('control negativo: refund approved con booking.deposit_status=refunded → sin finding', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
      depositStatus: 'refunded',
      paymentMethod: null,
    })
    const originalPaymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
      status: 'approved',
    })
    await sql`
      UPDATE bookings SET payment_method = 'mercadopago', payment_id = ${originalPaymentId}
      WHERE id = ${bookingId}
    `
    const refundPaymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
      type: 'refund',
      status: 'approved',
    })

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv5_refund_not_reflected')).not.toContain(refundPaymentId)
  }, 30_000)
})

describe('reconciliation-drift: INV9 cashflow huérfano', () => {
  it('cash_flow booking/mercadopago sin ningún payment approved → finding + audit_log', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
      depositStatus: 'not_required',
      paymentMethod: null,
    })
    const cashFlowId = await createTestCashFlow(sql, fx.tenantId, bookingId, fx.staffId)
    // CERO filas en payments para este booking.

    await runReconciliationSweep()

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv9_orphan_cashflow')).toContain(cashFlowId)

    const auditCount = await auditLogCountFor(
      sql,
      'reconciliation.drift_inv9_orphan_cashflow',
      cashFlowId,
    )
    expect(auditCount).toBeGreaterThan(0)
  }, 30_000)

  it('control negativo: cash_flow con payment approved real detrás → sin finding', async () => {
    const sql = getSql()
    const fx = await setupFixture(sql)
    const bookingId = await createTestBooking(sql, fx.tenantId, fx.courtId, fx.playerId, {
      depositStatus: 'paid',
      paymentMethod: null,
    })
    const paymentId = await createTestPayment(sql, fx.tenantId, bookingId, fx.playerId, {
      status: 'approved',
    })
    await sql`
      UPDATE bookings SET payment_method = 'mercadopago', payment_id = ${paymentId}
      WHERE id = ${bookingId}
    `
    const cashFlowId = await createTestCashFlow(sql, fx.tenantId, bookingId, fx.staffId)

    const findings = await runAccountingReconciliation(sql)
    expect(idsFor(findings, 'inv9_orphan_cashflow')).not.toContain(cashFlowId)
  }, 30_000)
})
