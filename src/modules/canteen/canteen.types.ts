import type { CashPaymentMethod } from '@/modules/cashflow/cashflow.types'

export type StockMovementKind =
  | 'purchase'
  | 'sale'
  | 'waste'
  | 'courtesy'
  | 'internal_use'
  | 'adjustment'

/** Salidas no comerciales: mueven stock, NO tocan caja. */
export type StockExitReason = 'waste' | 'courtesy' | 'internal_use'

export type CanteenTabStatus = 'open' | 'paid' | 'canceled'

export type CanteenProductRow = {
  id: string
  tenantId: string
  name: string
  /** Centavos ARS. */
  price: number
  /** Centavos ARS; costo actual, sin historial. null = sin costo cargado. */
  cost: number | null
  /** null = sin control de stock. */
  stock: number | null
  /** null = sin alerta de stock bajo. */
  minStock: number | null
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export type StockMovementRow = {
  id: string
  tenantId: string
  productId: string
  kind: StockMovementKind
  /** Con signo: entradas +, salidas −. */
  qty: number
  unitCost: number | null
  unitPrice: number | null
  note: string | null
  cashFlowId: string | null
  tabId: string | null
  createdBy: string
  occurredAt: Date
  createdAt: Date
}

/** Fila del ledger con el nombre actual del producto (join para la UI). */
export type StockLedgerEntry = StockMovementRow & { productName: string }

export type CanteenTabRow = {
  id: string
  tenantId: string
  debtorName: string
  status: CanteenTabStatus
  totalAmount: number
  note: string | null
  createdBy: string
  createdAt: Date
  settledAt: Date | null
  settledBy: string | null
  settledCashFlowId: string | null
  canceledAt: Date | null
  canceledBy: string | null
  canceledReason: string | null
}

/** Línea de un ticket de venta (cobrado o fiado). */
export type TicketLineInput = {
  productId: string
  qty: number
}

/** Métodos cobrables de cantina: sin 'other' (mismo criterio que la venta actual). */
export type CanteenSaleMethod = Exclude<CashPaymentMethod, 'other'>

export type SellTicketInput = {
  lines: TicketLineInput[]
  method: CanteenSaleMethod
  /** UUID v4 generado por el cliente. Previene duplicados por doble-tap. */
  clientIdempotencyKey: string
}

export type SellTicketResult = {
  cashFlowId: string
  /** Centavos ARS. */
  total: number
  /** true si la key ya existía: no se volvió a descontar stock. */
  duplicate: boolean
}

export type CreateProductInput = {
  name: string
  price: number
  cost?: number | null
  stock?: number | null
  minStock?: number | null
  sortOrder?: number
}

export type UpdateProductInput = Partial<CreateProductInput> & {
  isActive?: boolean
}

export type RegisterPurchaseInput = {
  productId: string
  /** Unidades TOTALES que entran (la UI multiplica packs × unidades por pack). */
  units: number
  /** Centavos ARS por unidad; opcional. */
  unitCost?: number | null
  /** Si true y hay unitCost, pisa canteen_products.cost (costo actual, sin historial). */
  updateProductCost?: boolean
  /**
   * "Pagalo de la caja" (migr. 050): crea un cash_flow expense/merchandise
   * por units × unitCost en la MISMA tx. Requiere unitCost (Zod lo valida).
   * Con la caja del día cerrada, TODA la reposición se rechaza (atómico).
   */
  expense?: { method: CanteenSaleMethod } | null
  note?: string | null
  clientIdempotencyKey: string
}

export type RegisterStockExitInput = {
  productId: string
  /** Unidades que salen (positivas; el service las registra con signo −). */
  units: number
  reason: StockExitReason
  /** Motivo obligatorio: es lo que hace auditable la salida sin venta. */
  note: string
  clientIdempotencyKey: string
}

export type AdjustStockInput = {
  productId: string
  /** Stock real contado; el service registra el delta como 'adjustment'. */
  newStock: number
  note: string
  clientIdempotencyKey: string
}
