import { describe, expect, it } from 'vitest'
import { dayKeyOf, priceForDateSlot, priceForSlot, timeToMins } from '@/lib/booking/pricing'
import { calculatePrice } from '@/modules/courts/court.service'
import { artDateAt } from '@/modules/bookings/booking.service'
import type { CourtPricingData } from '@/modules/courts/court.types'

/**
 * `@/lib/booking/pricing` unificó tres copias del mismo lookup de tarifa
 * (`calculatePrice`, el `priceForSlot` privado de booking.service y la copia
 * inline de `validatePricingRulesCoverage`). El popover de alta rápida es la
 * cuarta, y esta vez corre en el CLIENTE: si difiriera del server, el precio
 * que el admin ve al reservar no sería el que se graba.
 *
 * Los tests de abajo fijan el comportamiento Y verifican que la extracción no
 * cambió lo que `calculatePrice` respondía.
 */

const PRICING: CourtPricingData = {
  rules: [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '18:00', price: 1_500_00 },
    { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '18:00', to: '00:00', price: 2_400_00 },
    { days: ['sat', 'sun'], from: '08:00', to: '00:00', price: 3_000_00 },
  ],
}

describe('timeToMins', () => {
  it('tolera HH:MM y HH:MM:SS', () => {
    expect(timeToMins('08:30')).toBe(510)
    expect(timeToMins('08:30:00')).toBe(510)
    expect(timeToMins('00:00')).toBe(0)
    expect(timeToMins('23:00')).toBe(1380)
  })
})

describe('dayKeyOf', () => {
  it('mapea la fecha calendario a la clave de pricing.rules', () => {
    // 2026-08-04 fue martes.
    expect(dayKeyOf('2026-08-04')).toBe('tue')
    expect(dayKeyOf('2026-08-08')).toBe('sat')
    expect(dayKeyOf('2026-08-09')).toBe('sun')
  })
})

describe('priceForSlot', () => {
  it('devuelve la tarifa de la franja que CONTIENE el slot', () => {
    expect(priceForSlot(PRICING, 'tue', '10:00')).toBe(1_500_00)
    expect(priceForSlot(PRICING, 'tue', '20:00')).toBe(2_400_00)
    expect(priceForSlot(PRICING, 'sat', '20:00')).toBe(3_000_00)
  })

  it('el borde `from` entra y el borde `to` NO (semiabierto)', () => {
    expect(priceForSlot(PRICING, 'tue', '18:00')).toBe(2_400_00) // from de la 2da
    expect(priceForSlot(PRICING, 'tue', '17:00')).toBe(1_500_00) // última de la 1ra
  })

  it("`to: '00:00'` es medianoche = fin del día, no el arranque", () => {
    // Sin esa convención, la franja 18:00→00:00 sería vacía y 23:00 no tendría precio.
    expect(priceForSlot(PRICING, 'tue', '23:00')).toBe(2_400_00)
  })

  it('sin regla que cubra la hora devuelve null (no 0: 0 sería un turno gratis)', () => {
    expect(priceForSlot(PRICING, 'tue', '07:00')).toBeNull()
    expect(priceForSlot({ rules: [] }, 'tue', '20:00')).toBeNull()
  })

  it('un día que ninguna regla incluye devuelve null', () => {
    const soloFinde: CourtPricingData = {
      rules: [{ days: ['sat', 'sun'], from: '08:00', to: '23:00', price: 1000 }],
    }
    expect(priceForSlot(soloFinde, 'tue', '10:00')).toBeNull()
  })

  it('gana la PRIMERA regla que matchea (orden del array, no la más específica)', () => {
    const solapadas: CourtPricingData = {
      rules: [
        { days: ['tue'], from: '08:00', to: '23:00', price: 111 },
        { days: ['tue'], from: '10:00', to: '12:00', price: 999 },
      ],
    }
    expect(priceForSlot(solapadas, 'tue', '11:00')).toBe(111)
  })
})

describe('priceForDateSlot vs calculatePrice — la extracción no cambió nada', () => {
  const casos: Array<[string, string]> = [
    ['2026-08-04', '10:00'], // martes, franja de día
    ['2026-08-04', '20:00'], // martes, franja de noche
    ['2026-08-04', '23:00'], // martes, borde de medianoche
    ['2026-08-08', '09:00'], // sábado
    ['2026-08-09', '22:00'], // domingo
    ['2026-08-04', '07:00'], // fuera de toda franja → null
  ]

  it.each(casos)('%s %s da lo mismo por las dos vías', (date, hhmm) => {
    expect(priceForDateSlot(PRICING, date, hhmm)).toBe(
      calculatePrice(PRICING, artDateAt(date, hhmm)),
    )
  })

  /**
   * Un slot de madrugada pertenece al día OPERATIVO anterior y se tarifa con
   * las reglas de ESE día. No es un efecto de la extracción: `artDateAt`
   * construye el instante desde el día operativo, así que `calculatePrice` ya
   * hacía exactamente esto.
   */
  it('la madrugada usa las reglas del día operativo, no las del calendario', () => {
    const nocturno: CourtPricingData = {
      rules: [
        { days: ['fri'], from: '00:00', to: '04:00', price: 5_000_00 },
        { days: ['sat'], from: '00:00', to: '04:00', price: 9_999_00 },
      ],
    }
    // 2026-08-07 es viernes: el slot 01:00 del día operativo viernes cobra la
    // tarifa del viernes, aunque físicamente ocurra el sábado.
    expect(priceForDateSlot(nocturno, '2026-08-07', '01:00')).toBe(5_000_00)
    expect(calculatePrice(nocturno, artDateAt('2026-08-07', '01:00'))).toBe(5_000_00)
  })
})
