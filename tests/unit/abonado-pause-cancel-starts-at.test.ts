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

beforeEach(() => {
  vi.clearAllMocks()
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
