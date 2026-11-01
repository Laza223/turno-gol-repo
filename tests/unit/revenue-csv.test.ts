import { describe, expect, it } from 'vitest'
import {
  REVENUE_EXPORT_HEADER,
  buildRevenueCsv,
  revenueExportRow,
} from '@/app/api/reports/revenue/revenue-csv'
import type { CashFlowExportRow } from '@/modules/reports/report.types'

const ROW: CashFlowExportRow = {
  date: '2026-10-05',
  type: 'income',
  category: 'booking',
  amount: 1_500_000,
  method: 'cash',
  description: 'Cobro turno 21:00',
  courtName: 'Cancha 1',
}

const row = (overrides: Partial<CashFlowExportRow>) => revenueExportRow({ ...ROW, ...overrides })

describe('buildRevenueCsv', () => {
  it('sale con BOM, CRLF y `;`, como el export de Tus datos', () => {
    const file = buildRevenueCsv([ROW, { ...ROW, date: '2026-10-06' }])
    expect(file.charCodeAt(0)).toBe(0xfeff)
    expect(file.slice(1).split('\r\n')).toEqual([
      'Fecha;Tipo;Categoría;Monto;Método;Descripción;Cancha',
      '2026-10-05;Ingreso;Reserva;15000;Efectivo;Cobro turno 21:00;Cancha 1',
      '2026-10-06;Ingreso;Reserva;15000;Efectivo;Cobro turno 21:00;Cancha 1',
    ])
  })

  it('sin movimientos sale el encabezado, no un archivo vacío', () => {
    expect(buildRevenueCsv([])).toBe(`﻿${REVENUE_EXPORT_HEADER}`)
  })
})

describe('revenueExportRow', () => {
  it('pasa centavos a pesos con coma decimal', () => {
    expect(row({ amount: 1_500_000 })[3]).toBe('15000')
    expect(row({ amount: 1_500_050 })[3]).toBe('15000,50')
  })

  it('el gasto sale en negativo y el ajuste en positivo: la columna suma el balance de Caja', () => {
    expect(row({ type: 'expense', category: 'merchandise', amount: 800_050 }).slice(1, 4)).toEqual([
      'Gasto',
      'Mercadería',
      '-8000,50',
    ])
    expect(
      row({ type: 'adjustment', category: 'no_show_correction', amount: 450_000 }).slice(1, 4),
    ).toEqual(['Ajuste', 'Corrección por ausencia', '4500'])
  })

  it('`other` se lee distinto según el tipo, igual que en Caja', () => {
    expect(row({ type: 'income', category: 'other' })[2]).toBe('Otro ingreso')
    expect(row({ type: 'adjustment', category: 'other' })[2]).toBe('Ajuste')
  })

  it('el método sale en castellano', () => {
    expect(row({ method: 'transfer' })[4]).toBe('Transferencia')
    expect(row({ method: 'mercadopago' })[4]).toBe('MercadoPago')
    expect(row({ method: 'other' })[4]).toBe('Otro')
  })

  it('la seña no muestra el id interno del turno', () => {
    expect(row({ description: 'Seña — turno 3f2a9c1e-0000-4000-8000-000000000001' })[5]).toBe(
      'Seña del turno',
    )
  })

  it('tiene tantas columnas como el encabezado', () => {
    expect(row({ courtName: '' })).toHaveLength(REVENUE_EXPORT_HEADER.split(';').length)
  })
})

describe('escape del CSV de caja', () => {
  const dataLine = (description: string) =>
    buildRevenueCsv([{ ...ROW, description }]).split('\r\n')[1]

  it('una descripción con `;` va entre comillas y no corre las columnas', () => {
    expect(dataLine('Coca; Sprite')).toBe(
      '2026-10-05;Ingreso;Reserva;15000;Efectivo;"Coca; Sprite";Cancha 1',
    )
  })

  it('una coma ya no necesita comillas', () => {
    expect(dataLine('Coca, Sprite')).toContain(';Coca, Sprite;')
  })

  it("el gasto negativo llega como número, sin el `'` del anti fórmulas", () => {
    const line = buildRevenueCsv([
      { ...ROW, type: 'expense', category: 'merchandise', amount: 800_050 },
    ]).split('\r\n')[1]
    expect(line).toBe('2026-10-05;Gasto;Mercadería;-8000,50;Efectivo;Cobro turno 21:00;Cancha 1')
  })

  it('una descripción que arranca con fórmula queda neutralizada', () => {
    expect(dataLine('=HYPERLINK("http://evil.example","x")')).toContain(
      ';"\'=HYPERLINK(""http://evil.example"",""x"")";',
    )
  })
})
