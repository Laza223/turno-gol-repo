import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ updateTenantSettings: vi.fn() }))
vi.mock('@/modules/courts/court.service', () => ({
  createCourt: vi.fn(),
  getCourtCountAndBilled: vi.fn(),
  listCourts: vi.fn(),
  updateCourt: vi.fn(),
  validatePricingRulesCoverage: vi.fn(),
}))
vi.mock('@/modules/billing/billing.service', () => ({ changeBilledCourts: vi.fn() }))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: vi.fn() }))

import {
  WIZARD_STEPS,
  pathAfterStep,
  stepFromPathname,
  stepFromSlug,
  stepPath,
} from '@/modules/onboarding/onboarding.steps'
import {
  isWizardComplete,
  readDraftCounts,
  readDraftPrices,
  resolveWizardStep,
  stepToStore,
} from '@/modules/onboarding/onboarding.service'
import { LAST_WIZARD_STEP } from '@/modules/onboarding/onboarding.types'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

const settings = (partial: Partial<TenantSettings>) => partial as TenantSettings

describe('WIZARD_STEPS', () => {
  it('son 5 pasos persistidos, en orden: complejo, canchas, horarios, precios, tu-complejo', () => {
    expect(WIZARD_STEPS.map((s) => s.slug)).toEqual([
      'complejo',
      'canchas',
      'horarios',
      'precios',
      'tu-complejo',
    ])
    expect(WIZARD_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5])
    expect(LAST_WIZARD_STEP).toBe(5)
  })

  it('stepPath y stepFromSlug son inversas', () => {
    for (const s of WIZARD_STEPS) {
      expect(stepPath(s.n)).toBe(`/onboarding/${s.slug}`)
      expect(stepFromSlug(s.slug)).toBe(s.n)
    }
    expect(stepFromSlug('reserva')).toBeNull()
    expect(stepPath(99)).toBe('/onboarding')
  })
})

describe('stepFromPathname', () => {
  it('mapea cada ruta a su paso', () => {
    expect(stepFromPathname('/onboarding/canchas')).toBe(2)
    expect(stepFromPathname('/onboarding/tu-complejo')).toBe(5)
  })

  it('resumen y listo son el cierre (6); /onboarding pelado cae en 1', () => {
    expect(stepFromPathname('/onboarding/resumen')).toBe(6)
    expect(stepFromPathname('/onboarding/listo')).toBe(6)
    expect(stepFromPathname('/onboarding')).toBe(1)
  })
})

describe('resolveWizardStep: onboarding_step es el ÚLTIMO paso completado', () => {
  it('un tenant recién creado (1) o del alta asistida aterriza en Canchas', () => {
    expect(resolveWizardStep(settings({ onboarding_step: 1 }))).toBe(2)
    expect(resolveWizardStep(settings({}))).toBe(2)
  })

  it('avanza al siguiente y se queda en 5 con los 5 hechos', () => {
    expect(resolveWizardStep(settings({ onboarding_step: 2 }))).toBe(3)
    expect(resolveWizardStep(settings({ onboarding_step: 4 }))).toBe(5)
    expect(resolveWizardStep(settings({ onboarding_step: 5 }))).toBe(5)
  })

  it('wizard viejo, step 2 (horarios hechos): cae en Horarios del orden nuevo', () => {
    expect(stepPath(resolveWizardStep(settings({ onboarding_step: 2 })))).toBe(
      '/onboarding/horarios',
    )
  })

  it('wizard viejo, step 3 (canchas creadas): cae en Precios', () => {
    expect(stepPath(resolveWizardStep(settings({ onboarding_step: 3 })))).toBe(
      '/onboarding/precios',
    )
  })
})

describe('isWizardComplete / stepToStore', () => {
  it('el resumen solo se abre con los 5 pasos hechos', () => {
    expect(isWizardComplete(settings({ onboarding_step: 4 }))).toBe(false)
    expect(isWizardComplete(settings({ onboarding_step: 5 }))).toBe(true)
    expect(isWizardComplete(settings({}))).toBe(false)
  })

  it('Complejo, Precios y Tu complejo nunca bajan el paso guardado', () => {
    expect(stepToStore(settings({ onboarding_step: 5 }), 1)).toBe(5)
    expect(stepToStore(settings({ onboarding_step: 5 }), 4)).toBe(5)
    expect(stepToStore(settings({ onboarding_step: 3 }), 4)).toBe(4)
    expect(stepToStore(settings({ onboarding_step: 4 }), 5)).toBe(5)
  })

  it('guardar Canchas u Horarios baja el paso a ese paso: Precios vuelve a ser obligatorio', () => {
    expect(stepToStore(settings({ onboarding_step: 5 }), 2)).toBe(2)
    expect(stepToStore(settings({ onboarding_step: 5 }), 3)).toBe(3)
    expect(stepToStore(settings({}), 2)).toBe(2)
    const lowered = settings({ onboarding_step: stepToStore(settings({ onboarding_step: 5 }), 3) })
    expect(isWizardComplete(lowered)).toBe(false)
    expect(stepPath(resolveWizardStep(lowered))).toBe('/onboarding/precios')
  })
})

describe('pathAfterStep', () => {
  it('normalmente va al siguiente paso', () => {
    expect(pathAfterStep(1, 1)).toBe('/onboarding/canchas')
    expect(pathAfterStep(2, 2)).toBe('/onboarding/horarios')
    expect(pathAfterStep(3, 2)).toBe('/onboarding/precios')
    expect(pathAfterStep(4, 3)).toBe('/onboarding/tu-complejo')
  })

  it('el último paso va al resumen', () => {
    expect(pathAfterStep(5, 4)).toBe('/onboarding/resumen')
  })

  it('con los 5 hechos, editar Complejo o Precios vuelve al resumen', () => {
    expect(pathAfterStep(1, 5)).toBe('/onboarding/resumen')
    expect(pathAfterStep(4, 5)).toBe('/onboarding/resumen')
  })

  it('con los 5 hechos, cambiar Canchas u Horarios pasa de nuevo por Precios', () => {
    expect(pathAfterStep(2, 5)).toBe('/onboarding/horarios')
    expect(pathAfterStep(3, 5)).toBe('/onboarding/precios')
  })
})

describe('readDraftCounts / readDraftPrices (tenants del wizard viejo)', () => {
  const rule = (price: number) => ({ days: ['mon'], from: '08:00', to: '00:00', price })

  it('usa el borrador si existe', () => {
    expect(readDraftCounts(settings({ onboarding_draft_courts: { '5': 2 } }), [])).toEqual({
      '5': 2,
    })
  })

  it('sin borrador, deduce la cantidad de las canchas existentes y cuenta todos los formatos', () => {
    const courts = [{ format: 5 }, { format: 5 }, { format: 7 }, { format: 9 }]
    expect(readDraftCounts(settings({}), courts)).toEqual({ '5': 2, '7': 1, '9': 1 })
  })

  it('sin borrador, deduce el precio de la primera cancha de cada formato', () => {
    const courts = [
      { format: 5, pricing: { rules: [rule(6_000_000)] } },
      { format: 5, pricing: { rules: [rule(9_000_000)] } },
      { format: 7, pricing: { rules: [] } },
    ]
    expect(readDraftPrices(settings({}), courts)).toEqual({ '5': { dayPrice: 6_000_000 } })
  })

  it('usa los precios guardados si existen', () => {
    const saved = { '5': { dayPrice: 1, nightPrice: 2 } }
    expect(readDraftPrices(settings({ onboarding_draft_prices: saved }), [])).toBe(saved)
  })
})
