'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

// Hint de primera visita a la Caja (MASTER §7.2 / pages/caja.md §6): enseña el
// ritual de cierre una sola vez. Mismo patrón que el hint de la grilla.
const HINT_STORAGE_KEY = 'tg-hint-caja-cierre'

export function CajaCierreHint() {
  // Arranca descartado para evitar flash; se habilita post-mount si nunca se vio.
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(HINT_STORAGE_KEY) === '1')
    } catch {
      /* sin storage el hint no aparece: mejor mudo que repetitivo */
    }
  }, [])

  if (dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(HINT_STORAGE_KEY, '1')
    } catch {
      /* solo esta visita */
    }
    setDismissed(true)
  }

  return (
    <div
      role="note"
      className="flex items-center gap-2.5 rounded-lg border border-emerald-600/25 bg-emerald-600/5 px-3 py-2 text-sm text-foreground dark:border-emerald-400/25 dark:bg-emerald-500/10"
    >
      <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
      <p className="flex-1">
        Al final del día, cerrá la caja: guarda el resumen y bloquea los movimientos.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-emerald-800 transition-colors duration-150 hover:bg-emerald-600/10 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
      >
        Entendido
      </button>
    </div>
  )
}
