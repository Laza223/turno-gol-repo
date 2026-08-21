import { describe, expect, it } from 'vitest'
import {
  buildSubscriptionChargeKey,
  decideSubscriptionReconcile,
  type LocalSubSnapshot,
} from '@/modules/billing/subscription-reconcile.service'
import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'

/**
 * Tabla de decisión del reconciliador de suscripciones.
 *
 * Los payloads son los REALES de la cuenta de producción, medidos el
 * 2026-08-20 con una sonda read-only sobre los 5 preapprovals de "complejo
 * titi". Es a propósito: el bug del PR #177 sobrevivió a la suite porque los
 * tests usaban ids numéricos inventados ('777') cuando MercadoPago manda un
 * hash de 32 hex. Un dato plausible-pero-no-real deja pasar exactamente esa
 * clase de bug.
 */

const TENANT = 'fbeda410-39eb-4ed0-b248-2f732ad14d26'

/** El que cobró $100 y quedó sin aplicar. */
const PREAPPROVAL_COBRADO = '275616150bef48aa85d502d9b490a359'
/** Uno de los tres que nunca cobraron: MP omite `summarized` entero. */
const PREAPPROVAL_SIN_COBROS = '88f6dc4ca8834ac4a54732ad41032e36'

const LOCAL: LocalSubSnapshot = {
  status: 'trialing',
  billingCycle: 'monthly',
  mpSubscriptionId: PREAPPROVAL_COBRADO,
  lastPaymentAt: null,
}

function remote(over: Partial<GatewaySubscriptionState> = {}): GatewaySubscriptionState {
  return {
    preapprovalId: PREAPPROVAL_COBRADO,
    status: 'authorized',
    externalReference: TENANT,
    nextPaymentDate: new Date('2026-09-20T10:47:30.000-04:00'),
    chargedQuantity: 1,
    lastChargedDate: new Date('2026-08-20T10:49:04.486-04:00'),
    lastChargedAmountCents: 10_000,
    ...over,
  }
}

