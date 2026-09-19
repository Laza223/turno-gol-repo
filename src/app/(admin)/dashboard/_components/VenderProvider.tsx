'use client'

import { createContext, use, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import {
  TicketPanel,
  type CreateTabAction,
  type SellTicketAction,
} from '@/app/(admin)/caja/cantina/TicketPanel'

type VenderContextValue = {
  /** El diálogo de venta (debajo de `xl`) está abierto. */
  open: boolean
  setOpen: (open: boolean) => void
  products: CanteenProductRow[]
  sellTicketAction: SellTicketAction
  createTabAction: CreateTabAction
}

const VenderContext = createContext<VenderContextValue | null>(null)

export function useVender(): VenderContextValue {
  const value = use(VenderContext)
  if (!value) throw new Error('useVender: falta <VenderProvider>')
  return value
}

/**
 * Vender en Hoy: la MISMA venta de /caja (`TicketPanel`, mismo stock, mismo
 * fiado), en dos formas — una columna fija a la derecha desde `xl` (`VenderRail`)
 * y, debajo de `xl`, un botón "Vender" en la barra superior que abre este mismo
 * ticket en un diálogo.
 *
 * El estado de "diálogo abierto" vive en un proveedor porque lo comparten tres
 * piezas que no son hermanas: el botón (cuelga de la barra superior por un
 * portal), el diálogo y la columna. La columna deja de renderizarse mientras el
 * diálogo está abierto: dos `TicketPanel` a la vez serían dos tickets con su
 * propio estado (líneas, método, ventas por reintentar) para la misma caja.
 *
 * El diálogo se MONTA al abrirse: el ticket arranca limpio en cada apertura.
 * Las Server Actions llegan por prop (una Server Component no puede pasarlas de
 * otra forma a un componente cliente).
 *
 * **No se cierra con una venta sin confirmar.** Si la red se corta y no se sabe si
 * la venta entró, el ticket guarda la clave para reintentar ESA venta; cerrar el
 * diálogo lo desmonta y la pierde, y al reabrir cobrar de nuevo la duplicaría (venta,
 * stock y caja). Mientras tanto Esc y ✕ no cierran y el ticket ya dice qué hacer.
 * Tocar afuera NUNCA cierra: un toque de más en el overlay no puede borrar un ticket
 * armado con gente esperando.
 */
export function VenderProvider({
  products,
  sellTicketAction,
  createTabAction,
  children,
}: {
  products: CanteenProductRow[]
  sellTicketAction: SellTicketAction
  createTabAction: CreateTabAction
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next && unconfirmed) return
    setOpen(next)
  }

  return (
    <VenderContext value={{ open, setOpen, products, sellTicketAction, createTabAction }}>
      {children}
      {open && (
        <Dialog open onOpenChange={handleOpenChange}>
          <DialogContent
            className="max-w-4xl"
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Vender</DialogTitle>
            </DialogHeader>
            <TicketPanel
              layout="dialog"
              products={products}
              sellTicketAction={sellTicketAction}
              createTabAction={createTabAction}
              onUnconfirmedChange={setUnconfirmed}
            />
          </DialogContent>
        </Dialog>
      )}
    </VenderContext>
  )
}
