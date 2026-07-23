import type { CanteenProductRow, CanteenTabRow, StockLedgerEntry } from '@/modules/canteen/canteen.types'
// Tipos puros (DTOs) del reporte, colocados junto a las queries en
// canteen-report.service.ts (server-only, NO se toca ese archivo). `import
// type` se borra en compilación (isolatedModules) — mismo criterio que
// canteen.types.ts: no arrastra nada server-only a Storybook.
import type {
  CanteenDailyTotal,
  CanteenMethodTotal,
  SalesRankingRow,
} from '@/modules/canteen/canteen-report.service'
import { artDateString, daysFromNow, hoursFromNow } from './clock'
import { uid } from './ids'
import { staffManager, staffMember } from './staff'
import { tenant } from './tenant'

/**
 * `canteen.service.ts`/`stock.service.ts`/`canteen-sale.service.ts`/
 * `canteen-tab.service.ts` (server-only, `.service.ts`) no son importables
 * acá ni en stories — los TIPOS sí (`canteen.types.ts`, sin imports), mismo
 * patrón que el resto de `src/test/fixtures/`. Rango de ids: 801-849
 * canteen_products, 851-899 stock_movements, 901-949 canteen_tabs (ver
 * convención de rangos en `ids.ts`).
 */

export const canteenProduct = (overrides: Partial<CanteenProductRow> = {}): CanteenProductRow => ({
  id: uid(801),
  tenantId: tenant().id,
  name: 'Agua mineral 500ml',
  price: 150000,
  cost: 80000,
  stock: 24,
  minStock: 6,
  isActive: true,
  sortOrder: 0,
  createdAt: hoursFromNow(-400),
  updatedAt: hoursFromNow(-2),
  ...overrides,
})

/** Sin control de stock (stock/minStock null) — se vende sin límite. */
export const canteenProductSinStock = (): CanteenProductRow =>
  canteenProduct({
    id: uid(802),
    name: 'Alfajor Havanna',
    price: 180000,
    cost: null,
    stock: null,
    minStock: null,
  })

/** Stock en o por debajo del mínimo (badge de alerta ámbar). */
export const canteenProductStockBajo = (): CanteenProductRow =>
  canteenProduct({
    id: uid(803),
    name: 'Gatorade 500ml',
    price: 250000,
    cost: 140000,
    stock: 2,
    minStock: 5,
  })

/** Agotado (stock 0) — deshabilita el botón de venta rápida. */
export const canteenProductAgotado = (): CanteenProductRow =>
  canteenProduct({
    id: uid(804),
    name: 'Cerveza IPA lata',
    price: 350000,
    cost: 200000,
    stock: 0,
    minStock: 6,
  })

/** Pausado (is_active=false) — solo visible en la tab Productos, nunca en la venta rápida. */
export const canteenProductPausado = (): CanteenProductRow =>
  canteenProduct({
    id: uid(805),
    name: 'Sanguchito de miga (descontinuado)',
    price: 300000,
    isActive: false,
    stock: 0,
    minStock: null,
  })

/** Catálogo activo típico (venta rápida / grid de cantina). */
export const canteenProducts = (): CanteenProductRow[] => [
  canteenProduct(),
  canteenProductStockBajo(),
  canteenProductSinStock(),
]

/** Catálogo completo (tab Productos: incluye agotado y pausado). */
export const canteenProductsWithInactive = (): CanteenProductRow[] => [
  ...canteenProducts(),
  canteenProductAgotado(),
  canteenProductPausado(),
]

export const stockLedgerEntry = (overrides: Partial<StockLedgerEntry> = {}): StockLedgerEntry => ({
  id: uid(851),
  tenantId: tenant().id,
  productId: uid(801),
  kind: 'sale',
  qty: -2,
  unitCost: null,
  unitPrice: 150000,
  note: null,
  cashFlowId: uid(602),
  tabId: null,
  createdBy: staffManager().id,
  occurredAt: hoursFromNow(-1),
  createdAt: hoursFromNow(-1),
  productName: 'Agua mineral 500ml',
  ...overrides,
})

/** Reposición (compra) — entra al ledger con costo por unidad, sin cash_flow. */
export const stockLedgerEntryPurchase = (): StockLedgerEntry =>
  stockLedgerEntry({
    id: uid(852),
    kind: 'purchase',
    qty: 24,
    unitCost: 80000,
    unitPrice: null,
    note: 'Reposición mensual',
    cashFlowId: null,
    createdBy: staffMember().id,
    occurredAt: hoursFromNow(-48),
    createdAt: hoursFromNow(-48),
  })

