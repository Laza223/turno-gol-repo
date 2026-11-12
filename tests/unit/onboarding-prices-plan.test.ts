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

import { planWizardCourts } from '@/modules/onboarding/onboarding.service'
import { buildUniformWeek } from '@/modules/onboarding/onboarding.service'
import {
  wizardCourtCountsSchema,
  wizardPricesSchema,
  wizardProfileSchema,
  wizardScheduleSchema,
} from '@/modules/onboarding/onboarding.schema'
import { uniformRulesFromOpeningHours } from '@/modules/courts/pricing-grid'

const week = buildUniformWeek(8, 0)
const TENANT = { openingHours: week.openingHours, closesNextDay: week.closesNextDay }
const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

describe('planWizardCourts', () => {
  it('numera "Cancha 1…N" en todo el complejo, formatos de menor a mayor', () => {
    const plan = planWizardCourts(TENANT, {
      formats: [
        { format: 7, count: 1, dayPrice: 8_000_000 },
        { format: 5, count: 2, dayPrice: 6_000_000 },
      ],
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.courts.map((c) => [c.name, c.format])).toEqual([
      ['Cancha 1', 5],
      ['Cancha 2', 5],
      ['Cancha 3', 7],
    ])
  })

  it('sin precio de noche arma reglas uniformes', () => {
    const plan = planWizardCourts(TENANT, {
      formats: [{ format: 5, count: 1, dayPrice: 6_000_000 }],
    })
    expect(plan.ok && plan.courts[0]?.rules).toEqual(
      uniformRulesFromOpeningHours(TENANT.openingHours, false, 6_000_000),
    )
  })

  it('un precio de noche igual al de día también es uniforme', () => {
    const plan = planWizardCourts(TENANT, {
      formats: [{ format: 5, count: 1, dayPrice: 6_000_000, nightPrice: 6_000_000 }],
      cutHour: 18,
    })
    expect(plan.ok && plan.courts[0]?.rules).toHaveLength(1)
  })

  it('con precio de noche parte el día en el corte (18 por defecto)', () => {
    const plan = planWizardCourts(TENANT, {
      formats: [{ format: 5, count: 1, dayPrice: 6_000_000, nightPrice: 8_000_000 }],
    })
    expect(plan.ok && plan.courts[0]?.rules).toEqual([
      { days: ALL, from: '08:00', to: '18:00', price: 6_000_000 },
      { days: ALL, from: '18:00', to: '00:00', price: 8_000_000 },
    ])
  })

  it('respeta el corte elegido', () => {
    const plan = planWizardCourts(TENANT, {
      formats: [{ format: 5, count: 1, dayPrice: 6_000_000, nightPrice: 8_000_000 }],
      cutHour: 20,
    })
    expect(plan.ok && plan.courts[0]?.rules.map((r) => r.to)).toEqual(['20:00', '00:00'])
  })

  it('cierre de madrugada: la franja pasada la medianoche es de noche', () => {
    const late = buildUniformWeek(10, 2)
    const plan = planWizardCourts(
      { openingHours: late.openingHours, closesNextDay: late.closesNextDay },
      { formats: [{ format: 5, count: 1, dayPrice: 6_000_000, nightPrice: 8_000_000 }] },
    )
    expect(plan.ok && plan.courts[0]?.rules).toEqual(
      expect.arrayContaining([{ days: ALL, from: '00:00', to: '02:00', price: 8_000_000 }]),
    )
  })

  it('devuelve un error legible si no hay ningún día abierto', () => {
    const closed = buildUniformWeek(8, 0)
    for (const d of Object.values(closed.openingHours)) d.closed = true
    const plan = planWizardCourts(
      { openingHours: closed.openingHours, closesNextDay: false },
      { formats: [{ format: 5, count: 1, dayPrice: 6_000_000 }] },
    )
    expect(plan.ok).toBe(false)
  })
})

describe('wizardCourtCountsSchema', () => {
  it('descarta los formatos en 0 y suma el total', () => {
    expect(wizardCourtCountsSchema.parse({ '5': 2, '7': 0, '8': 1 })).toEqual({ '5': 2, '8': 1 })
  })

  it('exige al menos una cancha', () => {
    const res = wizardCourtCountsSchema.safeParse({ '5': 0 })
    expect(res.success).toBe(false)
    expect(res.error?.issues[0]?.message).toBe('Elegí al menos una cancha.')
  })

  it('el total no pasa de 20', () => {
    expect(wizardCourtCountsSchema.safeParse({ '5': 20 }).success).toBe(true)
    expect(wizardCourtCountsSchema.safeParse({ '5': 15, '7': 6 }).success).toBe(false)
  })

  it('rechaza formatos que el alta no ofrece, negativos y decimales', () => {
    expect(wizardCourtCountsSchema.safeParse({ '9': 1 }).success).toBe(false)
    expect(wizardCourtCountsSchema.safeParse({ '5': -1 }).success).toBe(false)
    expect(wizardCourtCountsSchema.safeParse({ '5': 1.5 }).success).toBe(false)
  })
})

describe('wizardScheduleSchema', () => {
  it('acepta 08 a 00, cierre de madrugada y cierre el mismo día', () => {
    expect(wizardScheduleSchema.safeParse({ openHour: 8, closeHour: 0 }).success).toBe(true)
    expect(wizardScheduleSchema.safeParse({ openHour: 8, closeHour: 4 }).success).toBe(true)
    expect(wizardScheduleSchema.safeParse({ openHour: 8, closeHour: 23 }).success).toBe(true)
  })

  it('rechaza cerrar antes de abrir sin ser de madrugada', () => {
    expect(wizardScheduleSchema.safeParse({ openHour: 12, closeHour: 8 }).success).toBe(false)
    expect(wizardScheduleSchema.safeParse({ openHour: 12, closeHour: 12 }).success).toBe(false)
  })
})

describe('wizardPricesSchema', () => {
  const base = { format: 5, count: 1, dayPrice: 6_000_000 }

  it('acepta un precio en centavos enteros', () => {
    expect(wizardPricesSchema.safeParse({ formats: [base] }).success).toBe(true)
  })

  it('el precio es obligatorio, positivo y entero', () => {
    expect(wizardPricesSchema.safeParse({ formats: [{ ...base, dayPrice: 0 }] }).success).toBe(
      false,
    )
    expect(wizardPricesSchema.safeParse({ formats: [{ ...base, dayPrice: -1 }] }).success).toBe(
      false,
    )
    expect(wizardPricesSchema.safeParse({ formats: [{ ...base, dayPrice: 10.5 }] }).success).toBe(
      false,
    )
  })

  it('tiene un tope para atrapar un cero de más', () => {
    expect(
      wizardPricesSchema.safeParse({ formats: [{ ...base, dayPrice: 100_000_001 }] }).success,
    ).toBe(false)
  })

  it('acepta precio de noche y corte; el corte va de 1 a 23', () => {
    expect(
      wizardPricesSchema.safeParse({ formats: [{ ...base, nightPrice: 8_000_000 }], cutHour: 18 })
        .success,
    ).toBe(true)
    expect(wizardPricesSchema.safeParse({ formats: [base], cutHour: 24 }).success).toBe(false)
  })

  it('rechaza formatos repetidos, desconocidos y más de 20 canchas', () => {
    expect(wizardPricesSchema.safeParse({ formats: [base, base] }).success).toBe(false)
    expect(wizardPricesSchema.safeParse({ formats: [{ ...base, format: 9 }] }).success).toBe(false)
    expect(
      wizardPricesSchema.safeParse({
        formats: [
          { ...base, count: 15 },
          { ...base, format: 7, count: 6 },
        ],
      }).success,
    ).toBe(false)
  })
})

describe('wizardProfileSchema', () => {
  it('acepta las cuatro formas de tomar turnos', () => {
    for (const bookingIntake of ['notebook', 'whatsapp', 'other_app', 'new']) {
      expect(
        wizardProfileSchema.safeParse({ bookingIntake, hasFixedTeams: false, canteenEnabled: true })
          .success,
      ).toBe(true)
    }
  })

  it('rechaza una opción desconocida o respuestas faltantes', () => {
    expect(
      wizardProfileSchema.safeParse({
        bookingIntake: 'fax',
        hasFixedTeams: false,
        canteenEnabled: true,
      }).success,
    ).toBe(false)
    expect(wizardProfileSchema.safeParse({ bookingIntake: 'new' }).success).toBe(false)
  })
})
