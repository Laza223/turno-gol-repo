import { describe, expect, it } from 'vitest'
import { sumStreetMoney, type StreetMoneyRow } from '@/modules/cashflow/street-money.service'

function bookingRow(pendingCents: number, since = new Date('2026-07-01')): StreetMoneyRow {
  return {
    origin: 'booking',
    refId: '11111111-1111-4111-8111-111111111111',
    debtorName: 'Tomás',
    pendingCents,
    since,
    courtName: 'Cancha 1',
    date: '2026-07-01',
    timeStart: '20:00',
    timeEnd: '21:00',
    playerId: null,
  }
}

function canteenRow(pendingCents: number, since = new Date('2026-07-02')): StreetMoneyRow {
  return {
    origin: 'canteen_tab',
    refId: '22222222-2222-4222-8222-222222222222',
    debtorName: 'Capitán equipo 22hs',
    pendingCents,
    since,
    note: null,
  }
}

function tournamentRow(pendingCents: number, since = new Date('2026-07-03')): StreetMoneyRow {
  return {
    origin: 'tournament',
    refId: '33333333-3333-4333-8333-333333333333',
    debtorName: 'Los Pibes FC',
    pendingCents,
    since,
    tournamentId: '44444444-4444-4444-8444-444444444444',
    tournamentName: 'Apertura 2026',
  }
}

describe('sumStreetMoney — fuente única del total de "plata en la calle"', () => {
  it('suma los 3 orígenes sin importar el orden', () => {
    const rows = [bookingRow(10_000_00), canteenRow(5_000_00), tournamentRow(20_000_00)]
    expect(sumStreetMoney(rows)).toBe(35_000_00)
  })

  it('lista vacía → 0', () => {
    expect(sumStreetMoney([])).toBe(0)
  })

  it('un solo origen repetido suma igual que orígenes mixtos', () => {
    const rows = [bookingRow(1_000_00), bookingRow(2_000_00), bookingRow(3_000_00)]
    expect(sumStreetMoney(rows)).toBe(6_000_00)
  })

  it('no depende del orden de las filas (conmutativa)', () => {
    const a = [bookingRow(10_000_00), canteenRow(5_000_00)]
    const b = [canteenRow(5_000_00), bookingRow(10_000_00)]
    expect(sumStreetMoney(a)).toBe(sumStreetMoney(b))
  })
})
