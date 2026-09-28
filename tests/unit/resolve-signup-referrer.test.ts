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
import { REFERRAL_PROMO_ENDS_AT } from '@/shared/constants'

const REFERRER_ID = '11111111-1111-4111-8111-111111111111'
const REFERRER_ROW = [{ id: REFERRER_ID, name: 'Canchas del Sur' }]

// El ÚLTIMO instante dentro de la promo y el PRIMERO fuera de ella
// (REFERRAL_PROMO_ENDS_AT = 2026-10-31 23:59:59.999 ART = 2026-11-01T02:59:59.999Z).
const INSIDE_PROMO = new Date(REFERRAL_PROMO_ENDS_AT.getTime())
const OUTSIDE_PROMO = new Date(REFERRAL_PROMO_ENDS_AT.getTime() + 1)

describe('resolveSignupReferrer', () => {
  it('código válido y existente dentro de la promo → id del referidor', async () => {
    h.selectRows = REFERRER_ROW
    const result = await resolveSignupReferrer({
      code: 'AH2K9MZP',
      staffCreatedAt: INSIDE_PROMO,
    })
    expect(result).toBe(REFERRER_ID)
  })

  it('sin código → null', async () => {
    const result = await resolveSignupReferrer({ code: null, staffCreatedAt: INSIDE_PROMO })
    expect(result).toBeNull()
  })

  it('código con formato inválido → null (resolveReferralCode lo rechaza antes de tocar la DB)', async () => {
    h.selectRows = REFERRER_ROW // si igual tocara la DB, devolvería un id — probamos que no llega
    const result = await resolveSignupReferrer({
      code: 'minuscula',
      staffCreatedAt: INSIDE_PROMO,
    })
    expect(result).toBeNull()
  })

  it('código inexistente → null', async () => {
    h.selectRows = []
    const result = await resolveSignupReferrer({
      code: 'AH2K9MZP',
      staffCreatedAt: INSIDE_PROMO,
    })
    expect(result).toBeNull()
  })

  it('cuenta creada dentro de la promo (2026-10-31 23:59:59.999 ART) → sí atribuye', async () => {
    h.selectRows = REFERRER_ROW
    const result = await resolveSignupReferrer({ code: 'AH2K9MZP', staffCreatedAt: INSIDE_PROMO })
    expect(result).toBe(REFERRER_ID)
  })

  it('cuenta creada después del corte (2026-11-01 00:00:00.000 ART) → no atribuye', async () => {
    h.selectRows = REFERRER_ROW
    const result = await resolveSignupReferrer({ code: 'AH2K9MZP', staffCreatedAt: OUTSIDE_PROMO })
    expect(result).toBeNull()
  })

  it('referidor === tenant que se está creando → null (defensa además del CHECK de la DB)', async () => {
    h.selectRows = REFERRER_ROW
    const result = await resolveSignupReferrer({
      code: 'AH2K9MZP',
      staffCreatedAt: INSIDE_PROMO,
      excludeTenantId: REFERRER_ID,
    })
    expect(result).toBeNull()
  })
})
