'use client'

import { useRef, useState, useTransition } from 'react'
import { FREE_PLAN_BLOCK_REASONS } from '@/shared/constants'
import * as Sentry from '@sentry/nextjs'
import { toast } from '@/hooks/use-toast'
import { formatDateLong } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { choiceChipClass } from '@/components/ui/segmented-control'
import { Summary } from './Summary'
import { durationHours, endTimeOptions } from './time-options'
import { readOnlyFieldClass, selectClass } from './styles'
import type { TypeFormProps } from './types'

const REASONS = ['Mantenimiento', 'Cancha cerrada', 'Otro'] as const
type Reason = (typeof REASONS)[number] | (typeof FREE_PLAN_BLOCK_REASONS)[number]

/**
 * Bloquear cancha — nadie puede usarla: NUNCA carga plata ni datos de contacto.
 *
 * En el plan gratis los motivos son cerrados, sin "Otro" libre: un motivo libre
 * sería una nota encubierta, y las notas son del plan. Anotar quién juega es
 * gratis y va por "Turno" (freemium v2).
 */
export function BloqueoForm({
  slot,
  courtBookings,
  daySlots,
  createBookingAction,
  onClose,
  onSuccess,
  trackConfirmed,
  freePlan = false,
}: TypeFormProps & { freePlan?: boolean }) {
  const reasons: readonly Reason[] = freePlan ? FREE_PLAN_BLOCK_REASONS : REASONS
  const timeStart = slot.timeStart
  const endOptions = endTimeOptions({ slots: daySlots, startTime: timeStart, courtBookings })
  const [timeEnd, setTimeEnd] = useState(endOptions[0]!)

  const [reason, setReason] = useState<Reason>(freePlan ? 'Ocupado' : 'Mantenimiento')
  const [customReason, setCustomReason] = useState('')
  const customInputRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function pickReason(next: Reason) {
    setReason(next)
    if (next === 'Otro') setTimeout(() => customInputRef.current?.focus(), 0)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    const guestName = reason === 'Otro' ? customReason.trim() : reason
    if (!guestName) {
      setError('Escribí el motivo del bloqueo.')
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
          title: 'Cancha bloqueada',
          description: `${slot.courtName} · ${timeStart}–${timeEnd}`,
          variant: 'success',
        })
        onSuccess(result.booking)
      } catch (err) {
        Sentry.captureException(err)
        startTransition(() =>
          setError('No pudimos bloquear la cancha. Revisá tu internet y probá de nuevo.'),
        )
      }
    })
  }

  const durationLabel = `${durationHours(timeStart, timeEnd)} h`

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 lg:space-y-8 lg:p-6">
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Motivo
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => pickReason(r)}
                // El mismo chip que "Repetición" y "Precio": un solo lenguaje de
                // "elegido" en todo el modal.
                className={choiceChipClass(reason === r)}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === 'Otro' && (
            <div className="space-y-1.5">
              <Label htmlFor="bloqueo-motivo">Motivo del bloqueo</Label>
              <Input
                ref={customInputRef}
                id="bloqueo-motivo"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={200}
                placeholder="Ej: Lluvia, arreglo de luces"
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
              <p className={readOnlyFieldClass}>{timeStart}</p>
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
        hideMoney={freePlan}
        primaryLabel="Bloquear cancha"
        onCancel={onClose}
        isPending={isPending}
        disabled={isPending}
        error={error}
      />
    </form>
  )
}
