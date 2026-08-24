'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RefundContactPanel } from './RefundContactPanel'
import type { RefundContactInfo } from './actions'

/**
 * El diálogo que aparece apenas el jugador cancela un turno con seña, montado
 * ARRIBA de la lista de reservas.
 *
 * Por qué no vive adentro del botón de cancelar, que sería lo natural:
 * `cancelMyBookingAction` termina con `revalidatePath('/mis-reservas')`, así
 * que apenas responde, el servidor manda la lista sin la reserva cancelada
 * —ya no está en "Próximos"— y React desmonta esa tarjeta completa. Medido en
 * el navegador: el panel con el monto y el botón de WhatsApp aparecía 300 ms
 * y se cerraba solo. Acá el provider no se mueve del árbol: la revalidación
 * le cambia los `children` y su estado sigue en pie.
 *
 * El recordatorio persistente de la tarjeta (en "Historial", mientras la
 * devolución siga pendiente) es lo que hace que el circuito funcione igual si
 * alguien cierra este diálogo sin leerlo. Este es el aviso; ese es el ancla.
 */
const RefundDialogContext = createContext<(refund: RefundContactInfo) => void>(() => {})

/** Abre el diálogo de devolución. Sin provider arriba, es un no-op. */
export function useRefundDialog(): (refund: RefundContactInfo) => void {
  return useContext(RefundDialogContext)
}

export function RefundDialogProvider({ children }: { children: ReactNode }) {
  const [refund, setRefund] = useState<RefundContactInfo | null>(null)
  const show = useCallback((next: RefundContactInfo) => setRefund(next), [])

  return (
    <RefundDialogContext.Provider value={show}>
      {children}
      <Dialog open={refund !== null} onOpenChange={(v) => !v && setRefund(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reserva cancelada</DialogTitle>
          </DialogHeader>
          {refund && <RefundContactPanel refund={refund} />}
        </DialogContent>
      </Dialog>
    </RefundDialogContext.Provider>
  )
}
