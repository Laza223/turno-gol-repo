'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { toast } from '@/hooks/use-toast'
import { formatTime } from '@/lib/format'
import { selectClass } from '@/components/booking/create-modal/styles'
import type { AbonadoRow, UpdateAbonadoInput } from '@/modules/abonados/abonado.types'
import type { PreviewUpdateAbonadoActionResult, UpdateAbonadoActionResult } from './actions'

/**
 * Editar un turno fijo en TODAS sus fechas futuras (spec 2026-11-08). No es el
 * "editar reserva" de la grilla, que vale para una sola fecha: acá cada texto
 * dice "todas las fechas".
 *
 * Las Server Actions llegan por PROP (ver el comentario de AbonadosList.tsx).
 */

export type PreviewUpdateAbonado = (
  id: string,
  changes: UpdateAbonadoInput,
) => Promise<PreviewUpdateAbonadoActionResult>
export type UpdateAbonadoFromDialog = (
  id: string,
  changes: UpdateAbonadoInput,
) => Promise<UpdateAbonadoActionResult>

export type EditableCourt = { id: string; name: string }

const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DEBOUNCE_MS = 350

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  abonado: AbonadoRow
  courts: EditableCourt[]
  previewAction: PreviewUpdateAbonado
  updateAction: UpdateAbonadoFromDialog
}

/** `2030-01-16` → `16/01`. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function fechas(n: number): string {
  return n === 1 ? '1 fecha' : `${n} fechas`
}

/** Horas en punto de 00:00 a 24:00, más el valor actual si no cae en una. */
function hourOptions(current: string, from: 0 | 1): string[] {
  const out: string[] = []
  for (let h = from; h <= 24; h++) out.push(`${String(h).padStart(2, '0')}:00`)
  if (!out.includes(current)) out.push(current)
  return out.sort()
}

