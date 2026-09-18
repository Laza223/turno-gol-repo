'use client'

import { useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { toast } from '@/hooks/use-toast'
import { formatDateLong } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Summary } from './Summary'
import { durationHours, endTimeOptions } from './time-options'
import { selectClass } from './styles'
import type { TypeFormProps } from './types'

const REASONS = ['Mantenimiento', 'Cancha cerrada', 'Otro'] as const

/** Bloquear cancha — nadie puede usarla: NUNCA carga plata ni datos de contacto. */
export function BloqueoForm({
  slot,
  courtBookings,
  daySlots,
  createBookingAction,
  onClose,
  onSuccess,
  trackConfirmed,
}: TypeFormProps) {
  const timeStart = slot.timeStart
  const endOptions = endTimeOptions({ slots: daySlots, startTime: timeStart, courtBookings })
  const [timeEnd, setTimeEnd] = useState(endOptions[0]!)

  const [reason, setReason] = useState<(typeof REASONS)[number]>('Mantenimiento')
  const [customReason, setCustomReason] = useState('')
  const customInputRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function pickReason(next: (typeof REASONS)[number]) {
    setReason(next)
    if (next === 'Otro') setTimeout(() => customInputRef.current?.focus(), 0)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    const guestName = reason === 'Otro' ? customReason.trim() : reason
    if (!guestName) {
      setError('Contá el motivo del bloqueo.')
      return
    }

    const data = {
      courtId: slot.courtId,
      date: slot.date,
      timeStart,
      timeEnd,
      type: 'block' as const,
      guestName,
    }

    setError(null)
    startTransition(async () => {
      try {
        const result = await createBookingAction(data)
        if (!result.success) {
          // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
          // render antes de que `pending` bajara, con los controles todavía deshabilitados.
          startTransition(() => setError(result.error))
          return
        }
        trackConfirmed()
        toast({
          title: 'Turno bloqueado',
          description: `${slot.courtName} · ${timeStart}–${timeEnd}`,
          variant: 'success',
        })
        onSuccess(result.booking)
      } catch (err) {
        Sentry.captureException(err)
        startTransition(() =>
          setError('No pudimos bloquear la cancha. Revisá tu conexión e intentá de nuevo.'),
        )
      }
    })
  }

  const durationLabel = `${durationHours(timeStart, timeEnd)} h`

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 lg:p-6">
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Motivo
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => pickReason(r)}
                className={cn(
                  'h-11 md:h-9 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors',
                  reason === r
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === 'Otro' && (
            <div className="space-y-1.5">
              <Label htmlFor="bloqueo-motivo">Contá el motivo</Label>
              <Input
                ref={customInputRef}
                id="bloqueo-motivo"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={200}
                placeholder="Ej: Alquiler para evento privado"
              />
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Horario
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Empieza</Label>
              <p className={cn(selectClass, 'flex items-center text-muted-foreground')}>
                {timeStart}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bloqueo-end">Hasta</Label>
              <select
                id="bloqueo-end"
                className={selectClass}
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
              >
                {endOptions.map((t) => (
                  <option key={t} value={t}>
                    {t} · {durationHours(timeStart, t)} h
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </div>

      <Summary
        courtName={slot.courtName}
        dateLabel={formatDateLong(slot.date)}
        timeStart={timeStart}
        timeEnd={timeEnd}
        durationLabel={durationLabel}
        totalCents={null}
        collectedCents={0}
        primaryLabel="Bloquear cancha"
        onCancel={onClose}
        isPending={isPending}
        disabled={isPending}
        error={error}
      />
    </form>
  )
}
