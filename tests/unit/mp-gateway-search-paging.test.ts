/**
 * `searchPaymentsByReference` tiene que traer TODAS las páginas.
 *
 * El ledger de deuda difería este ítem hasta que existiera un consumidor que
 * necesitara el historial completo, y daba `GET /api/billing/invoices` por "sin
 * implementar todavía". Ya existe: `src/app/api/billing/invoices/route.ts` y
 * `listInvoices` (billing.service.ts), que llama a este método y mapea lo que
 * llega. O sea que el disparador se cumplió sin que nadie lo notara.
 *
 * El sintoma sería silencioso, que es lo que lo hace feo: en cuanto un complejo
 * acumule más cobros mensuales que el tamaño de página de MercadoPago, su
 * historial de facturación se ve CORTADO y sin ningún aviso — no hay error, no
 * hay marca, simplemente faltan meses.
 *
 * Los otros dos consumidores (`reconcile-subscriptions.worker.ts`, que sólo
 * quiere el `approved` más reciente, y `mp-reconcile.service.ts`, que busca por
 * booking individual) no necesitan enterarse: la firma no cambió.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const search = vi.fn()

vi.mock('@/lib/mercadopago', () => ({ mpClient: () => ({ accessToken: 'token-master' }) }))
vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {
    accessToken: string
    constructor(opts: { accessToken: string }) {
      this.accessToken = opts.accessToken
    }
  },
  Payment: class {
    search = search
    constructor(_: unknown) {}
  },
  PaymentRefund: class {
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

const TENANT = 'fbeda410-39eb-4ed0-b248-2f732ad14d26'

/** Una fila del search, con los campos que TurnoGol lee. */
const pago = (id: number) => ({
  id,
  status: 'approved',
  transaction_amount: 100,
  external_reference: TENANT,
  payment_method_id: 'visa',
  date_created: '2026-08-28T22:36:47.000-03:00',
})

function gateway() {
  return new MercadoPagoGateway('enc-token')
}

beforeEach(() => {
  search.mockReset()
})

describe('searchPaymentsByReference — paginación', () => {
  it('trae las páginas siguientes cuando MercadoPago dice que hay más', async () => {
    search
      .mockResolvedValueOnce({
        paging: { total: 5, limit: 2, offset: 0 },
        results: [pago(1), pago(2)],
      })
      .mockResolvedValueOnce({
        paging: { total: 5, limit: 2, offset: 2 },
        results: [pago(3), pago(4)],
      })
      .mockResolvedValueOnce({ paging: { total: 5, limit: 2, offset: 4 }, results: [pago(5)] })

    const res = await gateway().searchPaymentsByReference(TENANT)

    expect(res.map((p) => p.mpPaymentId)).toEqual(['1', '2', '3', '4', '5'])
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('la PRIMERA llamada va sin offset: el tamaño de página lo decide MercadoPago', async () => {
    // Deliberado no elegir un `limit` nosotros — uno inventado puede caer fuera
    // de lo que el endpoint acepta, y no se puede verificar sin credenciales reales.
    search.mockResolvedValue({ paging: { total: 1, limit: 30, offset: 0 }, results: [pago(1)] })

    await gateway().searchPaymentsByReference(TENANT)

    expect(search).toHaveBeenCalledTimes(1)
    const opciones = search.mock.calls[0]?.[0]?.options as Record<string, unknown>
    expect(opciones).not.toHaveProperty('offset')
    expect(opciones).toMatchObject({ external_reference: TENANT, sort: 'date_created' })
  })

  it('pide la siguiente página por offset, desde lo ya acumulado', async () => {
    search
      .mockResolvedValueOnce({
        paging: { total: 3, limit: 2, offset: 0 },
        results: [pago(1), pago(2)],
      })
      .mockResolvedValueOnce({ paging: { total: 3, limit: 2, offset: 2 }, results: [pago(3)] })

    await gateway().searchPaymentsByReference(TENANT)

    expect((search.mock.calls[1]?.[0]?.options as Record<string, unknown>)['offset']).toBe(2)
  })

  it('no pide una segunda página si la primera ya trajo todo', async () => {
    search.mockResolvedValue({
      paging: { total: 2, limit: 30, offset: 0 },
      results: [pago(1), pago(2)],
    })

    const res = await gateway().searchPaymentsByReference(TENANT)

    expect(res).toHaveLength(2)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('degrada a una sola página si MercadoPago no informa `paging`', async () => {
    search.mockResolvedValue({ results: [pago(1)] })

    const res = await gateway().searchPaymentsByReference(TENANT)

    expect(res).toHaveLength(1)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('corta si MercadoPago devuelve una página vacía sin llegar al total', async () => {
    // `total` y resultados que no coinciden: seguir pidiendo el mismo offset no
    // va a traer nada nuevo. Devuelve lo que sí consiguió, no gira para siempre.
    search
      .mockResolvedValueOnce({ paging: { total: 99, limit: 1, offset: 0 }, results: [pago(1)] })
      .mockResolvedValueOnce({ paging: { total: 99, limit: 1, offset: 1 }, results: [] })

    const res = await gateway().searchPaymentsByReference(TENANT)

    expect(res).toHaveLength(1)
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('respeta un tope de páginas si el total de MercadoPago es inconsistente', async () => {
    search.mockResolvedValue({
      paging: { total: 1_000_000, limit: 1, offset: 0 },
      results: [pago(1)],
    })

    await gateway().searchPaymentsByReference(TENANT)

    expect(search.mock.calls.length).toBeLessThanOrEqual(20)
  })
})
