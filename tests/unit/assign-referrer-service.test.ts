import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  selectRows: [] as unknown[],
  updateRows: [] as unknown[],
}))

vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => h.selectRows,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => h.updateRows,
        }),
      }),
    }),
  })),
}))

import { assignReferrer } from '@/modules/referrals/referral.service'

const REFERRER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const REFERRER_ROW = [{ id: REFERRER_ID, name: 'Canchas del Sur' }]

describe('assignReferrer', () => {
  it('código o link válido y elegible → asigna y devuelve el nombre del referidor', async () => {
    h.selectRows = REFERRER_ROW
    h.updateRows = [{ id: TENANT_ID }]

    const result = await assignReferrer(TENANT_ID, 'https://turnogol.app/r/AH2K9MZP')

    expect(result).toEqual({ ok: true, referrerName: 'Canchas del Sur' })
  })

  it('código pelado (sin URL) también funciona', async () => {
    h.selectRows = REFERRER_ROW
    h.updateRows = [{ id: TENANT_ID }]

    const result = await assignReferrer(TENANT_ID, 'ah2k9mzp')

    expect(result).toEqual({ ok: true, referrerName: 'Canchas del Sur' })
  })

  it('código con formato inválido → invalid_code, sin tocar la DB', async () => {
    const result = await assignReferrer(TENANT_ID, 'no es un código')
    expect(result).toEqual({ ok: false, reason: 'invalid_code' })
  })

  it('código inexistente → invalid_code', async () => {
    h.selectRows = []
    const result = await assignReferrer(TENANT_ID, 'AH2K9MZP')
    expect(result).toEqual({ ok: false, reason: 'invalid_code' })
  })

  it('el propio tenant como referidor → self, sin llegar al UPDATE', async () => {
    h.selectRows = [{ id: TENANT_ID, name: 'Este Complejo' }]
    h.updateRows = [{ id: TENANT_ID }] // si el UPDATE corriera, "ganaría" — probamos que no

    const result = await assignReferrer(TENANT_ID, 'AH2K9MZP')

    expect(result).toEqual({ ok: false, reason: 'self' })
  })

  it('0 filas afectadas (ya tiene referidor / premio en curso / fuera de promo) → not_eligible', async () => {
    h.selectRows = REFERRER_ROW
    h.updateRows = []

    const result = await assignReferrer(TENANT_ID, 'AH2K9MZP')

    expect(result).toEqual({ ok: false, reason: 'not_eligible' })
  })
})
