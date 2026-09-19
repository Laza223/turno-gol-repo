import { describe, expect, it } from 'vitest'
import {
  chargeSplit,
  chargeTabs,
  counterPaidCents,
  halfOfPending,
  playerShare,
  teamDues,
} from '@/components/booking/slot-panel/charge-copy'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * Cobro de a partes (2026-09-16): los complejos casi nunca cobran el turno
 * entero de una. A veces juntan por equipo; lo más frecuente es que cada
 * jugador pague lo suyo a medida que llega. El panel ofrece "Dividir pago por
 * equipo" y "Pagó uno", y dice cuánta gente ya puso.
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
    // Dividir por equipo se va —ya entró plata—, pero "Pagó uno" se queda: es el
    // botón que se toca una vez por jugador.
    expect(s.canSplitHalf).toBe(false)
    expect(s.canSplitShare).toBe(true)
  })

  it('a la mitad justa habla de equipos, con las mismas palabras que las filas', () => {
    const s = chargeSplit(booking({ totalPaid: 3_000_000, pending: 3_000_000 }), F5)
    expect(s.note).toBe('Equipo 1 pagó · falta Equipo 2')
  })

  it('cuando falta exactamente una parte, el botón grande ya la cobra', () => {
    const s = chargeSplit(booking({ totalPaid: 5_400_000, pending: PARTE }), F5)
    expect(s.note).toBe('Pagaron 9 de 10')
    // Ofrecer "Pagó uno" acá sería el mismo cobro que "Cobrar $6.000", dos veces.
    expect(s.canSplitShare).toBe(false)
  })

  it('turno saldado: ni atajos ni rótulo, y los montos en cero', () => {
    const s = chargeSplit(booking({ totalPaid: 6_000_000, pending: 0 }), F5)
    expect(s.canSplitHalf).toBe(false)
    expect(s.canSplitShare).toBe(false)
    expect(s.note).toBeNull()
    // Aserción que verificaba `team-split.test.ts` hasta que #323 lo borró y
    // este archivo no la repitió (🟢 11 de la revisión de la tanda #319-#324):
    // sin saldo, la mitad tiene que dar 0 y no la mitad del precio del turno —
    // un `halfCents` residual precargaría el panel con plata que no se debe.
    expect(s.halfCents).toBe(0)
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

describe('counterPaidCents', () => {
  it('sin cobros es cero', () => {
    expect(counterPaidCents(booking())).toBe(0)
  })

  it('descuenta la seña pagada: no es gente que puso plata en el mostrador', () => {
    const b = booking({
      depositStatus: 'paid',
      depositAmount: 1_800_000,
      totalPaid: 1_800_000,
      pending: 4_200_000,
    })
    expect(counterPaidCents(b)).toBe(0)
  })

  it('una seña sin pagar no se descuenta', () => {
    const b = booking({
      depositStatus: 'pending',
      depositAmount: 1_800_000,
      totalPaid: 600_000,
      pending: 5_400_000,
    })
    expect(counterPaidCents(b)).toBe(600_000)
  })
})

describe('teamDues', () => {
  it('sin cobros, cada equipo debe su mitad y ninguno está saldado', () => {
    expect(teamDues(booking())).toEqual({
      team1Cents: 3_000_000,
      team2Cents: 3_000_000,
      team1Paid: false,
      team2Paid: false,
    })
  })

  it('la mitad se calcula sobre lo que se cobra en el mostrador, sin la seña', () => {
    // $60.000, seña $12.000: en el mostrador se cobran $48.000, $24.000 por equipo.
    const b = booking({
      depositStatus: 'paid',
      depositAmount: 1_200_000,
      totalPaid: 1_200_000,
      pending: 4_800_000,
    })
    const d = teamDues(b)
    expect(d.team1Cents).toBe(2_400_000)
    expect(d.team2Cents).toBe(2_400_000)
    expect(d.team1Paid).toBe(false)
  })

  it('con la mitad cobrada, Equipo 1 está ✓ y Equipo 2 debe el resto', () => {
    const b = booking({ totalPaid: 3_000_000, pending: 3_000_000 })
    expect(teamDues(b)).toEqual({
      team1Cents: 0,
      team2Cents: 3_000_000,
      team1Paid: true,
      team2Paid: false,
    })
  })

  it('cobros sueltos de jugadores cuentan para el Equipo 1 hasta completar su mitad', () => {
    // Cuatro "Pagó uno" de $6.000: $24.000 de $60.000. A Equipo 1 le faltan $6.000.
    const b = booking({ totalPaid: 2_400_000, pending: 3_600_000 })
    const d = teamDues(b)
    expect(d.team1Cents).toBe(600_000)
    expect(d.team2Cents).toBe(3_000_000)
    expect(d.team1Paid).toBe(false)
    expect(d.team1Cents + d.team2Cents).toBe(b.pending)
  })

  it('todo cobrado: los dos equipos ✓ y nada por cobrar', () => {
    const b = booking({ totalPaid: 6_000_000, pending: 0 })
    expect(teamDues(b)).toEqual({
      team1Cents: 0,
      team2Cents: 0,
      team1Paid: true,
      team2Paid: true,
    })
  })

  it('un turno sin costo no tiene equipos saldados ni deudas', () => {
    const b = booking({ priceSnapshot: 0, totalPaid: 0, pending: 0 })
    expect(teamDues(b)).toEqual({
      team1Cents: 0,
      team2Cents: 0,
      team1Paid: false,
      team2Paid: false,
    })
  })

  it('lo debido nunca supera lo pendiente, aunque el redondeo de la mitad sobre', () => {
    const b = booking({ priceSnapshot: 5_000_001, totalPaid: 0, pending: 5_000_001 })
    const d = teamDues(b)
    expect(d.team1Cents).toBe(2_500_001)
    expect(d.team1Cents + d.team2Cents).toBe(5_000_001)
  })
})

describe('chargeTabs', () => {
  it('sin cobros: las tres formas, abre en "todo junto"', () => {
    expect(chargeTabs(booking(), F5)).toEqual({
      available: ['all', 'teams', 'players'],
      initial: 'all',
    })
  })

  it('sin capacidad no hay "por jugador": no se inventa una parte', () => {
    expect(chargeTabs(booking()).available).toEqual(['all', 'teams'])
  })

  it('con parte de la gente pagada, abre en "por jugador"', () => {
    const b = booking({ totalPaid: 2_400_000, pending: 3_600_000 })
    expect(chargeTabs(b, F5).initial).toBe('players')
  })

  it('con un equipo pagado (justo la mitad), abre en "por equipo"', () => {
    const b = booking({ totalPaid: 3_000_000, pending: 3_000_000 })
    expect(chargeTabs(b, F5).initial).toBe('teams')
  })

  it('si ya pagó más que un equipo, "por equipo" deja de tener sentido', () => {
    const b = booking({ totalPaid: 4_200_000, pending: 1_800_000 })
    expect(chargeTabs(b, F5).available).toEqual(['all', 'players'])
    expect(chargeTabs(b, F5).initial).toBe('players')
  })

  it('sin saldo solo queda "todo junto"', () => {
    const b = booking({ totalPaid: 6_000_000, pending: 0 })
    expect(chargeTabs(b, F5).available).toEqual(['all'])
  })
})
