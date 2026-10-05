/**
 * `updatePreapprovalAmount` contra el SDK (mockeado), no contra `MockGateway`.
 *
 * El bug que cierra: el PUT viejo mandaba `auto_recurring` con SOLO
 * `transaction_amount` y `currency_id`. MercadoPago reemplaza el objeto entero,
 * así que el `start_date` se perdía y un complejo en prueba gratis pasaba a
 * cobrarse en el acto. Es exactamente lo que el dueño pidió evitar con El
 * Vagón (prueba hasta el 2026-12-06, preapproval de $99.000 que sube a
 * $167.000). Todos los demás tests que tocan este método pasan por
 * `MockGateway`, así que sin este archivo nada impedía que un refactor volviera
 * a mandar solo el monto.
 *
 * La respuesta del GET imita la forma real de la API (frecuencia en meses,
 * monto en pesos, `start_date` con offset de Argentina) — un fixture con
 * `start_date: null` ya escondió una vez que el reuso de checkout no andaba.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSpy, updateSpy } = vi.hoisted(() => ({ getSpy: vi.fn(), updateSpy: vi.fn() }))

vi.mock('@/lib/mercadopago', () => ({
  mpClient: () => ({ __mock: 'config' }),
  mpClientFromPlaintext: () => ({ __mock: 'config' }),
}))

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {
    constructor(_: unknown) {}
  },
  Payment: class {
    constructor(_: unknown) {}
  },
  PaymentRefund: class {
    constructor(_: unknown) {}
  },
  PreApproval: class {
    constructor(_: unknown) {}
    get(args: unknown): Promise<unknown> {
      return getSpy(args)
    }
    update(args: unknown): Promise<unknown> {
      updateSpy(args)
      return Promise.resolve({ id: 'a81bc5-preapp' })
    }
  },
  Preference: class {
    constructor(_: unknown) {}
  },
}))

import { MercadoPagoGateway } from '@/modules/payments/mp-gateway.implementation'
import { MpGatewayError } from '@/modules/payments/payment.errors'

const PREAPPROVAL_ID = 'a81bc5-preapp'
const START_DATE = '2026-12-06T12:00:00.000-03:00'

/** El preapproval de un complejo en prueba, tal como lo devuelve el GET. */
function trialPreapproval(overrides: Record<string, unknown> = {}) {
  return {
    id: PREAPPROVAL_ID,
    status: 'authorized',
    reason: 'TurnoGol — Complejo (mensual)',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 99000,
      currency_id: 'ARS',
      start_date: START_DATE,
      ...overrides,
    },
  }
}

function sentAutoRecurring(): Record<string, unknown> {
  const [args] = updateSpy.mock.calls[0] as [{ body: { auto_recurring: Record<string, unknown> } }]
  return args.body.auto_recurring
}

describe('MercadoPagoGateway.updatePreapprovalAmount — no rompe la prueba gratis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reenvía el auto_recurring COMPLETO: start_date intacto y el monto nuevo en pesos', async () => {
    getSpy.mockResolvedValue(trialPreapproval())

    // 5 canchas = $167.000 → 16_700_000 centavos.
    await new MercadoPagoGateway('token', { plaintextToken: true }).updatePreapprovalAmount(
      PREAPPROVAL_ID,
      16_700_000,
    )

    expect(getSpy).toHaveBeenCalledWith({ id: PREAPPROVAL_ID })
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(sentAutoRecurring()).toEqual({
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 167000,
      currency_id: 'ARS',
      start_date: START_DATE,
    })
  })

  it('manda el reason nuevo cuando se lo pasan', async () => {
    getSpy.mockResolvedValue(trialPreapproval())

    await new MercadoPagoGateway('token', { plaintextToken: true }).updatePreapprovalAmount(
      PREAPPROVAL_ID,
      16_700_000,
      {
        reason: 'TurnoGol — 5 canchas (mensual)',
      },
    )

    const [args] = updateSpy.mock.calls[0] as [{ body: { reason?: string } }]
    expect(args.body.reason).toBe('TurnoGol — 5 canchas (mensual)')
  })

  it('preserva también end_date si el preapproval tiene uno', async () => {
    getSpy.mockResolvedValue(trialPreapproval({ end_date: '2027-12-06T12:00:00.000-03:00' }))

    await new MercadoPagoGateway('token', { plaintextToken: true }).updatePreapprovalAmount(
      PREAPPROVAL_ID,
      16_700_000,
    )

    expect(sentAutoRecurring().end_date).toBe('2027-12-06T12:00:00.000-03:00')
  })

  it('si MP no devuelve la frecuencia, NO pisa el preapproval: tira y no hace el PUT', async () => {
    getSpy.mockResolvedValue(trialPreapproval({ frequency: undefined }))

    await expect(
      new MercadoPagoGateway('token', { plaintextToken: true }).updatePreapprovalAmount(
        PREAPPROVAL_ID,
        16_700_000,
      ),
    ).rejects.toBeInstanceOf(MpGatewayError)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('sin start_date en MP no inventa uno (el preapproval ya cobraba al autorizar)', async () => {
    getSpy.mockResolvedValue(trialPreapproval({ start_date: undefined }))

    await new MercadoPagoGateway('token', { plaintextToken: true }).updatePreapprovalAmount(
      PREAPPROVAL_ID,
      16_700_000,
    )

    expect(sentAutoRecurring()).not.toHaveProperty('start_date')
  })
})
