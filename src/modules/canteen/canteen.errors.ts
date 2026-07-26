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
