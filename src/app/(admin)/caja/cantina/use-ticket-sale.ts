'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatArs } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { useUnconfirmedSubmit } from '@/hooks/use-unconfirmed-submit'
import { unconfirmedMessage } from '@/components/admin/UnconfirmedRetry'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { SaleMethod } from '../caja-lib'
import type { SellTicketActionResult } from './actions'
import { addProduct, ticketCount, ticketTotal, type TicketLine } from './ticket-lib'
import type { TabAttempt } from './TabDialog'

export type SellTicketAction = (input: {
  lines: { productId: string; qty: number }[]
  method: 'cash' | 'transfer' | 'mercadopago'
  clientIdempotencyKey: string
}) => Promise<SellTicketActionResult>

/** Una venta que salió: lo que se reenvía si la respuesta no vuelve. */
type SaleAttempt = {
  lines: { productId: string; qty: number }[]
  method: SaleMethod
  total: number
}

/**
 * La venta de un ticket, sin su forma: las líneas, el método, el cobro con su
 * reintento y el fiado. La usan el `TicketPanel` (Caja › Vender y la cantina de
 * un turno) y el modal de Vender de Hoy, que dibujan lo mismo de dos maneras.
 *
 * Si una venta o un fiado salió y su respuesta no volvió, esas líneas pueden ya
 * estar registradas: el ticket entero se traba (`locked`) hasta reintentar ESE
 * envío con la misma clave (ver `useUnconfirmedSubmit`).
 */
export function useTicketSale({
  sellTicketAction,
  onUnconfirmedChange,
  onSold,
}: {
  sellTicketAction: SellTicketAction
  /**
   * Avisa cuando hay una venta en vuelo o una venta o un fiado sin respuesta. Quien
   * monta el ticket adentro de algo que se puede cerrar lo usa para no cerrarlo: el
   * reintento y su clave viven acá, y desmontar el ticket los pierde — al reabrir,
   * cobrar de nuevo duplicaría venta, stock y caja.
   *
   * El "en vuelo" no es un extra: el aviso de reintento sale en una transición y este
   * effect le avisa al diálogo recién un par de tareas DESPUÉS de pintarlo. Si el aviso
   * pasara de false a true en ese commit, un Esc en el hueco cerraba igual. Como la
   * venta ya estaba trabada desde el click (`isPending`), el valor no cambia y no hay
   * hueco.
   */
  onUnconfirmedChange?: (unconfirmed: boolean) => void
  /** Después de una venta o un fiado confirmados, con el ticket ya vacío. */
  onSold?: () => void
}) {
  const router = useRouter()
  const [lines, setLines] = useState<TicketLine[]>([])
  const [method, setMethod] = useState<SaleMethod>('cash')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const sale = useUnconfirmedSubmit<SaleAttempt>()
  const tab = useUnconfirmedSubmit<TabAttempt>()
  const saleRetry = sale.retryPayload
  const tabRetry = tab.retryPayload
  const locked = isPending || saleRetry !== null || tabRetry !== null
  useEffect(() => {
    onUnconfirmedChange?.(locked)
  }, [locked, onUnconfirmedChange])
  const [tabDialogOpen, setTabDialogOpen] = useState(false)

  const total = ticketTotal(lines)
  const count = ticketCount(lines)
  const message = saleRetry
    ? unconfirmedMessage(`la venta de ${formatArs(saleRetry.total)}`)
    : tabRetry
      ? unconfirmedMessage(`el fiado a nombre de ${tabRetry.debtorName}`)
      : error

  function add(product: CanteenProductRow) {
    if (locked) return
    setError(null)
    setLines((prev) =>
      addProduct(prev, {
        id: product.id,
        name: product.name,
        price: product.price,
        stock: product.stock,
      }),
    )
  }

  function runSale(payload: SaleAttempt) {
    setError(null)
    startTransition(async () => {
      const res = await sale.send(payload, (p, clientIdempotencyKey) =>
        sellTicketAction({ lines: p.lines, method: p.method, clientIdempotencyKey }),
      )
      if (!res) return
      if (res.success) {
        toast({ title: `Venta registrada — ${formatArs(res.total)}`, variant: 'success' })
        setLines([])
        setMethod('cash')
        router.refresh()
        onSold?.()
      } else {
        // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
        // render antes de que `pending` bajara, con los controles todavía deshabilitados.
        startTransition(() => setError(res.error))
      }
    })
  }

  /** El botón de cobrar: con una venta sin respuesta, reintenta ESA. */
  function charge() {
    if (saleRetry) return runSale(saleRetry)
    if (lines.length === 0 || locked) return
    runSale({
      lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      method,
      total,
    })
  }

  const chargeLabel = isPending
    ? 'Cobrando…'
    : saleRetry
      ? `Reintentar cobro de ${formatArs(saleRetry.total)}`
      : `Cobrar ${formatArs(total)}`

  function onTabSuccess() {
    setLines([])
    setMethod('cash')
    onSold?.()
  }

  return {
    lines,
    setLines,
    method,
    setMethod,
    total,
    count,
    message,
    isPending,
    locked,
    saleRetry,
    tabRetry,
    tab,
    add,
    charge,
    chargeLabel,
    tabDialogOpen,
    setTabDialogOpen,
    onTabSuccess,
    clearError: () => setError(null),
  }
}
