'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatArs } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import type { UnconfirmedSubmit } from '@/hooks/use-unconfirmed-submit'
import { UnconfirmedRetry } from '@/components/admin/UnconfirmedRetry'
import type { CreateTabAction } from './TicketPanel'
import type { TicketLine } from './ticket-lib'

/** Un fiado que salió: lo que se reenvía si la respuesta no vuelve. */
export type TabAttempt = {
  debtorName: string
  lines: { productId: string; qty: number }[]
  total: number
}

/**
 * "Anotáselo al capitán": una sola pregunta, a nombre de quién.
 *
 * Ya no pide una nota libre. Era un campo de texto abierto sobre una persona,
 * que es exactamente lo que la Ley 25.326 pone bajo el derecho de acceso del
 * titular: lo que un cliente puede pedir y leer se controla en el origen, no
 * después. Es la misma razón por la que se eliminó `abonados.notes`.
 *
 * La columna `canteen_tabs.note` sigue en la base con lo ya cargado; esta
 * pantalla simplemente dejó de escribirla.
 */
export function TabDialog({
  open,
  onOpenChange,
  lines,
  total,
  createTabAction,
  attempt,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lines: TicketLine[]
  total: number
  createTabAction: CreateTabAction
  /**
   * Vive en TicketPanel y no acá: mientras no se sepa si el fiado entró, el
   * ticket no se puede cobrar ni tocar (esas líneas pueden ya estar anotadas).
   */
  attempt: UnconfirmedSubmit<TabAttempt>
  onSuccess: () => void
}) {
  const router = useRouter()
  const [debtorName, setDebtorName] = useState('')
  const [tabError, setTabError] = useState<string | null>(null)
  const [tabPending, startTabTransition] = useTransition()
  const retry = attempt.retryPayload

  // Se re-inicializa en cada apertura, en RENDER (mismo patrón que
  // FiadosList/SettleTabDialog) — no en onOpenChange: ese callback de Radix
  // solo dispara ante triggers INTERNOS del diálogo (Escape, overlay, botón
  // cerrar), nunca cuando el padre cambia `open` directamente desde afuera
  // (TicketPanel hace justamente eso).
  const [lastOpen, setLastOpen] = useState(false)
  if (open && !lastOpen) {
    setLastOpen(true)
    setDebtorName('')
    setTabError(null)
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  function handleOpenChange(next: boolean) {
    if (tabPending) return
    onOpenChange(next)
  }

  function submitTab() {
    if (lines.length === 0) return
    const trimmedName = debtorName.trim()
    if (trimmedName === '') {
      setTabError('Poné un nombre para el fiado.')
      return
    }
    runTab({
      debtorName: trimmedName,
      lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      total,
    })
  }

  function runTab(payload: TabAttempt) {
    setTabError(null)
    startTabTransition(async () => {
      const res = await attempt.send(payload, (p, clientIdempotencyKey) =>
        createTabAction({ debtorName: p.debtorName, lines: p.lines, clientIdempotencyKey }),
      )
      if (!res) return
      if (res.success) {
        toast({ title: `Fiado anotado — ${res.debtorName}`, variant: 'success' })
        onSuccess()
        onOpenChange(false)
        router.refresh()
      } else {
        setTabError(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anotar fiado</DialogTitle>
        </DialogHeader>
        {retry && (
          <UnconfirmedRetry
            what={`el fiado de ${formatArs(retry.total)} a nombre de ${retry.debtorName}`}
            retryLabel="Reintentar fiado"
            isPending={tabPending}
            onRetry={() => runTab(retry)}
          />
        )}
        <div className="space-y-4" hidden={retry !== null}>
          <div className="space-y-1">
            <Label htmlFor="tab-debtor-name">¿A nombre de quién?</Label>
            <Input
              id="tab-debtor-name"
              value={debtorName}
              onChange={(e) => setDebtorName(e.target.value)}
              placeholder="ej: Capitán equipo 22hs"
              maxLength={80}
              disabled={tabPending}
              autoFocus
            />
          </div>
          {tabError && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {tabError}
            </p>
          )}
          <button
            type="button"
            onClick={submitTab}
            disabled={tabPending}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {tabPending ? 'Anotando…' : `Anotar fiado — ${formatArs(total)}`}
          </button>
          <p className="text-xs text-muted-foreground">
            El stock sale ahora. La plata entra cuando lo cobrás desde “Fiados abiertos”.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
