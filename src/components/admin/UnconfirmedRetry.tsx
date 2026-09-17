/** La frase de un envío sin respuesta; `what` es qué se mandó ("la venta de $ 3.000"). */
export function unconfirmedMessage(what: string): string {
  return `Se cortó la conexión y no sabemos si ${what} entró. Reintentá antes de cargar otra cosa: si ya había entrado, no se registra dos veces.`
}

/**
 * Lo que muestra un diálogo de `/caja` mientras un envío quedó sin respuesta
 * (`useUnconfirmedSubmit`): no se sabe si entró, y lo único que se puede hacer
 * es reintentar ESE mismo envío. Reemplaza al formulario en vez de
 * deshabilitarlo: los campos pueden no coincidir con lo que se mandó (se
 * reinician al reabrir el diálogo), y el reintento manda lo guardado.
 */
export function UnconfirmedRetry({
  what,
  retryLabel,
  isPending,
  onRetry,
}: {
  /** Qué se mandó: ver `unconfirmedMessage`. */
  what: string
  retryLabel: string
  isPending: boolean
  onRetry: () => void
}) {
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        {unconfirmedMessage(what)}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isPending}
        className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? 'Reintentando…' : retryLabel}
      </button>
    </div>
  )
}