describe('decideSubscriptionReconcile', () => {
  it('activa cuando MP cobró y la DB no se enteró', () => {
    const d = decideSubscriptionReconcile(LOCAL, remote(), TENANT)

    expect(d.action).toBe('activate')
    if (d.action !== 'activate') return
    // El período se ancla en las fechas de MP, no en `new Date()`: es lo que
    // hace que correr el worker dos veces dé el mismo resultado.
    expect(d.paidAt.toISOString()).toBe(new Date('2026-08-20T10:49:04.486-04:00').toISOString())
    expect(d.periodEnd.toISOString()).toBe(new Date('2026-09-20T10:47:30.000-04:00').toISOString())
  })

  it('no toca nada si el cobro de MP ya está aplicado (ganó el webhook)', () => {
    const d = decideSubscriptionReconcile(
      { ...LOCAL, lastPaymentAt: new Date('2026-08-20T23:00:00.000Z') },
      remote(),
      TENANT,
    )

    expect(d).toEqual({ action: 'noop', reason: 'el último cobro de MP ya está aplicado' })
  })

  it('activa si el cobro de MP es POSTERIOR al último pago aplicado (mes siguiente)', () => {
    const d = decideSubscriptionReconcile(
      { ...LOCAL, status: 'past_due', lastPaymentAt: new Date('2026-07-20T10:00:00.000Z') },
      remote(),
      TENANT,
    )

    expect(d.action).toBe('activate')
  })

  it('no activa un preapproval autorizado que todavía no cobró', () => {
    const d = decideSubscriptionReconcile(
      LOCAL,
      remote({ preapprovalId: PREAPPROVAL_SIN_COBROS, chargedQuantity: 0, lastChargedDate: null }),
      TENANT,
    )

    expect(d).toEqual({ action: 'noop', reason: 'autorizado pero todavía sin cobros' })
  })

  it('trata el `summarized` AUSENTE como cero cobros, no como cobro desconocido', () => {
    // Regresión del parser: MP omite `summarized` entero cuando nunca cobró.
    // Si eso se leyera como "hay un cobro", un complejo en prueba se activaría
    // solo sin haber pagado nunca.
    const sinSummarized = remote({
      preapprovalId: PREAPPROVAL_SIN_COBROS,
      chargedQuantity: 0,
      lastChargedDate: null,
      lastChargedAmountCents: null,
    })

    expect(decideSubscriptionReconcile(LOCAL, sinSummarized, TENANT).action).toBe('noop')
  })

  it('alerta —y NO activa— cuando MP dice cancelled (el caso real de los $100)', () => {
    const d = decideSubscriptionReconcile(LOCAL, remote({ status: 'cancelled' }), TENANT)

    expect(d).toEqual({ action: 'alert', reason: 'MP dice cancelled y la DB no' })
  })

  it('alerta cuando MP dice paused', () => {
    expect(decideSubscriptionReconcile(LOCAL, remote({ status: 'paused' }), TENANT).action).toBe(
      'alert',
    )
  })

  it('alerta ante un status de preapproval que no conoce', () => {
    expect(decideSubscriptionReconcile(LOCAL, remote({ status: 'unknown' }), TENANT).action).toBe(
      'alert',
    )
  })

  it('no hace nada con un preapproval pendiente de autorizar', () => {
    const d = decideSubscriptionReconcile(LOCAL, remote({ status: 'pending' }), TENANT)

    expect(d.action).toBe('noop')
  })

  it('alerta si hay cobros pero MP no manda la fecha del último', () => {
    const d = decideSubscriptionReconcile(
      LOCAL,
      remote({ chargedQuantity: 2, lastChargedDate: null }),
      TENANT,
    )

    expect(d).toEqual({ action: 'alert', reason: 'charged_quantity > 0 sin last_charged_date' })
  })

  it('alerta si el preapproval es de otro complejo', () => {
    const d = decideSubscriptionReconcile(
      LOCAL,
      remote({ externalReference: '00000000-0000-0000-0000-000000000000' }),
      TENANT,
    )

    expect(d.action).toBe('alert')
    if (d.action !== 'alert') return
    expect(d.reason).toContain('external_reference no coincide')
  })

  it('cae al ciclo cuando next_payment_date es anterior al cobro', () => {
    // No es teórico: los preapprovals sin cobrar devuelven un
    // `next_payment_date` ANTERIOR a su propia fecha de creación.
    const d = decideSubscriptionReconcile(
      LOCAL,
      remote({ nextPaymentDate: new Date('2026-01-01T00:00:00.000Z') }),
      TENANT,
    )

    expect(d.action).toBe('activate')
    if (d.action !== 'activate') return
    // last_charged 2026-08-20 + 1 mes.
    expect(d.periodEnd.getUTCMonth()).toBe(8) // septiembre (0-indexed)
    expect(d.periodEnd.getUTCFullYear()).toBe(2026)
  })

  it('suma un año cuando el ciclo es anual', () => {
    const d = decideSubscriptionReconcile(
      { ...LOCAL, billingCycle: 'annual' },
      remote({ nextPaymentDate: null }),
      TENANT,
    )

    expect(d.action).toBe('activate')
    if (d.action !== 'activate') return
    expect(d.periodEnd.getUTCFullYear()).toBe(2027)
  })

  it('levanta también desde suspended y blocked (rescate post-terminal)', () => {
    for (const status of ['suspended', 'blocked'] as const) {
      expect(decideSubscriptionReconcile({ ...LOCAL, status }, remote(), TENANT).action).toBe(
        'activate',
      )
    }
  })
})

describe('buildSubscriptionChargeKey', () => {
  it('se ancla en el id del pago, que es lo único que los dos caminos ven igual', () => {
    // El id real del pago del cobro que sí se aplicó el 2026-08-20.
    expect(buildSubscriptionChargeKey('173841538187')).toBe('sub-charge:173841538187')
  })
})
