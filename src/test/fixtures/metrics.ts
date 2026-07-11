import type {
  CashFlowExportRow,
  CourtReport,
  MethodReport,
  PeriodTotals,
  RevenueReport,
} from '@/modules/reports/report.types'
import { artDateString, FROZEN_NOW, hoursFromNow } from './clock'
import { courtFutbol5, courtFutbol7, courtFutbol11 } from './court'

/** Primer día del mes de FROZEN_NOW (marzo 2026) hasta FROZEN_NOW — período "este mes". */
const PERIOD_FROM = new Date('2026-03-01T00:00:00.000Z')
const PERIOD_TO = FROZEN_NOW

export const courtReport = (overrides: Partial<CourtReport> = {}): CourtReport => ({
  courtId: courtFutbol5().id,
  courtName: 'Cancha 1',
  income: 18000000,
  bookingCount: 42,
  occupancyPct: 68,
  ...overrides,
})

export const courtReports = (): CourtReport[] => [
  courtReport(),
  courtReport({ courtId: courtFutbol7().id, courtName: 'Cancha 2', income: 15000000, bookingCount: 36, occupancyPct: 61 }),
  courtReport({ courtId: courtFutbol11().id, courtName: 'Cancha 3 - Fútbol 11', income: 9000000, bookingCount: 18, occupancyPct: 34 }),
]

export const methodReport = (overrides: Partial<MethodReport> = {}): MethodReport => ({
  method: 'mercadopago',
  total: 20000000,
  ...overrides,
})

export const methodReports = (): MethodReport[] => [
  methodReport(),
  methodReport({ method: 'cash', total: 15000000 }),
  methodReport({ method: 'transfer', total: 6000000 }),
  methodReport({ method: 'other', total: 1000000 }),
]

export const periodTotals = (overrides: Partial<PeriodTotals> = {}): PeriodTotals => ({
  income: 39000000,
  adjustment: -300000,
  balance: 38700000,
  ...overrides,
})

/** Reporte de ingresos del mes en curso, con comparación contra el mes anterior. */
export const revenueReport = (overrides: Partial<RevenueReport> = {}): RevenueReport => ({
  period: { from: PERIOD_FROM, to: PERIOD_TO },
  income: 42000000,
  adjustment: -450000,
  balance: 41550000,
  bookingCount: 96,
  byCourt: courtReports(),
  byMethod: methodReports(),
  prevPeriod: periodTotals(),
  ...overrides,
})

/** Complejo nuevo: primer mes con datos, sin período anterior para comparar. */
export const revenueReportFirstMonth = (): RevenueReport =>
  revenueReport({
    income: 6200000,
    adjustment: 0,
    balance: 6200000,
    bookingCount: 14,
    byCourt: [courtReport({ income: 6200000, bookingCount: 14, occupancyPct: 22 })],
    byMethod: [methodReport({ method: 'mercadopago', total: 4200000 }), methodReport({ method: 'cash', total: 2000000 })],
    prevPeriod: null,
  })

/** Fila de la exportación CSV de caja — `monto_ars` va en pesos, NO en centavos. */
export const cashFlowExportRow = (overrides: Partial<CashFlowExportRow> = {}): CashFlowExportRow => ({
  fecha: artDateString(hoursFromNow(-26)),
  tipo: 'Ingreso',
  categoria: 'Reserva',
  monto_ars: 4500,
  metodo: 'Mercado Pago',
  descripcion: 'Seña turno 16:00 — Cancha 1',
  cancha: 'Cancha 1',
  ...overrides,
})

export const cashFlowExportRows = (): CashFlowExportRow[] => [
  cashFlowExportRow(),
  cashFlowExportRow({
    fecha: artDateString(hoursFromNow(-3)),
    tipo: 'Ingreso',
    categoria: 'Venta cantina',
    monto_ars: 5000,
    metodo: 'Efectivo',
    descripcion: 'Venta cantina: Gatorade x2, Agua x1',
    cancha: '—',
  }),
  cashFlowExportRow({
    fecha: artDateString(hoursFromNow(-5)),
    tipo: 'Gasto',
    categoria: 'Gasto operativo',
    monto_ars: 8000,
    metodo: 'Efectivo',
    descripcion: 'Compra de pelotas y petos nuevos',
    cancha: '—',
  }),
  cashFlowExportRow({
    fecha: artDateString(hoursFromNow(-1)),
    tipo: 'Ajuste',
    categoria: 'Corrección no-show',
    monto_ars: -4500,
    metodo: 'Otro',
    descripcion: 'Corrección: no-show cargado por error, se revierte la seña capturada',
    cancha: 'Cancha 1',
  }),
]