/** Salida no comercial (merma) — mueve stock, no toca caja. */
export const stockLedgerEntryWaste = (): StockLedgerEntry =>
  stockLedgerEntry({
    id: uid(853),
    productId: uid(803),
    kind: 'waste',
    qty: -1,
    unitPrice: null,
    note: 'Se rompió una botella',
    cashFlowId: null,
    createdBy: staffMember().id,
    occurredAt: hoursFromNow(-5),
    createdAt: hoursFromNow(-5),
    productName: 'Gatorade 500ml',
  })

/** Últimos movimientos (tab Productos, StockLedgerList). */
export const stockLedger = (): StockLedgerEntry[] => [
  stockLedgerEntryWaste(),
  stockLedgerEntry(),
  stockLedgerEntryPurchase(),
]

/** Fiado abierto (canteen_tabs) — FiadosList, tab Cantina. */
export const canteenTab = (overrides: Partial<CanteenTabRow> = {}): CanteenTabRow => ({
  id: uid(901),
  tenantId: tenant().id,
  debtorName: 'Capitán equipo 22hs',
  status: 'open',
  totalAmount: 450000,
  note: null,
  createdBy: staffMember().id,
  createdAt: hoursFromNow(-3),
  settledAt: null,
  settledBy: null,
  settledCashFlowId: null,
  canceledAt: null,
  canceledBy: null,
  canceledReason: null,
  ...overrides,
})

/** Fiado con nota — muestra la línea de nota extra en la lista. */
export const canteenTabConNota = (): CanteenTabRow =>
  canteenTab({
    id: uid(902),
    debtorName: 'Equipo Jueves',
    totalAmount: 720000,
    note: 'Paga el sábado que viene',
    createdAt: hoursFromNow(-30),
  })

/** Fiados abiertos típicos (venta rápida / FiadosList). */
export const canteenTabs = (): CanteenTabRow[] => [canteenTab(), canteenTabConNota()]

// ── Reporte de cantina (CanteenReport, tab Productos, Fase 7) ────────────────
// `day` en fechas relativas al reloj congelado (artDateString/daysFromNow, ver
// clock.ts) — nada de fechas calendario hardcodeadas que envejecen mal.

export const salesRankingRow = (overrides: Partial<SalesRankingRow> = {}): SalesRankingRow => ({
  productId: uid(801),
  productName: 'Agua mineral 500ml',
  units: 18,
  revenue: 18 * 150000,
  ...overrides,
})

/** Ranking típico — orden tal como lo entrega el service (revenue DESC). */
export const salesRanking = (): SalesRankingRow[] => [
  salesRankingRow(),
  salesRankingRow({
    productId: uid(803),
    productName: 'Gatorade 500ml',
    units: 10,
    revenue: 10 * 250000,
  }),
  salesRankingRow({
    productId: uid(802),
    productName: 'Alfajor Havanna',
    units: 6,
    revenue: 6 * 180000,
  }),
]

export const canteenMethodTotal = (
  overrides: Partial<CanteenMethodTotal> = {},
): CanteenMethodTotal => ({
  method: 'cash',
  total: 1250000,
  ...overrides,
})

/** Desglose típico cobrado por método — solo lo COBRADO (fiados abiertos no entran). */
export const canteenMethodTotals = (): CanteenMethodTotal[] => [
  canteenMethodTotal(),
  canteenMethodTotal({ method: 'transfer', total: 450000 }),
  canteenMethodTotal({ method: 'mercadopago', total: 300000 }),
]

export const canteenDailyTotal = (overrides: Partial<CanteenDailyTotal> = {}): CanteenDailyTotal => ({
  day: artDateString(),
  total: 620000,
  ...overrides,
})

/** Últimos 7 días típicos (rango default) — un día en $0 para ver el caso sin ventas. */
export const canteenDailyTotals = (): CanteenDailyTotal[] => [
  canteenDailyTotal({ day: artDateString(daysFromNow(-6)), total: 320000 }),
  canteenDailyTotal({ day: artDateString(daysFromNow(-5)), total: 410000 }),
  canteenDailyTotal({ day: artDateString(daysFromNow(-4)), total: 0 }),
  canteenDailyTotal({ day: artDateString(daysFromNow(-3)), total: 580000 }),
  canteenDailyTotal({ day: artDateString(daysFromNow(-2)), total: 250000 }),
  canteenDailyTotal({ day: artDateString(daysFromNow(-1)), total: 190000 }),
  canteenDailyTotal({ day: artDateString(), total: 620000 }),
]

/** 14 días (rango 30, aunque no completa los 30) — dispara el scroll vertical (>10 filas). */
export const canteenDailyTotalsLargo = (): CanteenDailyTotal[] =>
  Array.from({ length: 14 }, (_, i) =>
    canteenDailyTotal({
      day: artDateString(daysFromNow(-(13 - i))),
      total: 100000 * (i + 1),
    }),
  )
