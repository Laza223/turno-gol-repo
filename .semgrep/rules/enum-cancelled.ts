// Fixture de turnogol-enum-cancelled-doble-l.
// Violaciones a propósito — ver .semgrepignore.

// ok: turnogol-enum-cancelled-doble-l
export function usePatronDeCleanup(run: () => void) {
  // `cancelled` como IDENTIFICADOR es el patrón de cleanup de useEffect y NO
  // debe matchear. Es el caso que separa esta regla de un grep.
  let cancelled = false
  void run
  return () => {
    cancelled = true
    return cancelled
  }
}

// ruleid: turnogol-enum-cancelled-doble-l
export const malStatusLiteral = { status: 'cancelled' }

// ok: turnogol-enum-cancelled-doble-l
export const bienStatusLiteral = { status: 'canceled' }

// ruleid: turnogol-enum-cancelled-doble-l
export type MalRow = { cancelled_at: string | null }

// ok: turnogol-enum-cancelled-doble-l
export type BienRow = { canceled_at: string | null }

// ruleid: turnogol-enum-cancelled-doble-l
export type MalCamel = { cancelledBy: string | null }

// ok: turnogol-enum-cancelled-doble-l
export type BienCamel = { canceledBy: string | null }
