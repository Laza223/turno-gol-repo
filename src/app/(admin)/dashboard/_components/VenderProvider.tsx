'use client'

import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useUnconfirmedDialogGuard } from '@/hooks/use-unconfirmed-dialog-guard'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { CreateTabAction, SellTicketAction } from '@/app/(admin)/caja/cantina/TicketPanel'
import { VenderDialog } from './VenderDialog'

type VenderContextValue = {
  /** El modal de venta está abierto. */
  open: boolean
  setOpen: (open: boolean) => void
}

const VenderContext = createContext<VenderContextValue | null>(null)

export function useVender(): VenderContextValue {
  const value = use(VenderContext)
  if (!value) throw new Error('useVender: falta <VenderProvider>')
  return value
}

/** ¿El foco está en algo donde se escribe? Ahí la V es una letra, no un atajo. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Vender en Hoy: un modal grande (`VenderDialog`) que abre el botón "Vender" de la
 * barra superior o la tecla V (decisión del dueño, 2026-09-25). Antes era una columna
 * fija a la derecha desde `xl` que le quitaba 380 px al tablero.
 *
 * El estado de "abierto" vive en un proveedor porque el botón cuelga de la barra
 * superior por un portal y no es hermano del modal.
 *
 * El modal se MONTA al abrirse: cada venta arranca limpia. Después de cobrar o de
 * anotar el fiado se cierra solo (se vuelve al tablero). No se cierra con una venta
 * sin confirmar y tocar afuera nunca cierra — ver `useUnconfirmedDialogGuard`.
 * Las Server Actions llegan por prop (una Server Component no puede pasarlas de otra
 * forma a un componente cliente).
 */
export function VenderProvider({
  products,
  topProductIds,
  sellTicketAction,
  createTabAction,
  children,
}: {
  products: CanteenProductRow[]
  /** Los más vendidos de los últimos 30 días, en orden. */
  topProductIds: string[]
  sellTicketAction: SellTicketAction
  createTabAction: CreateTabAction
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const guard = useUnconfirmedDialogGuard(setOpen)
  const value = useMemo(() => ({ open, setOpen }), [open])

  // La V abre la venta desde cualquier lado de Hoy, salvo escribiendo o con otro
  // diálogo abierto (el cobro de un turno): ahí no le puede robar la pantalla.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key.toLowerCase() !== 'v' || e.repeat) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(e.target)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <VenderContext value={value}>
      {children}
      {open && (
        <Dialog open onOpenChange={guard.onOpenChange}>
          <DialogContent
            className="h-[calc(100dvh-2rem)] max-w-[1120px] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0 md:h-[min(640px,calc(100dvh-2rem))] md:max-h-none"
            onInteractOutside={guard.onInteractOutside}
          >
            <VenderDialog
              products={products}
              topProductIds={topProductIds}
              sellTicketAction={sellTicketAction}
              createTabAction={createTabAction}
              onUnconfirmedChange={guard.onUnconfirmedChange}
              onSold={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </VenderContext>
  )
}
