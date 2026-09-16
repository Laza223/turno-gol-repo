import { describe, expect, it } from 'vitest'
import {
  chargeSplit,
  halfOfPending,
  playerShare,
} from '@/components/booking/slot-panel/charge-copy'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * Cobro de a partes (2026-09-16): los complejos casi nunca cobran el turno
 * entero de una. A veces juntan por equipo; lo más frecuente es que cada
 * jugador pague lo suyo a medida que llega. El panel ofrece "Pagó un equipo" y
 * "Pagó uno", y dice cuánta gente ya puso.
 *
 * Acá se prueba el cálculo, que es TODO lo que hay: no existe columna ni
 * registro de quién pagó. Dos casos justifican el archivo entero:
 *  - la seña no puede leerse como gente que pagó en el mostrador;
 *  - la cuenta de jugadores sale de dividir, así que tiene que aguantar el
 *    redondeo y la falta de datos sin inventar números.
 */

/** Turno base: $60.000, sin seña, sin cobros. Cada test pisa lo que le importa. */
function booking(over: Partial<GridBooking> = {}): GridBooking {
  return {
    id: 'b1',
    courtId: 'c1',
    date: '2026-09-16',
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

/** F5 = 10 jugadores. $60.000 / 10 = $6.000 cada uno. */
const F5 = 10
const PARTE = 600_000

describe('halfOfPending', () => {
  it('parte al medio', () => {
    expect(halfOfPending(6_000_000)).toBe(3_000_000)
  })

  it('redondea para arriba, así el segundo no queda con un centavo colgado', () => {
    expect(halfOfPending(5_000_001)).toBe(2_500_001)
    expect(5_000_001 - halfOfPending(5_000_001)).toBe(2_500_000)
  })

  it('sin saldo no hay mitad', () => {
    expect(halfOfPending(0)).toBe(0)
    expect(halfOfPending(-100)).toBe(0)
  })
})

describe('playerShare', () => {
  it('reparte el precio del turno entre los jugadores de la cancha', () => {
    expect(playerShare(6_000_000, F5)).toBe(PARTE)
    // F7 = 14 jugadores.
    expect(playerShare(8_400_000, 14)).toBe(600_000)
  })

  it('redondea para arriba: el último no paga centavos sueltos', () => {
    // $55.000 entre 14 da $3.928,57…
    expect(playerShare(5_500_000, 14)).toBe(392_858)
  })

  it('sin capacidad o sin precio no inventa un monto', () => {
    expect(playerShare(6_000_000, undefined)).toBeNull()
    expect(playerShare(6_000_000, 0)).toBeNull()
    expect(playerShare(0, F5)).toBeNull()
  })
})

describe('chargeSplit', () => {
  it('turno entero sin cobrar: ofrece equipo y jugador, sin rotular gente todavía', () => {
    const s = chargeSplit(booking(), F5)
    expect(s.canSplitHalf).toBe(true)
    expect(s.canSplitShare).toBe(true)
    expect(s.halfCents).toBe(3_000_000)
    expect(s.shareCents).toBe(PARTE)
    expect(s.note).toBeNull()
  })

  it('pagó un jugador: cuenta gente y deja de ofrecer el equipo', () => {
    const s = chargeSplit(booking({ totalPaid: PARTE, pending: 5_400_000 }), F5)
    expect(s.note).toBe('Pagaron 1 de 10')
    // "Pagó un equipo" se va —ya entró plata—, pero "Pagó uno" se queda: es el
    // botón que se toca una vez por jugador.
    expect(s.canSplitHalf).toBe(false)
    expect(s.canSplitShare).toBe(true)
  })

  it('a la mitad justa avisa que hay un equipo entero saldado', () => {
    const s = chargeSplit(booking({ totalPaid: 3_000_000, pending: 3_000_000 }), F5)
    expect(s.note).toBe('Pagaron 5 de 10 · un equipo entero')
  })

  it('cuando falta exactamente una parte, el botón grande ya la cobra', () => {
    const s = chargeSplit(booking({ totalPaid: 5_400_000, pending: PARTE }), F5)
    expect(s.note).toBe('Pagaron 9 de 10')
    // Ofrecer "Pagó uno" acá sería el mismo cobro que "Cobrar $6.000", dos veces.
    expect(s.canSplitShare).toBe(false)
  })

  it('turno saldado: ni atajos ni rótulo', () => {
    const s = chargeSplit(booking({ totalPaid: 6_000_000, pending: 0 }), F5)
    expect(s.canSplitHalf).toBe(false)
    expect(s.canSplitShare).toBe(false)
    expect(s.note).toBeNull()
  })

  /**
   * El caso que rompería la lectura. La seña ya está contada en `totalPaid`,
   * igual que en `summarizeBookingCharges`: descontarla es lo único que impide
   * que un turno señado por el jugador diga que ya pagó gente en el mostrador.
   */
  it('seña pagada online y CERO cobros de mostrador: no dice que pagó nadie', () => {
    const s = chargeSplit(
      booking({
        depositStatus: 'paid',
        depositAmount: 1_800_000,
        totalPaid: 1_800_000,
        pending: 4_200_000,
      }),
      F5,
    )
    expect(s.note).toBeNull()
    expect(s.canSplitHalf).toBe(true)
    // La parte de cada jugador NO cambia porque haya seña: sale del precio del
    // turno. Lo que baja es el pendiente.
    expect(s.shareCents).toBe(PARTE)
    expect(s.halfCents).toBe(2_100_000)
  })

  it('seña devuelta no cuenta como plata cobrada', () => {
    const s = chargeSplit(
      booking({ depositStatus: 'refunded', depositAmount: 1_800_000, totalPaid: 0 }),
      F5,
    )
    expect(s.canSplitHalf).toBe(true)
    expect(s.note).toBeNull()
  })

  it('sin capacidad no cuenta gente, pero sigue diciendo que falta el otro equipo', () => {
    const s = chargeSplit(booking({ totalPaid: 3_000_000, pending: 3_000_000 }), undefined)
    expect(s.shareCents).toBeNull()
    expect(s.canSplitShare).toBe(false)
    expect(s.note).toBe('Equipo 1 pagó · falta Equipo 2')
  })

  it('turno sin datos de plata (payload viejo de Realtime): no inventa nada', () => {
    const s = chargeSplit(booking({ totalPaid: null, pending: null }), F5)
    expect(s.canSplitHalf).toBe(false)
    expect(s.canSplitShare).toBe(false)
    expect(s.note).toBeNull()
    expect(s.halfCents).toBe(0)
  })
})
