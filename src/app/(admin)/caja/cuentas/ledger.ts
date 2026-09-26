import type { CashFlowListRow, CashPaymentMethod } from '@/modules/cashflow/cashflow.types'
import { categoryLabel, formatTimeArt, movementTitle } from '../caja-lib'

/** De qué es un movimiento, para su ícono y para los filtros del libro. */
export type LedgerKind = 'turno' | 'cantina' | 'fiado' | 'torneo' | 'gasto' | 'otro'

/**
 * Una fila del libro de la noche, ya lista para mostrar. Se arma en el
 * servidor: el cliente solo filtra y agrupa, y no recibe fechas ni textos
 * crudos de la base.
 */
export type LedgerRow = {
  id: string
  /** Hora argentina, "21:06". */
  time: string
  kind: LedgerKind
  /** Lo que se lee primero: quién pagó el turno o qué se vendió. */
  text: string
  /** Lo que va al lado, en gris: el equipo, la seña, el rubro del gasto. */
  detail: string | null
  method: CashPaymentMethod
  cents: number
  /** Plata que salió: va en rojo y con "−". Todo lo demás entró. */
  expense: boolean
}

const FIADO_PREFIX = 'Fiado cobrado — '
const CANTINA_PREFIX = /^Cantina:\s*/

/**
 * Qué dice cada movimiento en Caja › Cuentas.
 *
 * Un cobro de turno se lee por QUIÉN pagó, nunca por su `description`: el cobro
 * de un turno ya terminado se guarda como "Cobro de deuda atrasada" (así lo
 * escribe `chargeDebtAction`, desde Hoy, la Grilla o Caja), y un turno jugado y
 * no cobrado no es una deuda (DESIGN.md). En el Vagón eran 131 de 190 cobros.
 *
 * La venta de cantina pierde el "Cantina: " del ticket porque el ícono ya lo
 * dice. El fiado cobrado queda con su texto ("Fiado cobrado — Cachi"): ahí el
 * nombre es lo que se busca.
 */
export function toLedgerRow(cf: CashFlowListRow): LedgerRow {
  const base = {
    id: cf.id,
    time: formatTimeArt(cf.occurredAt),
    method: cf.method,
    cents: cf.amount,
    expense: cf.type === 'expense',
  }

  if (cf.type === 'expense') {
    return {
      ...base,
      kind: 'gasto',
      text: cf.description,
      detail: categoryLabel(cf.type, cf.category),
    }
  }

  if (cf.category === 'booking') {
    const isDeposit = movementTitle(cf.description) === 'Seña del turno'
    return {
      ...base,
      kind: 'turno',
      text: cf.counterpartName ?? (isDeposit ? 'Seña del turno' : 'Turno'),
      detail: isDeposit ? 'Seña' : cf.bookingTeam ? `Equipo ${cf.bookingTeam}` : null,
    }
  }

  if (cf.category === 'product_sale') {
    if (cf.description.startsWith(FIADO_PREFIX)) {
      return { ...base, kind: 'fiado', text: cf.description, detail: null }
    }
    return {
      ...base,
      kind: 'cantina',
      text: cf.description.replace(CANTINA_PREFIX, '') || cf.description,
      detail: null,
    }
  }

  if (cf.category === 'tournament') {
    return { ...base, kind: 'torneo', text: cf.description, detail: null }
  }

  return {
    ...base,
    kind: 'otro',
    text: movementTitle(cf.description),
    detail: categoryLabel(cf.type, cf.category),
  }
}

/** Un bloque del libro: todo lo que pasó en una misma hora, en el orden de la lista. */
export type LedgerHour = {
  /** "21", la hora argentina. */
  hour: string
  rows: LedgerRow[]
  /** Lo que entró menos lo que salió en esa hora. */
  netCents: number
}

/**
 * Agrupa por hora las filas CONSECUTIVAS de la misma hora. Las filas llegan del
 * más nuevo al más viejo (`getCashFlows` ordena por `occurred_at DESC`), así que
 * lo de pasada la medianoche queda arriba de todo, como el final de la noche que
 * es, y no al principio por empezar con "00".
 */
export function groupByHour(rows: LedgerRow[]): LedgerHour[] {
  const groups: LedgerHour[] = []
  for (const row of rows) {
    const hour = row.time.slice(0, 2)
    const signed = row.expense ? -row.cents : row.cents
    const last = groups.at(-1)
    if (last?.hour === hour) {
      last.rows.push(row)
      last.netCents += signed
    } else {
      groups.push({ hour, rows: [row], netCents: signed })
    }
  }
  return groups
}
