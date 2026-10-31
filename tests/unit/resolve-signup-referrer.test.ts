import { describe, expect, it, vi } from 'vitest'

// `resolveSignupReferrer` llama a `resolveReferralCode`, que pasa por
// `getDb().select()...` — mismo patrón de mock que referral-code.test.ts.
const h = vi.hoisted(() => ({ selectRows: [] as unknown[] }))

vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => h.selectRows,
        }),
      }),
    }),
  })),
}))

import { resolveSignupReferrer } from '@/modules/referrals/referral.service'

const REFERRER_ID = '11111111-1111-4111-8111-111111111111'
const REFERRER_ROW = [{ id: REFERRER_ID, name: 'Canchas del Sur' }]

describe('resolveSignupReferrer', () => {
  it('código válido y existente → id del referidor', async () => {
    h.selectRows = REFERRER_ROW
    const result = await resolveSignupReferrer({
      code: 'AH2K9MZP',
    })
    expect(result).toBe(REFERRER_ID)
  })

  it('sin código → null', async () => {
    const result = await resolveSignupReferrer({ code: null })
    expect(result).toBeNull()
  })

  it('código con formato inválido → null (resolveReferralCode lo rechaza antes de tocar la DB)', async () => {
    h.selectRows = REFERRER_ROW // si igual tocara la DB, devolvería un id — probamos que no llega
    const result = await resolveSignupReferrer({
      code: 'minuscula',
    })
    expect(result).toBeNull()
  })

  it('código inexistente → null', async () => {
    h.selectRows = []
    const result = await resolveSignupReferrer({
      code: 'AH2K9MZP',
    })
    expect(result).toBeNull()
  })

  it('referidor === tenant que se está creando → null (defensa además del CHECK de la DB)', async () => {
    h.selectRows = REFERRER_ROW
    const result = await resolveSignupReferrer({
      code: 'AH2K9MZP',
      excludeTenantId: REFERRER_ID,
    })
    expect(result).toBeNull()
  })
})
