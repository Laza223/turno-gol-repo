'use client'

import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUnconfirmedDialogGuard } from '@/hooks/use-unconfirmed-dialog-guard'
import {
  TicketPanel,
  type CreateTabAction,
  type SellTicketAction,
} from '../../caja/cantina/TicketPanel'
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
 * Con una venta sin confirmar (se cortó la red en "Cobrar") el diálogo no se cierra
 * ni por Esc/✕ ni tocando afuera: el caller lo desmonta al cerrar y la clave de
 * reintento se perdería — ver `useUnconfirmedDialogGuard`.
 *
 * El fiado de una PERSONA ("anotar como fiado") no se ofrece acá: sigue en
 * /caja/cantina. Lo que sí puede ofrecer, si el caller pasa `createTabAction`, es
 * "Anotar al turno" (migr. 116, docs/decisions/2026-11-17-consumos-anotados-al-
 * turno.md): el consumo queda anotado en ESTE turno sin cobrarse, y el modal de
 * cobro lo suma junto con la cancha.
 *
 * Vive bajo la ruta y no en `@/components` porque importa el `TicketPanel` de
 * /caja/cantina: un componente de `@/components` que importa de `@/app` está
 * en el lugar equivocado (regla de lint). Por eso el panel del turno lo recibe
 * inyectado (`renderCanteenDialog`) en vez de importarlo.
 */

export type ListCanteenCatalog = () => Promise<
  { success: true; products: CanteenProductRow[] } | { success: false; error: string }
>

/** Igual que `SellTicketAction` de TicketPanel, más el turno al que se carga. */
export type SellTicketForBooking = (input: {
  lines: { productId: string; qty: number }[]
  method: 'cash' | 'transfer' | 'mercadopago'
  clientIdempotencyKey: string
  bookingId: string
}) => ReturnType<SellTicketAction>

/**
 * Anotar un consumo a un turno. Sin `debtorName` a propósito: lo arma el servidor
 * con la cancha y la hora, así que el cliente no manda ningún nombre.
 */
export type CreateTabForBooking = (input: {
  lines: { productId: string; qty: number }[]
  clientIdempotencyKey: string
  bookingId: string
}) => ReturnType<CreateTabAction>

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
  /** Con esto el ticket ofrece "Anotar al turno" además de cobrar ahora. */
  createTabAction?: CreateTabForBooking
  /** Se anotó un consumo: el modal de cobro tiene que volver a leer lo anotado. */
  onNoted?: () => void
}

export function BookingCanteenDialog({
  open,
  onOpenChange,
  bookingId,
  displayName,
  listCatalogAction,
  sellTicketAction,
  createTabAction,
  onNoted,
}: Props) {
  const [catalog, setCatalog] = useState<{ products: CanteenProductRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const guard = useUnconfirmedDialogGuard(onOpenChange)

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
        setCatalog({ products: res.products })
      } catch (err) {
        Sentry.captureException(err)
        if (alive) setError('No pudimos cargar los productos. Revisá tu internet y probá de nuevo.')
      }
    })()
    return () => {
      alive = false
    }
  }, [listCatalogAction])

  return (
    <Dialog open={open} onOpenChange={guard.onOpenChange}>
      <DialogContent className="max-w-4xl" onInteractOutside={guard.onInteractOutside}>
        <DialogHeader>
          <DialogTitle>Sumar cantina{displayName ? `: ${displayName}` : ''}</DialogTitle>
        </DialogHeader>

        {/* red-700/red-300 (idiom de `status-tone.ts`), no `text-destructive`: el
            token es red-600 en los DOS temas y sobre la superficie oscura da 3.87:1. */}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        {!error && !catalog && (
          <p className="text-sm text-muted-foreground">Cargando productos...</p>
        )}

        {catalog && (
          <TicketPanel
            products={catalog.products}
            layout="dialog"
            onUnconfirmedChange={guard.onUnconfirmedChange}
            sellTicketAction={(input) => sellTicketAction({ ...input, bookingId })}
            // El servidor ignora `debtorName` cuando viene `bookingId`: el nombre que
            // sale en Caja es "Consumo de turno · Cancha 3 · 21:00", nunca algo que mande el cliente.
            createTabAction={
              createTabAction ? (input) => createTabAction({ ...input, bookingId }) : undefined
            }
            bookingTab={
              createTabAction
                ? {
                    label: 'este turno',
                    onNoted: () => {
                      onOpenChange(false)
                      onNoted?.()
                    },
                  }
                : undefined
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
