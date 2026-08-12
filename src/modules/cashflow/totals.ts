/**
 * Las dos cuentas del día del complejo, escritas UNA vez.
 *
 * B14 — el criterio de salida de Fase 1 pide "fuente única de agregados: el
 * mismo número en toda superficie que lo muestre… verificado con test de
 * consistencia, no a ojo". Antes de este archivo las dos cuentas estaban
 * copiadas a mano en seis lugares, sobre dos tipos distintos (el resumen vivo
 * del día y el snapshot que se guarda al cerrar), y el "Hoy: $X" del sidebar
 * iba a ser la séptima. Una diferencia de un signo entre dos de esas copias es
 * invisible en code review y el complejo la lee como plata que falta.
 *
 * El módulo es puro a propósito: no importa nada, así lo pueden usar tanto los
 * services (que hablan con la base) como los Server Components que muestran el
 * cierre ya guardado.
 */

/** Lo mínimo que hace falta para saber cuánto entró: lo cumplen `DaySummary` y `DailyCashCloseRow`. */
export type CollectedParts = {
  totalIncome: number
  totalAdjustments: number
}

export type BalanceParts = CollectedParts & {
  totalExpense: number
}

/**
 * Lo COBRADO: ingresos + ajustes, sin restar egresos. Es lo que el complejo
 * llama "lo de hoy" y lo que muestran `/caja`, la pantalla "Hoy" y el sidebar.
 */
export function collectedFrom(parts: CollectedParts): number {
  return parts.totalIncome + parts.totalAdjustments
}

/**
 * El SALDO: lo cobrado menos los egresos. Contesta otra pregunta —"cuánto
 * queda", no "cuánto entró"— y por eso nunca es el número de "Hoy: $X".
 */
export function balanceFrom(parts: BalanceParts): number {
  return collectedFrom(parts) - parts.totalExpense
}
