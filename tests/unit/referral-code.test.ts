import { describe, expect, it, vi } from 'vitest'
import {
  extractReferralCode,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  referralCodeSchema,
} from '@/modules/referrals/referral.schema'

// `getDb` no debe llamarse nunca en el camino de formato inválido: si
// `resolveReferralCode` lo tocara, este mock explotaría el test.
vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(() => {
    throw new Error('getDb() no debería llamarse con un código de formato inválido')
  }),
}))

import { generateReferralCode } from '@/modules/referrals/referral.service'
import { resolveReferralCode } from '@/modules/referrals/referral.service'

describe('generateReferralCode', () => {
  it('genera códigos de la longitud esperada', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateReferralCode()).toHaveLength(REFERRAL_CODE_LENGTH)
    }
  })

  it('usa solo caracteres del alfabeto sin ambiguos', () => {
    const allowed = new Set(REFERRAL_CODE_ALPHABET.split(''))
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode()
      for (const char of code) {
        expect(allowed.has(char), `carácter fuera de alfabeto: ${char}`).toBe(true)
      }
    }
  })

  it('lo que genera siempre pasa la validación del schema', () => {
    for (let i = 0; i < 50; i++) {
      expect(referralCodeSchema.safeParse(generateReferralCode()).success).toBe(true)
    }
  })
})

describe('referralCodeSchema', () => {
  it('rechaza minúsculas', () => {
    expect(referralCodeSchema.safeParse('abcdefgh').success).toBe(false)
  })

  it('rechaza largo distinto de 8', () => {
    expect(referralCodeSchema.safeParse('ABCDEFG').success).toBe(false)
    expect(referralCodeSchema.safeParse('ABCDEFGHJ').success).toBe(false)
  })

  it('rechaza caracteres ambiguos (I, L, O, 0, 1)', () => {
    for (const ambiguous of ['I', 'L', 'O', '0', '1']) {
      const code = `ABCDEFG${ambiguous}`
      expect(referralCodeSchema.safeParse(code).success, `debería rechazar ${ambiguous}`).toBe(
        false,
      )
    }
  })

  it('acepta un código válido de ejemplo', () => {
    expect(referralCodeSchema.safeParse('AH2K9MZP').success).toBe(true)
  })
})

describe('extractReferralCode (B2: "Asignar referidor" del super-admin)', () => {
  it('código pelado en minúsculas → normalizado a mayúsculas', () => {
    expect(extractReferralCode('ah2k9mzp')).toBe('AH2K9MZP')
  })

  it('link completo de la landing → extrae el código', () => {
    expect(extractReferralCode('https://turnogol.app/r/AH2K9MZP')).toBe('AH2K9MZP')
  })

  it('link con barra final → extrae el código igual', () => {
    expect(extractReferralCode('https://turnogol.app/r/AH2K9MZP/')).toBe('AH2K9MZP')
  })

  it('link sin protocolo → extrae el código igual', () => {
    expect(extractReferralCode('turnogol.app/r/AH2K9MZP')).toBe('AH2K9MZP')
  })

  it('texto vacío o que no matchea ningún formato → null', () => {
    expect(extractReferralCode('')).toBeNull()
    expect(extractReferralCode('   ')).toBeNull()
    expect(extractReferralCode('no es un código')).toBeNull()
  })
})

describe('resolveReferralCode — formato inválido', () => {
  it('devuelve null sin tocar la DB', async () => {
    await expect(resolveReferralCode('minuscula')).resolves.toBeNull()
    await expect(resolveReferralCode('')).resolves.toBeNull()
    await expect(resolveReferralCode('AAAAAAAI')).resolves.toBeNull()
  })
})
