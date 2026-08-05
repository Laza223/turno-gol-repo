export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Canteen product ${productId} not found for this tenant.`)
    this.name = 'ProductNotFoundError'
  }
}

export class ProductInactiveError extends Error {
  constructor(productName: string) {
    super(`Canteen product '${productName}' is inactive.`)
    this.name = 'ProductInactiveError'
  }
}

export class InsufficientStockError extends Error {
  constructor(
    public readonly productName: string,
    public readonly available: number,
  ) {
    super(`Insufficient stock for '${productName}': ${available} available.`)
    this.name = 'InsufficientStockError'
  }
}

export class EmptyTicketError extends Error {
  constructor() {
    super('A ticket needs at least one line.')
    this.name = 'EmptyTicketError'
  }
}

export class StockNotTrackedError extends Error {
  constructor(productName: string) {
    super(`Product '${productName}' does not track stock; enable stock control first.`)
    this.name = 'StockNotTrackedError'
  }
}

/**
 * updateProduct (edición de catálogo) rechaza un cambio de stock número→otro
 * número: eso pisaba ventas concurrentes con un snapshot stale del diálogo
 * (RI #4 D4). Solo se permite null→número, número→null, o número→el mismo
 * número (no-op); el ajuste real va por Reposición/Merma/Ajuste (ledger).
 */
export class StockNotEditableFromCatalogError extends Error {
  constructor(productName: string) {
    super(
      `Stock for '${productName}' cannot be edited from the catalog form; use the stock ledger (purchase/exit/adjustment) instead.`,
    )
    this.name = 'StockNotEditableFromCatalogError'
  }
}

/**
 * Venta de cantina cargada a un turno (`bookingId`) que no existe bajo este
 * tenant. El FK a `bookings` NO alcanza como defensa: los chequeos de clave
 * foránea corren con los permisos del dueño de la tabla y no ven RLS, así que
 * sin esta validación un id de otro complejo entraría igual y dejaría un
 * cash_flow apuntando afuera.
 */
export class SaleBookingNotFoundError extends Error {
  constructor(bookingId: string) {
    super(`Booking ${bookingId} not found for this tenant.`)
    this.name = 'SaleBookingNotFoundError'
  }
}

export class TabNotFoundError extends Error {
  constructor(tabId: string) {
    super(`Canteen tab ${tabId} not found for this tenant.`)
    this.name = 'TabNotFoundError'
  }
}

export class TabNotOpenError extends Error {
  constructor(tabId: string) {
    super(`Canteen tab ${tabId} is not open (already settled or canceled).`)
    this.name = 'TabNotOpenError'
  }
}

/**
 * Fiados no admiten pago parcial (a diferencia de turnos/inscripciones): el
 * ticket se saldó cuando se entregó, así que las líneas de cobro (D2, método
 * mixto) tienen que sumar EXACTO el total del ticket, ni más ni menos.
 */
export class TabChargeMismatchError extends Error {
  constructor(
    public readonly expected: number,
    public readonly received: number,
  ) {
    super(`Charges must sum exactly ${expected} for this tab (got ${received}).`)
    this.name = 'TabChargeMismatchError'
  }
}
