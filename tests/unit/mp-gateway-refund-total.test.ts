/**
 * 2026-08-21, producción: un reembolso del 100% falló con
 * `403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES` mientras la MISMA devolución salía
 * a mano desde el panel del complejo. Dos causas en la misma llamada:
 *
 * 1. Se mandaba SIEMPRE `body: { amount }`, y para MP eso es un reembolso
 *    PARCIAL — con reglas más duras que el total sobre un pago cuya plata
 *    todavía no está liberada. Devolver el total tiene que ir SIN body.
 * 2. La idempotency key viajaba en `requestOptions`, que la operación de
 *    refund del SDK descarta (su `create` destructura sólo
 *    `{ payment_id, body, config }`). El único canal que el SDK lee es
 *    `config.options.idempotencyKey` — sin eso, `RestClient` genera un UUID
 *    nuevo por intento y dos reintentos del mismo refund devuelven dos veces.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { refundSpy, configSpy } = vi.hoisted(() => ({
  refundSpy: vi.fn(),
  configSpy: vi.fn(),
}))

vi.mock('@/lib/mercadopago', () => ({
  mpClient: () => ({ accessToken: 'tok-plano', options: { timeout: 8000 } }),
  mpClientFromPlaintext: () => ({ accessToken: 'tok-plano', options: { timeout: 8000 } }),
}))

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {
    accessToken: string
    options: unknown
    constructor(cfg: { accessToken: string; options?: unknown }) {
      configSpy(cfg)
      this.accessToken = cfg.accessToken
      this.options = cfg.options
    }
  },
  PaymentRefund: class {
    private cfg: unknown
    constructor(cfg: unknown) {
      this.cfg = cfg
    }
    create(args: unknown): Promise<unknown> {
      refundSpy(args, this.cfg)
      return Promise.resolve({ id: 'refund-1', status: 'approved' })
    }
  },
  Payment: class {
    constructor(_: unknown) {}
  },
  PreApproval: class {
    constructor(_: unknown) {}
  },
  Preference: class {
    constructor(_: unknown) {}
  },
}))

import { MercadoPagoGateway } from '@/modules/payments/mp-gateway.implementation'

beforeEach(() => {
  refundSpy.mockClear()
  configSpy.mockClear()
})

describe('createRefund — total vs parcial', () => {
  it('sin monto manda POST SIN body: para MP eso es un reembolso TOTAL', async () => {
    const gw = new MercadoPagoGateway('enc')

    await gw.createRefund('175029618908', undefined, 'refund:abc')

    const [args] = refundSpy.mock.calls[0]! as [{ payment_id: string; body?: unknown }]
    expect(args.payment_id).toBe('175029618908')
    expect(args.body).toBeUndefined()
  })

  it('con monto manda el body en PESOS, no en centavos', async () => {
    const gw = new MercadoPagoGateway('enc')

    await gw.createRefund('175029618908', 10000, 'refund:abc')

    const [args] = refundSpy.mock.calls[0]! as [{ body?: { amount: number } }]
    expect(args.body).toEqual({ amount: 100 })
  })
})

describe('createRefund — idempotency key', () => {
  it('la key viaja por config.options, el único canal que el SDK lee', async () => {
    const gw = new MercadoPagoGateway('enc')

    await gw.createRefund('175029618908', undefined, 'refund:fila-123')

    const [args, cfg] = refundSpy.mock.calls[0]! as [
      Record<string, unknown>,
      { accessToken: string; options: { idempotencyKey?: string; timeout?: number } },
    ]
    // Nunca por `requestOptions`: esa operación del SDK lo descarta en silencio.
    expect(args).not.toHaveProperty('requestOptions')
    expect(cfg.options.idempotencyKey).toBe('refund:fila-123')
    // Y sin pisar el resto de las opciones del cliente.
    expect(cfg.options.timeout).toBe(8000)
    expect(cfg.accessToken).toBe('tok-plano')
  })

  it('sin key no se arma un cliente nuevo: usa el del gateway tal cual', async () => {
    const gw = new MercadoPagoGateway('enc')

    await gw.createRefund('175029618908', undefined)

    expect(configSpy).not.toHaveBeenCalled()
  })
})
