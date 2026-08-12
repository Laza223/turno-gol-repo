import type { CashFlowRow, DailyCashCloseRow, DaySummary } from '@/modules/cashflow/cashflow.types'
import { balanceFrom, collectedFrom } from '@/modules/cashflow/totals'
import { artDateString, daysFromNow, FROZEN_NOW, hoursFromNow } from './clock'
import { uid } from './ids'
import { staffManager, staffMember } from './staff'
import { tenant } from './tenant'

const dateAt = (offsetDays: number): Date =>
  new Date(`${artDateString(daysFromNow(offsetDays))}T00:00:00.000Z`)

/** Default: ingreso de una seña de reserva, cobrada por MercadoPago. */
export const cashFlow = (overrides: Partial<CashFlowRow> = {}): CashFlowRow => ({
  id: uid(601),
  tenantId: tenant().id,
  type: 'income',
  category: 'booking',
  amount: 450000,
  method: 'mercadopago',
  description: 'Seña turno 16:00 — Cancha 1',
  bookingId: uid(1001),
  tournamentTeamId: null,
  registeredBy: staffMember().id,
  occurredAt: hoursFromNow(-26),
  createdAt: hoursFromNow(-26),
  ...overrides,
})

/** Venta de cantina — cobrada en efectivo en el mostrador. */
export const cashFlowProductSale = (): CashFlowRow =>
  cashFlow({
    id: uid(602),
    category: 'product_sale',
    amount: 500000,
    method: 'cash',
    description: 'Venta cantina: Gatorade x2, Agua x1',
    bookingId: null,
    registeredBy: staffManager().id,
    occurredAt: hoursFromNow(-3),
    createdAt: hoursFromNow(-3),
  })

/** Gasto operativo (control de gastos, cambio de decisión sobre caja). */
export const cashFlowExpense = (): CashFlowRow =>
  cashFlow({
    id: uid(603),
    type: 'expense',
    category: 'operating_expense',
    amount: 800000,
    method: 'cash',
    description: 'Compra de pelotas y petos nuevos',
    bookingId: null,
    registeredBy: staffMember().id,
    occurredAt: hoursFromNow(-5),
    createdAt: hoursFromNow(-5),
  })

/** Ajuste manual — corrección de un no-show cargado por error. */
export const cashFlowAdjustment = (): CashFlowRow =>
  cashFlow({
    id: uid(604),
    type: 'adjustment',
    category: 'no_show_correction',
    amount: -450000,
    method: 'other',
    description: 'Corrección: no-show cargado por error, se revierte la seña capturada',
    bookingId: uid(1006),
    registeredBy: staffMember().id,
    occurredAt: hoursFromNow(-1),
    createdAt: hoursFromNow(-1),
  })

export const cashFlows = (): CashFlowRow[] => [
  cashFlow(),
  cashFlowProductSale(),
  cashFlowExpense(),
  cashFlowAdjustment(),
]

/** Cierre de caja del día de hoy: sobró un poco de efectivo declarado. */
export const dailyCashClose = (overrides: Partial<DailyCashCloseRow> = {}): DailyCashCloseRow => ({
  id: uid(651),
  tenantId: tenant().id,
  date: dateAt(0),
  totalIncome: 4500000,
  totalAdjustments: 0,
  totalExpense: 800000,
  balance: 3700000,
  declaredCash: 3650000,
  diffAmount: -50000,
  // Fixture legacy (pre-049) a propósito: cubre el branch de cierre viejo.
  openingCash: null,
  expectedCash: null,
  note: 'Faltaron $500, seguramente vuelto de más.',
  closedBy: staffMember().id,
  closedAt: hoursFromNow(-2),
  ...overrides,
})

/**
 * Resumen del día ya cerrado — cifras consistentes con `dailyCashClose()`.
 *
 * B14: `collected` y `balance` se DERIVAN de las partes con los mismos helpers
 * que usa producción, en vez de escribirse a mano. Un fixture con los totales
 * tipeados puede codificar un par imposible (ingresos que no suman su total) y
 * entonces el test pasa contra una realidad que la base nunca podría producir.
 * Los overrides se aplican antes de derivar, así que pisar `totalIncome`
 * recalcula los dos totales solo.
 */
export const daySummary = (overrides: Partial<DaySummary> = {}): DaySummary => {
  const base = {
    date: artDateString(FROZEN_NOW),
    totalIncome: 4500000,
    totalAdjustments: 0,
    totalExpense: 800000,
    byCategory: { booking: 3600000, product_sale: 900000, operating_expense: 800000 },
    byMethod: { cash: 2000000, mercadopago: 2000000, transfer: 500000 },
    isClosed: true,
    close: dailyCashClose(),
    ...overrides,
  }
  return { ...base, collected: collectedFrom(base), balance: balanceFrom(base) }
}

/** Día en curso, todavía sin cerrar — solo movimientos de la mañana/mediodía. */
export const daySummaryOpen = (): DaySummary =>
  daySummary({
    totalIncome: 1800000,
    totalAdjustments: 0,
    totalExpense: 0,
    byCategory: { booking: 1500000, product_sale: 300000 },
    byMethod: { mercadopago: 900000, cash: 600000, transfer: 300000 },
    isClosed: false,
    close: null,
  })
