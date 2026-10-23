import { describe, expect, it } from 'vitest'
import { listInvoices } from '@/modules/billing/billing.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { buildSaasPlusRef, type GatewayPaymentInfo } from '@/modules/payments/payment.types'

// LI1 — el pago único de Plus (`saas-plus:<tenantId>`) aparece en el historial
// una sola vez, marcado aparte, sin duplicar los cobros del débito.

const TENANT = 'tenant-x'

const pay = (
  id: string,
  dateCreated: string | undefined,
  amount = 10_000_000,
): GatewayPaymentInfo => ({
  mpPaymentId: id,
  status: 'approved',
  amount,
  externalReference: 'x',
  paymentMethodId: 'account_money',
  dateCreated,
})

describe('listInvoices — pago de Plus (LI1)', () => {
  it('el pago saas-plus aparece una vez con kind plus_prorate; los del débito siguen con kind subscription', async () => {
    const gw = new MockGateway()
    gw.searchResults[TENANT] = [pay('d-1', '2027-02-01T10:00:00.000-03:00')]
    gw.searchResults[buildSaasPlusRef(TENANT)] = [
      pay('p-1', '2027-03-01T10:00:00.000-03:00', 18_000_000),
    ]

    const invoices = await listInvoices(TENANT, gw)

    expect(gw.searchCalls).toEqual([TENANT, buildSaasPlusRef(TENANT)])
    expect(invoices.map((i) => [i.mpPaymentId, i.kind])).toEqual([
      ['p-1', 'plus_prorate'],
      ['d-1', 'subscription'],
    ])
    expect(invoices[0]!.amount).toBe(18_000_000)
  })

  it('si MP devolviera el mismo pago en las dos búsquedas, sale una sola vez (gana el del débito)', async () => {
    const gw = new MockGateway()
    gw.searchResults[TENANT] = [pay('same', '2027-02-01T10:00:00.000-03:00')]
    gw.searchResults[buildSaasPlusRef(TENANT)] = [pay('same', '2027-02-01T10:00:00.000-03:00')]

    const invoices = await listInvoices(TENANT, gw)

    expect(invoices).toHaveLength(1)
    expect(invoices[0]!.kind).toBe('subscription')
  })

  it('ordena por fecha, más nuevo primero, y deja los sin fecha al final', async () => {
    const gw = new MockGateway()
    gw.searchResults[TENANT] = [
      pay('d-viejo', '2027-01-01T10:00:00.000-03:00'),
      pay('d-sin-fecha', undefined),
    ]
    gw.searchResults[buildSaasPlusRef(TENANT)] = [pay('p-medio', '2027-02-01T10:00:00.000-03:00')]

    const invoices = await listInvoices(TENANT, gw)

    expect(invoices.map((i) => i.mpPaymentId)).toEqual(['p-medio', 'd-viejo', 'd-sin-fecha'])
  })

  it('si falla la segunda búsqueda devuelve el historial del débito', async () => {
    const gw = new MockGateway()
    gw.searchResults[TENANT] = [pay('d-1', '2027-02-01T10:00:00.000-03:00')]
    const original = gw.searchPaymentsByReference.bind(gw)
    gw.searchPaymentsByReference = async (ref: string) => {
      if (ref === buildSaasPlusRef(TENANT)) throw new Error('MP caído')
      return original(ref)
    }

    const invoices = await listInvoices(TENANT, gw)

    expect(invoices.map((i) => [i.mpPaymentId, i.kind])).toEqual([['d-1', 'subscription']])
  })

  it('si falla la primera búsqueda sigue lanzando (la page ya degrada a [])', async () => {
    const gw = new MockGateway()
    gw.searchPaymentsByReference = async () => {
      throw new Error('MP caído')
    }
    await expect(listInvoices(TENANT, gw)).rejects.toThrow('MP caído')
  })
})
