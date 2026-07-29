'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatArs } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import type { CreateTabAction } from './TicketPanel'
import type { TicketLine } from './ticket-lib'

export function TabDialog({
  open,
  onOpenChange,
  lines,
  total,
  createTabAction,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lines: TicketLine[]
  total: number
  createTabAction: CreateTabAction
  onSuccess: () => void
}) {
  const router = useRouter()
  const [debtorName, setDebtorName] = useState('')
  const [tabNote, setTabNote] = useState('')
  const [tabError, setTabError] = useState<string | null>(null)
  const [tabPending, startTabTransition] = useTransition()
  const [tabIdempotencyKey, setTabIdempotencyKey] = useState(() => crypto.randomUUID())

  // Se re-inicializa en cada apertura, en RENDER (mismo patrón que
  // FiadosList/SettleTabDialog) — no en onOpenChange: ese callback de Radix
  // solo dispara ante triggers INTERNOS del diálogo (Escape, overlay, botón
  // cerrar), nunca cuando el padre cambia `open` directamente desde afuera
  // (TicketPanel hace justamente eso), así que la key quedaba en null para
  // siempre y el submit hacía return silencioso.
  const [lastOpen, setLastOpen] = useState(false)
  if (open && !lastOpen) {
    setLastOpen(true)
    setDebtorName('')
    setTabNote('')
    setTabError(null)
    setTabIdempotencyKey(crypto.randomUUID())
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  function handleOpenChange(next: boolean) {
    if (tabPending) return
    onOpenChange(next)
  }

  function submitTab() {
    if (lines.length === 0 || !tabIdempotencyKey) return
    const trimmedName = debtorName.trim()
    if (trimmedName === '') {
      setTabError('Poné un nombre para el fiado.')
      return
    }
    setTabError(null)
    startTabTransition(async () => {
      try {
        const res = await createTabAction({
          debtorName: trimmedName,
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
          note: tabNote.trim() || undefined,
          clientIdempotencyKey: tabIdempotencyKey,
        })
        if (res.success) {
          toast({ title: `Fiado anotado — ${res.debtorName}`, variant: 'success' })
          onSuccess()
          onOpenChange(false)
          router.refresh()
        } else {
          setTabError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setTabError('No pudimos anotar el fiado. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anotar fiado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="tab-debtor-name">Nombre</Label>
            <Input
              id="tab-debtor-name"
              value={debtorName}
              onChange={(e) => setDebtorName(e.target.value)}
              placeholder="ej: Capitán equipo 22hs"
              maxLength={80}
              disabled={tabPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tab-note">Nota (opcional)</Label>
            <textarea
              id="tab-note"
              value={tabNote}
              onChange={(e) => setTabNote(e.target.value)}
              rows={2}
              disabled={tabPending}
              placeholder="ej: paga el sábado que viene"
              className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm"
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
