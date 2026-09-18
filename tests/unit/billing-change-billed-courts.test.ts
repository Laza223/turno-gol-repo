import { beforeEach, describe, expect, it, vi } from 'vitest'

// `changeBilledCourts` reemplaza a `upgrade()`/`downgrade()`/
// `handleUpgradeApproved`, que existían porque el precio venía en bandas
// discretas y subir de banda se cobraba prorrateado en el momento.
//
// Con precio por cancha (decisión 2026-09-17, P4) NINGÚN cambio se cobra en el
// medio del período, en los dos sentidos. Eso borró toda la maquinaria de
// proraeo — Preference de cobro único, webhook de upgrade acreditado, pago que
// podía quedar huérfano — y con ella el TOCTOU que cubría
// `billing-upgrade-approved-toctou.test.ts` (B4 🔴).
//
// El INVARIANTE de aquel test sí sobrevive, y es lo que cubre el bloque
// "carrera" de acá abajo: **el UPDATE local es el gate; si afecta 0 filas,
// MercadoPago NUNCA se toca.** Si se invirtiera el orden, una tx concurrente
// que saca la suscripción de `trialing` entre el lock y el UPDATE dejaría a MP
// cobrando un monto que la DB no refleja.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { changeBilledCourts } from '@/modules/billing/billing.service'
import {
  DowngradeBlockedError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
const PERIOD_END = '2027-02-01T00:00:00Z'

/** Fila única de `plans` desde la migr. 091: el monto sale de estas 3 columnas. */
const PLAN_ROW = {
  id: 'plan-turnogol',
  slug: 'turnogol',
  name: 'TurnoGol',
  max_courts: null,
  price_monthly: 4_700_000,
  price_annual: 4_230_000,
  price_first_court_cents: 4_700_000, // $47.000 la primera
  price_extra_court_cents: 3_000_000, // $30.000 cada extra
  annual_discount_bps: 1_000, // 10% off
}

function makeSubRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'active',
    plan_id: PLAN_ROW.id,
    billing_cycle: 'monthly',
    billed_courts: 3,
    pending_billed_courts: null,
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: PERIOD_END,
    mp_subscription_id: 'mp-live-1',
    mp_payer_email: null,
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
    ...overrides,
  }
}

/**
 * Orden de `tx.execute` dentro de `changeBilledCourts()`: 1) loadSubForUpdate
 * (`FOR UPDATE`, mismo patrón B5 que `cancel()`/`subscribe()`),
 * 2) countOnlineCourts, 3) loadActivePlan, 4) el UPDATE.
 *
 * `updateRows` es lo que devuelve ese UPDATE. En `trialing` lleva `RETURNING
 * mp_subscription_id` y `[]` simula la carrera (otra tx ya sacó la suscripción
 * de `trialing`). `insertSystemAuditLog` está mockeado a nivel de módulo y no
 * pasa por `tx.execute`.
 */
function makeTx(
  subRow: ReturnType<typeof makeSubRow>,
  onlineCourts: number,
  updateRows: unknown[] = [{ mp_subscription_id: subRow.mp_subscription_id }],
) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSubForUpdate
    .mockResolvedValueOnce([{ n: onlineCourts }]) // countOnlineCourts
    .mockResolvedValueOnce([PLAN_ROW]) // loadActivePlan
    .mockResolvedValueOnce(updateRows) // UPDATE tenant_subscriptions
  return { execute } as unknown as DbTx
}

/**
 * Los valores interpolados de un `sql` template de Drizzle. `queryChunks`
 * alterna pedazos de texto (objetos con `.value: string[]`) y los parámetros
 * crudos; quedarse con los segundos es la única forma de ver QUÉ se le mandó
 * a Postgres sin una DB real. Hace falta acá porque el valor que importa
 * (`pending_billed_courts = NULL`) no sale en el resultado ni en el audit: si
 * se escribiera el número en vez de NULL, el sweep aplicaría un cambio que el
 * dueño ya deshizo.
 */