export function AbonadoEditDialog({
  open,
  onOpenChange,
  abonado,
  courts,
  previewAction,
  updateAction,
}: Props) {
  const initial = useMemo(
    () => ({
      name: abonado.contactName,
      phone: abonado.contactPhone ?? '',
      price: abonado.pricePerSession,
      courtId: abonado.courtId,
      dayOfWeek: abonado.dayOfWeek,
      timeStart: formatTime(abonado.timeStart),
      timeEnd: formatTime(abonado.timeEnd),
    }),
    [abonado],
  )

  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [price, setPrice] = useState<number | null>(initial.price)
  const [courtId, setCourtId] = useState(initial.courtId)
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek)
  const [timeStart, setTimeStart] = useState(initial.timeStart)
  const [timeEnd, setTimeEnd] = useState(initial.timeEnd)

  const fieldError =
    name.trim() === ''
      ? 'Ingresá el nombre.'
      : initial.phone !== '' && phone.trim() === ''
        ? 'Ingresá un teléfono de contacto.'
        : price === null || price <= 0
          ? 'El precio tiene que ser mayor a cero.'
          : timeEnd <= timeStart
            ? 'El horario de fin tiene que ser posterior al de inicio.'
            : null

  // Solo lo que cambió: es lo que viaja al server y lo que mira la vista previa.
  const changes = useMemo<UpdateAbonadoInput>(() => {
    const c: UpdateAbonadoInput = {}
    if (name.trim() !== initial.name) c.contactName = name.trim()
    if (phone.trim() !== initial.phone && phone.trim() !== '') c.contactPhone = phone.trim()
    if (price !== null && price !== initial.price) c.pricePerSession = price
    if (courtId !== initial.courtId) c.courtId = courtId
    if (dayOfWeek !== initial.dayOfWeek) c.dayOfWeek = dayOfWeek
    if (timeStart !== initial.timeStart || timeEnd !== initial.timeEnd) {
      c.timeStart = timeStart
      c.timeEnd = timeEnd
    }
    return c
  }, [name, phone, price, courtId, dayOfWeek, timeStart, timeEnd, initial])

  const hasChanges = Object.keys(changes).length > 0
  const slotChanges =
    changes.courtId !== undefined ||
    changes.dayOfWeek !== undefined ||
    changes.timeStart !== undefined
  const key = JSON.stringify(changes)

  // La respuesta se guarda con la clave de los cambios que la pidieron: si la
  // clave actual es otra, todavía estamos esperando (sin setState síncrono en el
  // efecto).
  const [previewState, setPreviewState] = useState<{
    key: string
    res: PreviewUpdateAbonadoActionResult
  } | null>(null)

  useEffect(() => {
    if (!hasChanges || fieldError !== null) return
    let alive = true
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await previewAction(abonado.id, changes)
          if (alive) setPreviewState({ key, res })
        } catch (err) {
          Sentry.captureException(err)
          if (alive) {
            setPreviewState({
              key,
              res: { success: false, error: 'No pudimos revisar las fechas. Intentá de nuevo.' },
            })
          }
        }
      })()
    }, DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [abonado.id, changes, hasChanges, fieldError, key, previewAction])

  const preview = previewState?.key === key ? previewState.res : null
  const previewLoading = hasChanges && fieldError === null && preview === null
  const previewData = preview?.success ? preview.preview : null
  const blocked =
    previewData !== null && (previewData.conflictDates.length > 0 || previewData.fixedConflict)

  // El error del servidor vale para los cambios que lo provocaron: si el encargado
  // sigue editando (otra `key`), se descarta y manda la vista previa nueva.
  const [serverErrorState, setServerErrorState] = useState<{
    key: string
    error: string
    conflictDates?: string[]
    fixedConflict?: boolean
  } | null>(null)
  const serverError = serverErrorState?.key === key ? serverErrorState : null
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending || !hasChanges || fieldError !== null || blocked) return
    setServerErrorState(null)
    startTransition(async () => {
      try {
        const res = await updateAction(abonado.id, changes)
        if (!res.success) {
          startTransition(() => setServerErrorState({ ...res, key }))
          return
        }
        const n = Math.max(res.counts.moved, res.counts.priceUpdated)
        toast({
          title:
            n > 0 ? `Turno fijo actualizado. Cambió en ${fechas(n)}.` : 'Turno fijo actualizado.',
          variant: 'success',
        })
        onOpenChange(false)
      } catch (err) {
        Sentry.captureException(err)
        startTransition(() =>
          setServerErrorState({
            key,
            error: 'No pudimos guardar los cambios. Revisá tu conexión e intentá de nuevo.',
          }),
        )
      }
    })
  }

  const conflictDates = serverError?.conflictDates ?? previewData?.conflictDates ?? []
  const fixedConflict = serverError?.fixedConflict ?? previewData?.fixedConflict ?? false

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Editar el fijo de {abonado.contactName} ({DAYS_LONG[abonado.dayOfWeek]}{' '}
            {formatTime(abonado.timeStart)})
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Los cambios valen para todas las fechas que vienen. Las fechas pasadas no cambian.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-fijo-price">Precio por turno</Label>
            <MoneyInput
              id="edit-fijo-price"
              aria-label="Precio por turno"
              valueCents={price}
              onValueChange={setPrice}
              minCents={1}
              disabled={isPending}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-fijo-name">Nombre</Label>
              <input
                id="edit-fijo-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                maxLength={120}
                className={selectClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-fijo-phone">Teléfono</Label>
              <input
                id="edit-fijo-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isPending}
                maxLength={40}
                inputMode="tel"
                className={selectClass}
              />
            </div>
          </div>

          {abonado.playerId && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
              Este fijo está a nombre de una cuenta. El nombre que ve el jugador sale de su cuenta.
            </p>
          )}

          <details className="rounded-lg border border-border px-3 py-2" open={slotChanges}>
            <summary className="cursor-pointer text-sm font-medium">Día, horario y cancha</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-fijo-day">Día</Label>
                <select
                  id="edit-fijo-day"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  disabled={isPending}
                  className={selectClass}
                >
                  {DAYS_LONG.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              {courts.length > 1 && (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-fijo-court">Cancha</Label>
                  <select
                    id="edit-fijo-court"
                    value={courtId}
                    onChange={(e) => setCourtId(e.target.value)}
                    disabled={isPending}
                    className={selectClass}
                  >
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="edit-fijo-start">Desde</Label>
                <select
                  id="edit-fijo-start"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  {hourOptions(initial.timeStart, 0)
                    .filter((t) => t !== '24:00')
                    .map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-fijo-end">Hasta</Label>
                <select
                  id="edit-fijo-end"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  {hourOptions(initial.timeEnd, 1).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </details>

          <div aria-live="polite" className="space-y-1 text-sm">
            {!hasChanges && <p className="text-muted-foreground">No cambiaste nada.</p>}
            {hasChanges && fieldError !== null && (
              <p role="alert" className="text-red-700 dark:text-red-300">
                {fieldError}
              </p>
            )}
            {previewLoading && <p className="text-muted-foreground">Revisando las fechas…</p>}
            {preview && !preview.success && (
              <p role="alert" className="text-red-700 dark:text-red-300">
                {preview.error}
              </p>
            )}
            {previewData && previewData.futureSessions === 0 && (
              <p className="text-muted-foreground">
                Este turno fijo no tiene fechas por venir. Los cambios valen para las próximas que
                se generen.
              </p>
            )}
            {previewData && previewData.priceUpdated > 0 && (
              <p>El precio cambia en {fechas(previewData.priceUpdated)}.</p>
            )}
            {previewData && previewData.moved > 0 && !blocked && (
              <p>Se mueven {fechas(previewData.moved)}.</p>
            )}
            {previewData && previewData.notMoved > 0 && !blocked && (
              <p className="text-amber-700 dark:text-amber-300">
                {previewData.notMoved === 1
                  ? '1 fecha se queda en el horario anterior porque ya pasó o es posterior al fin del turno fijo.'
                  : `${previewData.notMoved} fechas se quedan en el horario anterior porque ya pasaron o son posteriores al fin del turno fijo.`}
              </p>
            )}
            {previewData && previewData.keptOwnPrice > 0 && (
              <p className="text-muted-foreground">
                {previewData.keptOwnPrice === 1
                  ? '1 fecha se queda con el precio que le pusiste a mano.'
                  : `${previewData.keptOwnPrice} fechas se quedan con el precio que les pusiste a mano.`}
              </p>
            )}
            {previewData && previewData.keptPaid > 0 && (
              <p className="text-muted-foreground">
                {previewData.keptPaid === 1
                  ? '1 fecha ya tiene cobros por más que el precio nuevo. Se queda como está.'
                  : `${previewData.keptPaid} fechas ya tienen cobros por más que el precio nuevo. Se quedan como están.`}
              </p>
            )}
          </div>

          {(conflictDates.length > 0 || fixedConflict) && (
            <div
              role="alert"
              className="space-y-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
            >
              {fixedConflict && <p>Ya hay otro turno fijo en ese día, horario y cancha.</p>}
              {conflictDates.length > 0 && (
                <>
                  <p>
                    No se puede mover porque hay fechas que no están disponibles. Liberalas o elegí
                    otro horario.
                  </p>
                  <ul className="flex flex-wrap gap-1.5 text-xs">
                    {conflictDates.map((d) => (
                      <li
                        key={d}
                        className="rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-500/15"
                      >
                        {shortDate(d)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {serverError && conflictDates.length === 0 && !fixedConflict && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              {serverError.error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="h-11 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={
                isPending || !hasChanges || fieldError !== null || previewLoading || blocked
              }
              className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:h-10"
            >
              {isPending
                ? 'Guardando…'
                : slotChanges
                  ? 'Mover todas las fechas'
                  : 'Guardar en todas las fechas'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
