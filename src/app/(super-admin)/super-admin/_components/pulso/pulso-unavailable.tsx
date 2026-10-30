/** Lo que se dibuja en lugar de una sección que no se pudo leer a tiempo. */
export function PulsoUnavailable() {
  return (
    <section
      role="status"
      className="rounded-lg border border-border bg-card px-4 py-4 lg:py-6 text-center shadow-xs sm:px-6"
    >
      <p className="text-sm font-medium text-foreground">No se pudo leer a tiempo</p>
      <p className="mt-1 text-sm text-muted-foreground">Recargá en un rato.</p>
    </section>
  )
}
