/**
 * `onCloseAutoFocus` de los diálogos de cobro y anulación, que se abren ENCIMA
 * del modal con la lista de Cuentas (`PendingLines`). Radix devuelve el foco al
 * botón que abrió el diálogo, pero después de cobrar esa fila ya no existe (el
 * `revalidatePath` la saca): el foco caía en el `body` y Escape dejaba de
 * cerrar la lista (lo encontró el e2e del fiado, 2026-09-26). Si queda un
 * diálogo abierto debajo, el foco vuelve a él.
 */
export function refocusOpenDialog(event: Event): void {
  const under = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]')
  if (!under) return
  event.preventDefault()
  under.focus()
}
