import { beforeEach, describe, expect, it, vi } from 'vitest'

// `listClientsForExport` recorre `listTenantClients` (OFFSET, una lectura por
// página). Mockeamos esa lista para fabricar el borde que en la DB depende de
// una reserva concurrente: un cliente que sube a una página ya leída.
vi.mock('@/app/(admin)/jugadores/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(admin)/jugadores/queries')>()),
  listTenantClients: vi.fn(),
}))

import { CLIENTES_PAGE_SIZE, listTenantClients } from '@/app/(admin)/jugadores/queries'
import { listClientsForExport } from '@/app/(admin)/settings/datos/queries'
import type { DbTx } from '@/shared/db/client'

type Page = Awaited<ReturnType<typeof listTenantClients>>

const client = (key: string): Page['rows'][number] => ({
  key,
  kind: 'player',
  playerId: key,
  name: `Cliente ${key}`,
  email: null,
  phone: null,
  bookingsCount: 1,
  noshowCount: 0,
  lastBookingAt: '2026-10-01',
  lastActiveAt: null,
  tags: [],
  fixedCount: 0,
  suggestedPlayerId: null,
  suggestedPlayerName: null,
  lastActiveAt: null,
})

const keys = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => client(`k${from + i}`))

/** Sirve las páginas en orden, cada una con el total que diría la query. */
function serve(pages: Array<Page['rows']>, total: number) {
  for (const rows of pages)
    vi.mocked(listTenantClients).mockResolvedValueOnce({ rows, total, dormantTotal: 0 })
}

const tx = {} as DbTx

beforeEach(() => {
  vi.mocked(listTenantClients).mockReset()
})

describe('listClientsForExport', () => {
  it('recorre todas las páginas hasta la que viene corta', async () => {
    const total = CLIENTES_PAGE_SIZE * 2 + 3
    serve(
      [
        keys(0, CLIENTES_PAGE_SIZE),
        keys(CLIENTES_PAGE_SIZE, CLIENTES_PAGE_SIZE * 2),
        keys(CLIENTES_PAGE_SIZE * 2, total),
      ],
      total,
    )
    const out = await listClientsForExport('tenant-1', tx)
    expect(out).toHaveLength(total)
    expect(vi.mocked(listTenantClients).mock.calls.map(([, , , page]) => page)).toEqual([0, 1, 2])
  })

  it('con un total justo en el borde, la página vacía no lo pisa con 0', async () => {
    serve([keys(0, CLIENTES_PAGE_SIZE)], CLIENTES_PAGE_SIZE)
    vi.mocked(listTenantClients).mockResolvedValueOnce({ rows: [], total: 0, dormantTotal: 0 })
    expect(await listClientsForExport('tenant-1', tx)).toHaveLength(CLIENTES_PAGE_SIZE)
    expect(listTenantClients).toHaveBeenCalledTimes(2)
  })

  it('sin clientes devuelve vacío', async () => {
    serve([[]], 0)
    expect(await listClientsForExport('tenant-1', tx)).toEqual([])
  })

  it('si un cliente sube a una página ya leída, vuelve a recorrer y no lo pierde', async () => {
    const total = CLIENTES_PAGE_SIZE + 10
    const movedUp = client('reservó-recién')
    // Primera vuelta: el que reservó estaba en la página 2 y, entre una
    // lectura y otra, pasó a la 1. La página 2 arranca con la última fila de
    // la 1 repetida y a él no lo trae nadie.
    const firstPage = keys(0, CLIENTES_PAGE_SIZE)
    const shifted = [firstPage.at(-1)!, ...keys(CLIENTES_PAGE_SIZE, total - 1)]
    serve([firstPage, shifted], total)
    // Segunda vuelta: ya quieto, en la página 1.
    serve(
      [[movedUp, ...keys(0, CLIENTES_PAGE_SIZE - 1)], keys(CLIENTES_PAGE_SIZE - 1, total - 1)],
      total,
    )

    const out = await listClientsForExport('tenant-1', tx)
    expect(out).toHaveLength(total)
    expect(new Set(out.map((c) => c.name)).size).toBe(total)
    expect(out.map((c) => c.name)).toContain('Cliente reservó-recién')
  })

  it('si entre vueltas cambia la clave de una persona, no la saca dos veces', async () => {
    // Primera vuelta: falta una fila (salteada por el OFFSET). Entre vueltas
    // le editaron el teléfono a un contacto sin cuenta, que es su clave.
    serve([[client('tel-viejo'), client('b')]], 3)
    serve([[client('tel-nuevo'), client('b'), client('c')]], 3)

    const out = await listClientsForExport('tenant-1', tx)
    expect(out.map((c) => c.name)).toEqual(['Cliente tel-nuevo', 'Cliente b', 'Cliente c'])
  })

  it('si en ninguna vuelta cierra el total, falla en vez de entregar un archivo con menos', async () => {
    vi.mocked(listTenantClients).mockResolvedValue({ rows: keys(0, 3), total: 4, dormantTotal: 0 })
    await expect(listClientsForExport('tenant-1', tx)).rejects.toThrow(
      'La lista de clientes cambió mientras se exportaba',
    )
    expect(listTenantClients).toHaveBeenCalledTimes(3)
  })
})
