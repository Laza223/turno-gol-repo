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

// ─── /metricas (MetricsDashboard) ──────────────────────────────────────────
// `TenantMetrics`/`SystemStatus` viven en metrics.service.ts / api/admin/
// system-status/route.ts — ambos server-only (arrastran drizzle/getBoss), así
// que el shape se define acá a mano (mismo patrón que player.ts) en vez de
// importarlo, aunque sea `import type` (el override de src/test/**/*.ts
// también bloquea *.service).

type DailyCountFixture = { date: string; count: number }
type DailyAmountFixture = { date: string; amountCents: number }
type TimeSlotCountFixture = { time: string; count: number }
type NoShowMetricFixture = { noShow: number; completed: number; finished: number; rate: number }
type RevenueMetricFixture = { totalCents: number; byCategory: Record<string, number> }

export type TenantMetricsFixture = {
  windowDays: number
  from: string
  to: string
  bookingsPerDay: DailyCountFixture[]
  revenuePerDay: DailyAmountFixture[]
  topSlots: TimeSlotCountFixture[]
  noShow: NoShowMetricFixture
  noShowPrev: NoShowMetricFixture
  revenue: RevenueMetricFixture
}

const METRICS_WINDOW_DAYS = 30

/** Serie de 30 días terminando en FROZEN_NOW, con un patrón de fin de semana más alto. */
function thirtyDaySeries<T>(build: (dateStr: string, dayIndex: number) => T): T[] {
  const out: T[] = []
  for (let i = METRICS_WINDOW_DAYS - 1; i >= 0; i--) {
    const dateStr = artDateString(new Date(FROZEN_NOW.getTime() - i * 86_400_000))
    out.push(build(dateStr, METRICS_WINDOW_DAYS - 1 - i))
  }
  return out
}

function isWeekend(dayIndex: number): boolean {
  // FROZEN_NOW (día 29, el último) es sábado — cada 7 días hacia atrás repite el patrón.
  return dayIndex % 7 === 5 || dayIndex % 7 === 6
}

/** 30 días de actividad, con picos de fin de semana — la vista default de /metricas. */
export const tenantMetrics = (overrides: Partial<TenantMetricsFixture> = {}): TenantMetricsFixture => ({
  windowDays: METRICS_WINDOW_DAYS,
  from: artDateString(new Date(FROZEN_NOW.getTime() - (METRICS_WINDOW_DAYS - 1) * 86_400_000)),
  to: artDateString(FROZEN_NOW),
  bookingsPerDay: thirtyDaySeries((date, i) => ({ date, count: isWeekend(i) ? 14 : 6 })),
  revenuePerDay: thirtyDaySeries((date, i) => ({ date, amountCents: isWeekend(i) ? 2_100_000 : 900_000 })),
  topSlots: [
    { time: '20:00', count: 24 },
    { time: '21:00', count: 21 },
    { time: '19:00', count: 18 },
    { time: '18:00', count: 15 },
    { time: '17:00', count: 12 },
  ],
  noShow: { noShow: 8, completed: 142, finished: 150, rate: 8 / 150 },
  noShowPrev: { noShow: 11, completed: 119, finished: 130, rate: 11 / 130 },
  revenue: {
    totalCents: 36_000_000,
    byCategory: { booking: 30_000_000, product_sale: 6_000_000 },
  },
  ...overrides,
})

/** Complejo recién arrancado: sin reservas todavía en la ventana de 30 días. */
export const tenantMetricsEmpty = (): TenantMetricsFixture =>
  tenantMetrics({
    bookingsPerDay: thirtyDaySeries((date) => ({ date, count: 0 })),
    revenuePerDay: thirtyDaySeries((date) => ({ date, amountCents: 0 })),
    topSlots: [],
    noShow: { noShow: 0, completed: 0, finished: 0, rate: 0 },
    noShowPrev: { noShow: 0, completed: 0, finished: 0, rate: 0 },
    revenue: { totalCents: 0, byCategory: {} },
  })

type QueueDepthFixture = { queue: string; depth: number | null }

export type SystemStatusFixture = {
  db: { status: 'ok' | 'down'; latencyMs: number | null }
  pgboss: { queues: QueueDepthFixture[] }
  lastHealthPing: string | null
  timestamp: string
}

const QUEUE_NAMES = [
  'process-mp-webhook',
  'generate-abonado-slots',
  'send-email',
  'expire-trials',
  'auto-complete-bookings',
  'dunning-retry',
  'data-retention-cleanup',
  'expire-pending-booking',
  'expire-pending-booking-sweep',
  'refresh-mp-tokens',
  'reconcile-pending-payments',
  'push-send',
  'health-ping',
]

/** Sistema operativo: DB al día, colas vacías, último health-ping reciente. */
export const systemStatusOk = (overrides: Partial<SystemStatusFixture> = {}): SystemStatusFixture => ({
  db: { status: 'ok', latencyMs: 12 },
  pgboss: { queues: QUEUE_NAMES.map((queue) => ({ queue, depth: 0 })) },
  lastHealthPing: hoursFromNow(-0.05).toISOString(),
  timestamp: FROZEN_NOW.toISOString(),
  ...overrides,
})

/** Base de datos caída: todas las colas degradan a profundidad desconocida (fail-open). */
export const systemStatusDbDown = (): SystemStatusFixture => ({
  db: { status: 'down', latencyMs: null },
  pgboss: { queues: QUEUE_NAMES.map((queue) => ({ queue, depth: null })) },
  lastHealthPing: hoursFromNow(-2).toISOString(),
  timestamp: FROZEN_NOW.toISOString(),
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