function sqlParams(query: unknown): unknown[] {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? []
  return chunks.filter(
    (c) =>
      !(typeof c === 'object' && c !== null && Array.isArray((c as { value?: unknown }).value)),
  )
}

/** El 4º `tx.execute` de `changeBilledCourts` es siempre el UPDATE. */
function updateParams(tx: DbTx): unknown[] {
  const executeMock = tx.execute as unknown as ReturnType<typeof vi.fn>
  return sqlParams(executeMock.mock.calls[3]?.[0])
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('changeBilledCourts — en prueba gratis se aplica en el acto', () => {
  it('trialing: queda aplicado ya (no agendado) y devuelve de cuánto a cuánto', async () => {
    const tx = makeTx(makeSubRow({ status: 'trialing', billed_courts: 3 }), 3)
    const gateway = new MockGateway()

    const result = await changeBilledCourts(TENANT_ID, 5, gateway, tx)

    expect(result).toEqual({
      applied: true,
      appliesAt: null,
      billedCourts: 5,
      previousBilledCourts: 3,
    })
  })

  it('trialing con preapproval ya creado: mueve el monto en MP, y el reason nombra las canchas', async () => {
    const tx = makeTx(makeSubRow({ status: 'trialing', mp_subscription_id: 'mp-trial-1' }), 3)
    const gateway = new MockGateway()

    await changeBilledCourts(TENANT_ID, 5, gateway, tx)

    // 5 canchas mensual = $167.000 (tabla de la decisión, no recalculado acá).
    expect(gateway.updatePreapprovalCalls).toEqual([
      {
        preapprovalId: 'mp-trial-1',
        amount: 16_700_000,
        reason: 'TurnoGol — 5 canchas (mensual)',
      },
    ])
  })

  it('trialing SIN preapproval todavía (nunca pasó por el checkout): no toca MP', async () => {
    const tx = makeTx(makeSubRow({ status: 'trialing', mp_subscription_id: null }), 3, [
      { mp_subscription_id: null },
    ])
    const gateway = new MockGateway()

    const result = await changeBilledCourts(TENANT_ID, 5, gateway, tx)

    expect(result.applied).toBe(true)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it('trialing anual: el monto de MP es el equivalente mensual con 10% off POR 12', async () => {
    const tx = makeTx(makeSubRow({ status: 'trialing', billing_cycle: 'annual' }), 3)
    const gateway = new MockGateway()

    await changeBilledCourts(TENANT_ID, 5, gateway, tx)

    // $150.300 por mes × 12. Mandar el equivalente mensual a pelo le cobraría
    // al complejo 12 veces menos de lo que va.
    expect(gateway.updatePreapprovalCalls[0]?.amount).toBe(15_030_000 * 12)
    expect(gateway.updatePreapprovalCalls[0]?.reason).toBe('TurnoGol — 5 canchas (anual)')
  })
})

describe('changeBilledCourts — con la suscripción activa se agenda, nunca se cobra', () => {
  it('active: devuelve agendado para el fin del período, no aplicado', async () => {
    const tx = makeTx(makeSubRow({ status: 'active', billed_courts: 3 }), 3)
    const gateway = new MockGateway()

    const result = await changeBilledCourts(TENANT_ID, 5, gateway, tx)

    expect(result).toEqual({
      applied: false,
      appliesAt: new Date(PERIOD_END),
      billedCourts: 5,
      previousBilledCourts: 3,
    })
  })

  it('active: NO toca MP en el momento — el monto lo mueve el sweep al cierre del período', async () => {
    const tx = makeTx(makeSubRow({ status: 'active' }), 3)
    const gateway = new MockGateway()

    await changeBilledCourts(TENANT_ID, 5, gateway, tx)

    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
  })

  // P4 en una línea: sumar o sacar una cancha no genera NINGÚN cobro nuevo.
  // El proraeo era una Preference de cobro único; si alguien la reintroduce,
  // este assert es el que lo agarra.
  it.each([
    ['trialing', 5],
    ['active', 5],
    ['active', 1],
  ])('%s → %i canchas: nunca crea una preferencia de cobro', async (status, target) => {
    const tx = makeTx(makeSubRow({ status, billed_courts: 3 }), 1)
    const gateway = new MockGateway()

    await changeBilledCourts(TENANT_ID, target, gateway, tx)

    expect(gateway.preferenceCalls).toHaveLength(0)
    expect(gateway.saasUpgradePreferenceCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })

  it('active: el UPDATE escribe la cantidad nueva en pending_billed_courts', async () => {
    const tx = makeTx(makeSubRow({ status: 'active', billed_courts: 3 }), 3)

    await changeBilledCourts(TENANT_ID, 5, new MockGateway(), tx)

    // `pending` va dos veces (la columna y el CASE de `pending_change_at`),
    // después el tenant.
    expect(updateParams(tx)).toEqual([5, 5, TENANT_ID])
  })

  it('volver a la cantidad que ya se factura cancela el cambio agendado (no hay endpoint de "deshacer")', async () => {
    const tx = makeTx(
      makeSubRow({ status: 'active', billed_courts: 3, pending_billed_courts: 5 }),
      3,
    )

    await changeBilledCourts(TENANT_ID, 3, new MockGateway(), tx)

    // NULL y no 3: con el número, el sweep "aplicaría" un cambio que el dueño
    // ya deshizo y volvería a mover el monto en MP.
    expect(updateParams(tx)).toEqual([null, null, TENANT_ID])
    expect(insertSystemAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'subscription.billed_courts_scheduled',
        metadata: expect.objectContaining({ canceled: true }),
      }),
    )
  })
})

// El invariante que heredamos de `handleUpgradeApproved` (B4 🔴): el UPDATE
// local es el gate. Si afecta 0 filas porque una tx concurrente movió el
// estado, MP no se toca — nunca "MP cobra lo nuevo y la DB se quedó en lo
// viejo".
describe('changeBilledCourts — carrera entre el lock y el UPDATE (invariante de B4)', () => {
  it('trialing pero el UPDATE afecta 0 filas → tira y MercadoPago NUNCA se toca', async () => {
    const tx = makeTx(makeSubRow({ status: 'trialing' }), 3, []) // 0 filas
    const gateway = new MockGateway()

    await expect(changeBilledCourts(TENANT_ID, 5, gateway, tx)).rejects.toBeInstanceOf(
      SubscriptionNotFoundError,
    )
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    // Tampoco audita un cambio que no ocurrió.
    expect(insertSystemAuditLog).not.toHaveBeenCalled()
  })
})

describe('changeBilledCourts — guards', () => {
  it('bajar por debajo de las canchas prendidas → DowngradeBlockedError, sin tocar MP', async () => {
    const tx = makeTx(makeSubRow({ status: 'active', billed_courts: 5 }), 5)
    const gateway = new MockGateway()

    await expect(changeBilledCourts(TENANT_ID, 3, gateway, tx)).rejects.toBeInstanceOf(
      DowngradeBlockedError,
    )
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it.each(['past_due', 'suspended', 'blocked', 'canceled', 'churned'])(
    '%s: no se toca la cuota — lo que corresponde es regularizar el pago',
    async (status) => {
      const tx = makeTx(makeSubRow({ status }), 3)
      const gateway = new MockGateway()

      await expect(changeBilledCourts(TENANT_ID, 5, gateway, tx)).rejects.toBeInstanceOf(
        ReactivateNotAllowedError,
      )
      expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    },
  )

  it('sin fila de suscripción → SubscriptionNotFoundError antes de cualquier otra lectura', async () => {
    const execute = vi.fn().mockResolvedValueOnce([]) // loadSubForUpdate: 0 filas
    const tx = { execute } as unknown as DbTx

    await expect(changeBilledCourts(TENANT_ID, 5, new MockGateway(), tx)).rejects.toBeInstanceOf(
      SubscriptionNotFoundError,
    )
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
