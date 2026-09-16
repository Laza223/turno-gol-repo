import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hallazgo #4 (campaña de mutación, docs/qa/TEST_AUDIT.md), decisión de
// producto confirmada por el dueño (recomendación aplicada: cortar por
// `starts_at >= NOW()`, la regla explícita de CLAUDE.md — "bookings.starts_at
// /ends_at (TIMESTAMPTZ) = fuente única para lógica fuerte", NO el día
// operativo del complejo, que es el criterio de caja/cantina, no de bookings).
//
// pauseAbonado/cancelAbonado borraban las sesiones futuras del abonado con
// `date >= hoy` — una sesión jugada HOY a las 09:00 sigue en 'confirmed'
// hasta que el trigger de 24h la mueva, así que pausar/cancelar a las 15:00
// la borraba igual. Este test verifica el SQL efectivamente enviado a la DB.

type StringChunkLike = { value: string[] }
function isStringChunk(c: unknown): c is StringChunkLike {
  return !!c && typeof c === 'object' && Array.isArray((c as StringChunkLike).value)
}
function sqlText(sqlObj: unknown): string {
  const chunks = (sqlObj as { queryChunks: unknown[] }).queryChunks
  return chunks.map((c) => (isStringChunk(c) ? c.value.join('') : '?')).join('')
}
function sqlValues(sqlObj: unknown): unknown[] {
  const chunks = (sqlObj as { queryChunks: unknown[] }).queryChunks
  return chunks.filter((c) => !isStringChunk(c))
}

vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))

import { pauseAbonado, cancelAbonado } from '@/modules/abonados/abonado.service'
import type { DbTx } from '@/shared/db/client'

const ABONADO_ROW = {
  id: 'abonado-1',
  tenantId: 'tenant-1',
  courtId: 'court-1',
  playerId: null,
  contactName: 'Juan',
  contactPhone: '+5491100000000',
  dayOfWeek: 1,
  timeStart: '20:00',
  timeEnd: '21:00',
  pricePerSession: 500000,
  startsOn: new Date('2026-01-01'),
  endsOn: null,
  status: 'active' as const,
  paymentMethod: 'cash' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeTx(onDelete: (arg: unknown) => void): DbTx {
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([ABONADO_ROW]),
      }),
    }),
  }))
  const update = vi.fn(() => ({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([ABONADO_ROW]),
      }),
    }),
  }))
  const execute = vi.fn((arg: unknown) => {
    onDelete(arg)
    return Promise.resolve([])
  })
  return { select, update, execute } as unknown as DbTx
}

let captured: unknown

function makeTxCapturing(): DbTx {
  return makeTx((arg) => {
    captured = arg
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  captured = undefined
})

describe('pauseAbonado — el DELETE de sesiones futuras nunca toca una ya jugada', () => {
  it('el SQL liga starts_at >= NOW() además de date >= hoy', async () => {
    let captured: unknown
    const tx = makeTx((arg) => {
      captured = arg
    })

    await pauseAbonado('tenant-1', 'abonado-1', 'staff-1', tx)

    expect(captured).toBeDefined()
    expect(sqlText(captured)).toMatch(/starts_at/)
  })
})

describe('cancelAbonado — el DELETE de sesiones futuras nunca toca una ya jugada', () => {
  it('el SQL liga starts_at >= NOW() además de date >= fromDate', async () => {
    let captured: unknown
    const tx = makeTx((arg) => {
      captured = arg
    })

    await cancelAbonado('tenant-1', 'abonado-1', '2026-09-03', 'staff-1', tx)

    expect(captured).toBeDefined()
    expect(sqlText(captured)).toMatch(/starts_at/)
  })
})

// El corte se liga como parámetro desde JS y NO como `NOW()` de Postgres: la
// otra mitad del WHERE ya sale del reloj de la app (`artToday()`), y mezclar
// los dos relojes rompe todo test que simule el tiempo — `vi.setSystemTime`
// congela el de JS y no el del server. Lo cazó el CI: el caso de las 22:00 ART
// en tests/integration/abonados.test.ts quedaba con la reserva viva porque
// `NOW()` real ubicaba la fecha simulada meses en el pasado.
describe('el corte de tiempo usa UN SOLO reloj, el de la app', () => {
  it.each([
    ['pauseAbonado', () => pauseAbonado('tenant-1', 'abonado-1', 'staff-1', makeTxCapturing())],
    [
      'cancelAbonado',
      () => cancelAbonado('tenant-1', 'abonado-1', '2026-06-15', 'staff-1', makeTxCapturing()),
    ],
  ])('%s liga el instante simulado, no NOW() del server', async (_name, run) => {
    captured = undefined
    vi.setSystemTime(new Date('2026-06-16T01:00:00.000Z'))
    try {
      await run()

      expect(captured).toBeDefined()
      // Sin `NOW()` en el texto: si estuviera, el reloj de Postgres decidiría.
      expect(sqlText(captured)).not.toMatch(/NOW\(\)/)
      // Y el instante simulado viaja como parámetro.
      expect(sqlValues(captured)).toContain('2026-06-16T01:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })
})
