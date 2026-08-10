'use client'

import { Sparkles } from 'lucide-react'
import { useDismissibleHint } from '@/hooks/use-dismissible-hint'

// Hint de primera visita a la Caja (MASTER §7.2 / pages/caja.md §6): enseña el
// ritual de cierre una sola vez. Mismo hook que el hint de la grilla — era una
// copia literal de `useDismissibleHint`, que existe justamente para esto.
const HINT_STORAGE_KEY = 'tg-hint-caja-cierre'

export function CajaCierreHint() {
  const { dismissed, dismiss } = useDismissibleHint(HINT_STORAGE_KEY)

  if (dismissed) return null

  return (
    <div
      role="note"
      className="flex items-center gap-2.5 rounded-lg border border-emerald-600/25 bg-primary/5 px-3 py-2 text-sm text-foreground dark:border-emerald-400/25 dark:bg-emerald-500/10"
    >
      <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
      <p className="flex-1">
        Al final del día, cerrá la caja: guarda el resumen y bloquea los movimientos.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-md px-2 py-1 min-h-11 md:min-h-9 text-sm font-medium text-emerald-800 transition-colors duration-150 hover:bg-primary/10 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
      >
        Entendido
      </button>
    </div>
  )
}
