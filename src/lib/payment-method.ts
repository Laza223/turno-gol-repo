/**
 * Vocabulario único de "método de pago" (cash/transfer/mercadopago/other).
 * Vive en @/lib (no en caja-lib.ts) porque lo consumen componentes reusables
 * fuera de la capa app (BookingPopover) que no pueden importar de @/app/**.
 */

export type MethodKey = 'cash' | 'transfer' | 'mercadopago' | 'other'

export const METHOD_LABELS: Record<MethodKey, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  other: 'Otro',
}

/** Forma array para <select>/radios que necesitan las 4 opciones (incluye 'other'). */
export const PAYMENT_METHOD_OPTIONS = (
  ['cash', 'transfer', 'mercadopago', 'other'] as const satisfies readonly MethodKey[]
).map((value) => ({ value, label: METHOD_LABELS[value] }))
