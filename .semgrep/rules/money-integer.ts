// Fixture de turnogol-money-not-integer.
// Violaciones a propósito — ver .semgrepignore.
//
// OJO: `paths.include` de la regla apunta a src/shared/db/schema/**, así que
// este archivo NO matchea por path. El fixture igual sirve para `semgrep --test`,
// que ignora paths.include y corre la regla contra el archivo pareado.

declare function numeric(col: string, cfg?: unknown): unknown
declare function decimal(col: string, cfg?: unknown): unknown
declare function real(col: string): unknown
declare function doublePrecision(col: string): unknown
declare function integer(col: string): unknown

// ruleid: turnogol-money-not-integer
export const malPrecio = numeric('price_snapshot', { precision: 12, scale: 2 })

// ruleid: turnogol-money-not-integer
export const malMonto = decimal('amount_cents')

// ruleid: turnogol-money-not-integer
export const malTotal = real('total_cents')

// ruleid: turnogol-money-not-integer
export const malArancel = doublePrecision('inscription_fee')

// ok: turnogol-money-not-integer
export const bienPrecio = integer('price_snapshot')

// ok: turnogol-money-not-integer
// Coordenadas: numeric es lo correcto acá, y el metavariable-regex las deja pasar.
export const bienLatitud = numeric('latitude', { precision: 10, scale: 7 })

// ok: turnogol-money-not-integer
export const bienLongitud = numeric('longitude', { precision: 10, scale: 7 })
