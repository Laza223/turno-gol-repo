import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { installZodLocale } from '@/shared/validation/zod-locale'
import { boundedText } from '@/shared/validation/primitives'
import { createTenantSchema } from '@/modules/tenants/tenant.schema'
import { createCourtSchema } from '@/modules/courts/court.schema'

/**
 * 🔴 QA 2026-08-13 — mensajes de validación en inglés en 6 formularios distintos.
 *
 * El agujero que dejó pasar el bug: `tests/setup.ts` llama `installZodLocale()`,
 * así que en tests TODO sale en español y CI nunca vio el problema — mientras en
 * runtime el locale global no llega a la copia de zod de los schemas de la app
 * (medición completa en el docstring de `zod-locale.ts`).
 *
 * Por eso este archivo fuerza el locale INGLÉS: cualquier mensaje en español que
 * salga acá viene del `message` explícito del schema, que es la única garantía
 * real. Se restaura el locale del repo al terminar para no contaminar el resto
 * de la suite.
 */
beforeAll(() => {
  z.config(z.locales.en())
})
afterAll(() => {
  installZodLocale()
})

function firstMessage(result: z.ZodSafeParseResult<unknown>): string {
  return result.success ? '' : (result.error.issues[0]?.message ?? '')
}

describe('mensajes de Zod en español sin depender del locale global', () => {
  it('el locale forzado a inglés es efectivo (control negativo del propio test)', () => {
    const msg = firstMessage(z.string().max(3).safeParse('abcd'))
    expect(msg).toContain('Too big')
  })

  it('boundedText trae su propio mensaje', () => {
    expect(firstMessage(boundedText(40).safeParse('x'.repeat(41)))).toBe('Máximo 40 caracteres')
  })

  it('el nombre del complejo pasado de largo avisa en español (onboarding paso 1)', () => {
    const msg = firstMessage(
      createTenantSchema.safeParse({
        name: 'x'.repeat(101),
        address: 'Una dirección válida',
        city: 'Rosario',
        province: 'Santa Fe',
        phone: '3415551234',
        email: 'a@b.com',
      }),
    )
    expect(msg).toBe('Máximo 100 caracteres')
  })

  it('el nombre de cancha pasado de largo avisa en español', () => {
    const msg = firstMessage(
      createCourtSchema.safeParse({
        name: 'x'.repeat(101),
        surfaceType: 'synthetic_grass',
        isCovered: false,
        format: 5,
        pricing: { rules: [{ days: ['mon'], from: '08:00', to: '23:00', price: 100000 }] },
      }),
    )
    expect(msg).toBe('Máximo 100 caracteres')
  })
})
