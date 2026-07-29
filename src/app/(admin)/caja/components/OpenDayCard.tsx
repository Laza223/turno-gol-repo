'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Wallet } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatArsContable } from '@/lib/format'
import { mediumDateLabel } from '../caja-lib'
import { toast } from '@/hooks/use-toast'
import type { DailyCashOpenRow } from '@/modules/cashflow/cashflow.types'
import type { OpenDayActionResult, OpenDayInput } from '../actions'

/**
 * openDayAction llega por PROP, no por import: '../actions' es `'use server'`
 * y arrastra drizzle/postgres → `node:async_hooks`, que rompe Storybook si se
 * importa como valor (mismo patrón que CloseDayButton/RegisterMovementModal).
 */
export type OpenDayAction = (
  input: OpenDayInput,
) => Promise<OpenDayActionResult>

/**
 * Apertura de caja (migr. 049, Fase 5). openDayAction es UPSERT a propósito:
 * "abrir" (sin fila) y "corregir el fondo" (fila existente) son el MISMO
 * diálogo — el usuario de 60 años no necesita distinguir dos flujos. Card
 * discreta a propósito: la apertura no es obligatoria (spec §"Abrir caja NO
 * es obligatorio"), así que no compite visualmente con "+ Agregar movimiento".
 */
export function OpenDayCard({
  date,
  open,
  openDayAction,
  isToday = true,
}: {
  date: string
  open: DailyCashOpenRow | null
  openDayAction: OpenDayAction
  /** false = día pasado alcanzado por el nav de fechas: copy en pasado, no "arranca el día". */
  isToday?: boolean
}) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [openingPesos, setOpeningPesos] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    // Precargado con lo ya guardado (flujo "Corregir"); vacío en la primera apertura.
    setOpeningPesos(open ? String(open.openingCash / 100) : '')
    setNote(open?.note ?? '')
    setError(null)
    setDialogOpen(true)
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return
    setDialogOpen(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const pesos = Number(openingPesos)
    // Acepta 0 a propósito (caja sin fondo declarado sigue siendo una apertura válida).
    if (openingPesos.trim() === '' || !Number.isFinite(pesos) || pesos < 0) {
      setError('Ingresá un monto válido (puede ser 0).')
      return
    }
    const openingCash = Math.round(pesos * 100)
    startTransition(async () => {
      try {
        const res = await openDayAction({ date, openingCash, note: note.trim() || undefined })
        if (res.success) {
          toast({
            title: open ? 'Fondo actualizado' : `Caja abierta — fondo ${formatArsContable(openingCash)}`,
            variant: 'success',
          })
          router.refresh()
          setDialogOpen(false)
        } else {
          setError(res.error)
        }
      } catch (err) {
        // Mismo patrón que RegisterMovementModal/CloseDayButton (#49): un throw no
        // debe dejar el diálogo trabado en "Guardando…".
        Sentry.captureException(err)
        setError('No pudimos guardar el fondo. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-xs">
        <Wallet className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {open ? (
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">
              Fondo inicial:{' '}
              <span className="font-semibold tabular-nums">{formatArsContable(open.openingCash)}</span>
            </p>
            {open.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">{open.note}</p>}
          </div>
        ) : (
          <p className="flex-1 text-sm text-foreground">
            {isToday
              ? '¿Con cuánto efectivo arranca el día?'
              : 'Este día quedó sin fondo inicial declarado.'}
          </p>
        )}
        <button
          type="button"
          onClick={openDialog}
          className={
            open
              ? // Borde persistente (no solo :hover): en touch no hay hover y
                // "Corregir" es EL flujo del typo del fondo (spec, usuario 60 años).
                'h-11 shrink-0 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-9'
              : 'h-11 shrink-0 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent md:h-9'
          }
        >
          {open ? 'Corregir' : isToday ? 'Abrir caja' : 'Declarar fondo'}
        </button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {open
                ? `Corregir fondo del ${mediumDateLabel(date)}`
                : `Abrir caja del ${mediumDateLabel(date)}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="opening-cash" className="text-xs font-medium text-foreground">
                Fondo inicial (pesos)
              </label>
              <input
                id="opening-cash"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                autoComplete="off"
                value={openingPesos}
                onChange={(e) => setOpeningPesos(e.target.value)}
                className="h-11 w-full rounded-md border border-border px-3 text-sm tabular-nums md:h-10"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="opening-note" className="text-xs font-medium text-foreground">
                Nota (opcional)
              </label>
              <textarea
                id="opening-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>
            {error && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
                className="h-11 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60 md:h-10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 md:h-10"
              >
                {isPending ? 'Guardando…' : open ? 'Guardar' : 'Abrir caja'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
