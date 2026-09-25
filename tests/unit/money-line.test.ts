import { describe, expect, it } from 'vitest'
import { agendaMoneyCell } from '@/app/(admin)/reservas/money-line'
import type { ReservaListRow } from '@/app/(admin)/reservas/queries'
import { formatArs } from '@/lib/format'

type MoneyCellInput = Pick<
  ReservaListRow,
  'pending' | 'totalPaid' | 'status' | 'priceSnapshot' | 'type' | 'depositAmount'
>

const row = (o: Partial<MoneyCellInput> = {}): MoneyCellInput => ({
  status: 'confirmed',
  type: 'spontaneous',
  priceSnapshot: 1_500_000,
  depositAmount: 0,
  pending: 1_500_000,
  totalPaid: 0,
  ...o,
})

describe('agendaMoneyCell — la plata de una fila de la Agenda, en una sola lectura', () => {
  // El bug que esto corrige (2026-09-25): un turno confirmado que todavía no
  // se jugó mostraba "No cobrado" apenas se creaba la reserva, sin importar
  // cuándo era. "No cobrado" es del turno que se jugó y no se cobró.
  it('turno que no terminó, sin un peso pagado: el precio en gris, NUNCA "No cobrado"', () => {
    expect(agendaMoneyCell(row({ status: 'confirmed' }), false)).toEqual({
      text: formatArs(1_500_000),
      tone: 'neutral',
    })
  })

  it('terminado sin cobrar (confirmed o completed): rojo con el monto', () => {
    const expected = { text: `No cobrado · ${formatArs(1_500_000)}`, tone: 'destructive' }
    expect(agendaMoneyCell(row({ status: 'confirmed' }), true)).toEqual(expected)
    expect(agendaMoneyCell(row({ status: 'completed' }), true)).toEqual(expected)
  })

  it('cobro parcial: "Falta $X", rojo si ya terminó y gris si todavía no', () => {
    const partial = { pending: 500_000, totalPaid: 1_000_000 }
    expect(agendaMoneyCell(row(partial), false)).toEqual({
      text: `Falta ${formatArs(500_000)}`,
      tone: 'neutral',
    })
    expect(agendaMoneyCell(row({ ...partial, status: 'completed' }), true)).toEqual({
      text: `Falta ${formatArs(500_000)}`,
      tone: 'destructive',
    })
  })

  it('pagado entero: verde "Pagado", haya terminado o no', () => {
    const paid = { pending: 0, totalPaid: 1_500_000 }
    expect(agendaMoneyCell(row(paid), false)).toEqual({ text: 'Pagado', tone: 'success' })
    expect(agendaMoneyCell(row({ ...paid, status: 'completed' }), true)).toEqual({
      text: 'Pagado',
      tone: 'success',
    })
  })

  it('ausente nunca es plata pendiente (veto "No-show NO es deuda")', () => {
    expect(agendaMoneyCell(row({ status: 'no_show' }), true)).toEqual({
      text: 'Ausente',
      tone: 'neutral',
    })
  })

  it('cancelada, expirada y esperando seña: manda el estado, no la plata', () => {
    expect(agendaMoneyCell(row({ status: 'canceled_refunded' }), true).text).toBe('Cancelada')
    expect(agendaMoneyCell(row({ status: 'canceled_no_refund' }), true).text).toBe('Cancelada')
    expect(agendaMoneyCell(row({ status: 'expired' }), false).text).toBe('Expirada')
    expect(agendaMoneyCell(row({ status: 'pending_payment' }), false)).toEqual({
      text: 'Esperando seña',
      tone: 'warning',
    })
  })

  it('bloqueo: no dice nada de plata; evento a $0: "Sin cargo"', () => {
    expect(agendaMoneyCell(row({ type: 'block', priceSnapshot: 0, pending: 0 }), true)).toEqual({
      text: '',
      tone: 'neutral',
    })
    expect(agendaMoneyCell(row({ priceSnapshot: 0, pending: 0 }), true)).toEqual({
      text: 'Sin cargo',
      tone: 'neutral',
    })
  })

  it('sin dato de plata: el precio en gris, sin inventar un "No cobrado"', () => {
    expect(agendaMoneyCell(row({ pending: undefined }), true)).toEqual({
      text: formatArs(1_500_000),
      tone: 'neutral',
    })
  })
})
