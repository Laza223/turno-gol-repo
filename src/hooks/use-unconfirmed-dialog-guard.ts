'use client'

import { useState } from 'react'

/**
 * Cierre de un diálogo que aloja un `TicketPanel` (vende o anota un fiado).
 *
 * **No se cierra con una venta en vuelo ni sin confirmar.** Si la red se corta y no
 * se sabe si la venta entró, el ticket guarda la clave para reintentar ESA venta (ver
 * `useUnconfirmedSubmit`); cerrar el diálogo lo desmonta y la pierde, y al reabrir
 * cobrar de nuevo la duplicaría (venta, stock y caja). Mientras tanto Esc y ✕ no
 * cierran y el ticket ya dice qué hacer. Con la venta en vuelo tampoco: cerrar ahí
 * desmonta el ticket ANTES de saber si la red se cortó.
 *
 * Tocar afuera NUNCA cierra: un toque de más en el overlay no puede borrar un ticket
 * armado con gente esperando.
 *
 * Uso: `onOpenChange` al `<Dialog>`, `onInteractOutside` al `<DialogContent>` y
 * `onUnconfirmedChange` al `<TicketPanel>`.
 */
export function useUnconfirmedDialogGuard(onOpenChange: (open: boolean) => void) {
  const [unconfirmed, setUnconfirmed] = useState(false)

  return {
    onUnconfirmedChange: setUnconfirmed,
    onOpenChange: (next: boolean) => {
      if (!next && unconfirmed) return
      onOpenChange(next)
    },
    onInteractOutside: (event: Event) => event.preventDefault(),
  }
}
