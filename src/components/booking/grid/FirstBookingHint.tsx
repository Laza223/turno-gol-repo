import { Sparkles } from 'lucide-react'

/**
 * Hint de primera vez (MASTER §7.2): el vacío enseña la primera acción. Se
 * muestra solo cuando el día está abierto, hay canchas y aún no hay reservas.
 */
export function FirstBookingHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="note"
      className="flex items-center gap-2.5 rounded-lg border border-emerald-600/25 bg-primary/5 px-3 py-2 text-sm text-foreground dark:border-emerald-400/25 dark:bg-emerald-500/10"
    >
      <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
      <p className="flex-1">Tocá cualquier horario libre para cargar tu primera reserva.</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md px-3 min-h-11 md:min-h-9 text-sm font-medium text-emerald-800 transition-colors duration-150 hover:bg-primary/10 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
      >
        Entendido
      </button>
    </div>
  )
}
