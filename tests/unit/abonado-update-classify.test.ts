import { describe, expect, it } from 'vitest'
import { classifyAbonadoUpdate } from '@/modules/abonados/abonado.update'

// Editar un turno fijo: qué le pasa a cada fecha futura. La vista previa y la
// edición real comparten esta función, así que acá se fija la regla de negocio
// (decisiones del 2026-11-08): el precio puesto a mano se respeta, y lo ya
// cobrado nunca queda por encima del precio nuevo.

const abonado = {
  pricePerSession: 2_000_000,
  playerId: null as string | null,
  contactName: 'Cachi',
  contactPhone: '1122334455' as string | null,
}

function session(over: Partial<Parameters<typeof classifyAbonadoUpdate>[1][number]> = {}) {
  return {
    id: 'b1',
    courtId: 'c1',
    date: '2030-01-07',
    timeStart: '21:00:00',
    timeEnd: '22:00:00',
    priceSnapshot: 2_000_000,
    depositAmount: 0,
    depositStatus: 'not_required',
    guestName: 'Cachi' as string | null,
    guestPhone: null as string | null,
    paid: 0,
    ...over,
  }
}

describe('classifyAbonadoUpdate — precio', () => {
  it('actualiza una fecha con el precio del fijo y sin cobro', () => {
    const { verdicts, counts } = classifyAbonadoUpdate(abonado, [session()], {
      pricePerSession: 2_500_000,
    })
    expect(verdicts[0]!.price).toBe('update')
    expect(counts).toEqual({ futureSessions: 1, priceUpdated: 1, keptOwnPrice: 0, keptPaid: 0 })
  })

  it('respeta una fecha con un precio puesto a mano (promo, feriado)', () => {
    const { verdicts, counts } = classifyAbonadoUpdate(
      abonado,
      [session({ priceSnapshot: 1_500_000 })],
      { pricePerSession: 2_500_000 },
    )
    expect(verdicts[0]!.price).toBe('keepOwnPrice')
    expect(counts.keptOwnPrice).toBe(1)
    expect(counts.priceUpdated).toBe(0)
  })

  it('actualiza una fecha con cobro si el precio nuevo es mayor o igual a lo cobrado', () => {
    const { verdicts } = classifyAbonadoUpdate(
      abonado,
      [session({ id: 'a', paid: 2_000_000 }), session({ id: 'b', paid: 2_500_000 })],
      { pricePerSession: 2_500_000 },
    )
    expect(verdicts.map((v) => v.price)).toEqual(['update', 'update'])
  })

  it('respeta una fecha donde lo cobrado supera el precio nuevo', () => {
    const { verdicts, counts } = classifyAbonadoUpdate(abonado, [session({ paid: 2_000_000 })], {
      pricePerSession: 1_800_000,
    })
    expect(verdicts[0]!.price).toBe('keepPaid')
    expect(counts.keptPaid).toBe(1)
  })

  it('el precio puesto a mano gana sobre el cobrado (no se cuenta dos veces)', () => {
    const { counts } = classifyAbonadoUpdate(
      abonado,
      [session({ priceSnapshot: 1_500_000, paid: 1_500_000 })],
      { pricePerSession: 1_000_000 },
    )
    expect(counts.keptOwnPrice).toBe(1)
    expect(counts.keptPaid).toBe(0)
  })

  it('sin cambio de precio no toca ninguna fecha', () => {
    const same = classifyAbonadoUpdate(abonado, [session()], { pricePerSession: 2_000_000 })
    expect(same.verdicts[0]!.price).toBe('none')
    const absent = classifyAbonadoUpdate(abonado, [session()], { contactName: 'Otro' })
    expect(absent.verdicts[0]!.price).toBe('none')
    expect(absent.counts.priceUpdated).toBe(0)
  })
})

describe('classifyAbonadoUpdate — nombre y teléfono', () => {
  it('renombra la fecha que todavía lleva el nombre viejo', () => {
    const { verdicts } = classifyAbonadoUpdate(
      abonado,
      [session({ id: 'a' }), session({ id: 'b', guestName: 'Corregido a mano' })],
      { contactName: 'Cachi Gómez' },
    )
    expect(verdicts.map((v) => v.rename)).toEqual([true, false])
  })

  it('no renombra si el fijo tiene cuenta de jugador (el nombre sale de la cuenta)', () => {
    const { verdicts } = classifyAbonadoUpdate(
      { ...abonado, playerId: 'p1' },
      [session({ guestName: null })],
      { contactName: 'Cachi Gómez', contactPhone: '1199999999' },
    )
    expect(verdicts[0]).toMatchObject({ rename: false, setPhone: false })
  })

  it('completa el teléfono vacío o igual al viejo, y respeta uno corregido a mano', () => {
    const { verdicts } = classifyAbonadoUpdate(
      abonado,
      [
        session({ id: 'a', guestPhone: null }),
        session({ id: 'b', guestPhone: '1122334455' }),
        session({ id: 'c', guestPhone: '1100000000' }),
      ],
      { contactPhone: '1133445566' },
    )
    expect(verdicts.map((v) => v.setPhone)).toEqual([true, true, false])
  })

  it('no hace nada si el valor nuevo es igual al actual', () => {
    const { verdicts } = classifyAbonadoUpdate(abonado, [session()], {
      contactName: 'Cachi',
      contactPhone: '1122334455',
    })
    expect(verdicts[0]).toMatchObject({ rename: false, setPhone: false })
  })
})
