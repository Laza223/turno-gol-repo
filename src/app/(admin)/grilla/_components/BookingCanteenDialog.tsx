'use client'

import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TicketPanel, type SellTicketAction } from '../../caja/cantina/TicketPanel'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'

/**
 * Cantina cargada a un turno, desde la grilla (Fase 3, criterio de salida #2).
 *
 * Reusa el `TicketPanel` real de /caja/cantina — con stock, ledger e
 * idempotencia — en vez de un atajo paralelo: una venta que no descuenta stock
 * deja el inventario mintiendo, y ese es justo el número por el que se compra
 * el módulo.
 *
 * El catálogo se pide al ABRIR, no al renderizar la grilla: el stock cambia
 * durante todo el día y una grilla abierta desde la mañana ofrecería unidades
 * que ya se vendieron.
 *
 * NO se ofrece "anotar como fiado" acá: un fiado se le anota a una PERSONA
 * (`canteen_tabs.debtor_name`), no a un turno — no hay dónde guardar el
 * vínculo. Sigue disponible en /caja/cantina.
 *
 * Vive bajo la ruta y no en `@/components` porque importa el `TicketPanel` de
 * /caja/cantina: un componente de `@/components` que importa de `@/app` está
 * en el lugar equivocado (regla de lint). Por eso el panel del turno lo recibe
 * inyectado (`renderCanteenDialog`) en vez de importarlo.
 */

export type ListCanteenCatalog = () => Promise<
  | { success: true; products: CanteenProductRow[]; saleDisabled: boolean }
  | { success: false; error: string }
>

/** Igual que `SellTicketAction` de TicketPanel, más el turno al que se carga. */
export type SellTicketForBooking = (input: {
  lines: { productId: string; qty: number }[]
  method: 'cash' | 'transfer' | 'mercadopago'
  clientIdempotencyKey: string
  bookingId: string
}) => ReturnType<SellTicketAction>

type Props = {
  /**
   * El caller monta este diálogo SOLO cuando está abierto (mismo patrón que
   * BookingFormModal en la grilla), así el catálogo se pide una vez por
   * apertura y el estado arranca limpio sin resetearlo a mano.
   */
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  /** Para el título: a quién se le está cargando el consumo. */
  displayName: string | null
  listCatalogAction: ListCanteenCatalog
  sellTicketAction: SellTicketForBooking
}

export function BookingCanteenDialog({
  open,
  onOpenChange,
  bookingId,
  displayName,
  listCatalogAction,
  sellTicketAction,
}: Props) {
  const [catalog, setCatalog] = useState<
    { products: CanteenProductRow[]; saleDisabled: boolean } | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await listCatalogAction()
        if (!alive) return
        if (!res.success) {
          setError(res.error)
          return
        }
        setCatalog({ products: res.products, saleDisabled: res.saleDisabled })
      } catch (err) {
        Sentry.captureException(err)
        if (alive) setError('No pudimos cargar la cantina. Revisá tu conexión.')
      }
    })()
    return () => {
      alive = false
    }
  }, [listCatalogAction])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Cantina{displayName ? ` — ${displayName}` : ''}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {!error && !catalog && <p className="text-sm text-muted-foreground">Cargando cantina…</p>}

        {catalog && (
          <TicketPanel
            products={catalog.products}
            saleDisabled={catalog.saleDisabled}
            isInDialog
            sellTicketAction={(input) => sellTicketAction({ ...input, bookingId })}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
