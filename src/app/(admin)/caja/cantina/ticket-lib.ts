/**
 * Estado y helpers puros del ticket de venta de cantina (Fase 3 del rediseño
 * Caja/Cantina). Sin React ni DB — todo unit-testeable. El único consumidor
 * es `TicketPanel`; el service (`sellTicket`, canteen-sale.service.ts) sigue
 * siendo la única fuente de verdad de precio/stock — acá solo se arma el
 * ticket en el cliente antes de mandarlo.
 */

/** Tope duro de cantidad por línea cuando el producto no controla stock. */
const HARD_CAP = 99

export type TicketLine = {
  productId: string
  name: string
  /** Centavos ARS, snapshot al agregar la línea. */
  price: number
  qty: number
  /** null = sin control de stock (igual aplica el tope duro de 99). */
  stock: number | null
}

/** Forma mínima de producto que necesita el ticket (subset de CanteenProductRow). */
export type TicketProduct = {
  id: string
  name: string
  price: number
  stock: number | null
}

/** Tope de cantidad para una línea: el stock del producto, o el tope duro si no controla stock. */
export function maxQtyFor(stock: number | null): number {
  return Math.min(stock ?? HARD_CAP, HARD_CAP)
}

/**
 * Tap sobre un producto del grid: si ya está en el ticket suma 1 respetando
 * el tope (stock del producto o 99); al tope es no-op (mismo array, sin
 * cambios). Si no está, agrega una línea nueva en cantidad 1.
 */
export function addProduct(lines: TicketLine[], product: TicketProduct): TicketLine[] {
  const idx = lines.findIndex((l) => l.productId === product.id)
  if (idx === -1) {
    return [
      ...lines,
      { productId: product.id, name: product.name, price: product.price, qty: 1, stock: product.stock },
    ]
  }
  const line = lines[idx]!
  if (line.qty >= maxQtyFor(line.stock)) return lines
  return lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l))
}

/** Botón "+" de una línea ya agregada: mismo tope que addProduct. */
export function incrementLine(lines: TicketLine[], productId: string): TicketLine[] {
  return lines.map((l) => {
    if (l.productId !== productId) return l
    return l.qty >= maxQtyFor(l.stock) ? l : { ...l, qty: l.qty + 1 }
  })
}

/** Botón "−" de una línea: piso 1 — para sacarla del todo está `removeLine`. */
export function decrementLine(lines: TicketLine[], productId: string): TicketLine[] {
  return lines.map((l) => (l.productId === productId ? { ...l, qty: Math.max(1, l.qty - 1) } : l))
}

/** Quita la línea entera del ticket (botón de borrar). */
export function removeLine(lines: TicketLine[], productId: string): TicketLine[] {
  return lines.filter((l) => l.productId !== productId)
}

/** Total del ticket, centavos ARS. */
export function ticketTotal(lines: TicketLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0)
}

/** Cantidad total de unidades del ticket (suma de qty de todas las líneas). */
export function ticketCount(lines: TicketLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0)
}
