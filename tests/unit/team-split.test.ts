import { describe, expect, it } from 'vitest'
import { halfOfPending, teamSplit } from '@/components/booking/slot-panel/charge-copy'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * Cobro por equipo (2026-09-15): la mayoría de los complejos cobran el turno en
 * dos veces, una por equipo. El panel de la grilla ofrece "Cobrar la mitad" y
 * después dice cuál de los dos ya pagó.
 *
 * Lo que se prueba acá es el cálculo, que es todo lo que hay: no existe columna
 * ni etiqueta guardada — "Equipo 1 / Equipo 2" se deriva de cuánta plata de
 * MOSTRADOR entró. El caso que justifica el test es el de la seña: si la seña
 * contara como "un equipo pagó", un turno señado online por el jugador diría
 * que ya cobraron la mitad sin que nadie haya puesto un peso en el mostrador.
 */

/** Turno base: $60.000, sin seña, sin cobros. Cada test pisa lo que le importa. */
function booking(over: Partial<GridBooking> = {}): GridBooking {
  return {
    id: 'b1',
    courtId: 'c1',
    date: '2026-09-15',
    timeStart: '20:00',
    timeEnd: '21:00',
    status: 'confirmed',
    type: 'online',
    guestName: null,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 6_000_000,
    depositStatus: 'not_required',
    depositAmount: 0,
    totalPaid: 0,
    pending: 6_000_000,
    ...over,
  } as GridBooking
}

describe('halfOfPending', () => {
  it('parte al medio', () => {
    expect(halfOfPending(6_000_000)).toBe(3_000_000)
  })

  it('redondea para arriba, así el segundo no queda con un centavo colgado', () => {
    // $50.000,01 → el primero pone el centavo de más.
    expect(halfOfPending(5_000_001)).toBe(2_500_001)
    expect(5_000_001 - halfOfPending(5_000_001)).toBe(2_500_000)
  })

  it('sin saldo no hay mitad', () => {
    expect(halfOfPending(0)).toBe(0)
    expect(halfOfPending(-100)).toBe(0)
  })
})

describe('teamSplit', () => {
  it('turno entero sin cobrar: ofrece la mitad y todavía no rotula equipos', () => {
    const split = teamSplit(booking())
    expect(split.canSplit).toBe(true)
    expect(split.halfCents).toBe(3_000_000)
    expect(split.note).toBeNull()
  })

  it('pagó un equipo: deja de ofrecer el atajo y dice quién falta', () => {
    const split = teamSplit(booking({ totalPaid: 3_000_000, pending: 3_000_000 }))
    expect(split.canSplit).toBe(false)
    expect(split.note).toBe('Equipo 1 pagó · falta Equipo 2')
  })

  it('turno saldado: ni atajo ni rótulo', () => {
    const split = teamSplit(booking({ totalPaid: 6_000_000, pending: 0 }))
    expect(split.canSplit).toBe(false)
    expect(split.note).toBeNull()
    expect(split.halfCents).toBe(0)
  })

  /**
   * El caso que rompería la lectura. La seña ya está contada en `totalPaid`,
   * igual que en `summarizeBookingCharges`: descontarla es lo único que impide
   * que un turno señado por el jugador diga "Equipo 1 pagó".
   */
  it('seña pagada online y CERO cobros de mostrador: no dice que pagó un equipo', () => {
    const split = teamSplit(
      booking({
        depositStatus: 'paid',
        depositAmount: 1_800_000,
        totalPaid: 1_800_000,
        pending: 4_200_000,
      }),
    )
    expect(split.note).toBeNull()
    expect(split.canSplit).toBe(true)
    // La mitad se calcula sobre lo que FALTA, no sobre el precio del turno.
    expect(split.halfCents).toBe(2_100_000)
  })

  it('seña pagada Y un cobro de mostrador encima: ahí sí pagó un equipo', () => {
    const split = teamSplit(
      booking({
        depositStatus: 'paid',
        depositAmount: 1_800_000,
        totalPaid: 1_800_000 + 2_100_000,
        pending: 2_100_000,
      }),
    )
    expect(split.note).toBe('Equipo 1 pagó · falta Equipo 2')
    expect(split.canSplit).toBe(false)
  })

  it('seña devuelta no cuenta como plata cobrada', () => {
    // `refunded` no es dinero en poder del complejo: misma regla que
    // summarizeBookingCharges, donde sólo `paid` y `captured` suman.
    const split = teamSplit(
      booking({ depositStatus: 'refunded', depositAmount: 1_800_000, totalPaid: 0 }),
    )
    expect(split.canSplit).toBe(true)
    expect(split.note).toBeNull()
  })

  it('turno sin datos de plata (payload viejo de Realtime): no inventa nada', () => {
    const split = teamSplit(booking({ totalPaid: null, pending: null }))
    expect(split.canSplit).toBe(false)
    expect(split.note).toBeNull()
    expect(split.halfCents).toBe(0)
  })
})
