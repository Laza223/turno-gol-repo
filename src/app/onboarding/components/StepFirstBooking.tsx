'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { formatArs } from '@/lib/format'
import { stepPath } from '@/modules/onboarding/onboarding.steps'
import type { CreateFirstBookingResult } from '@/modules/onboarding/onboarding.types'
import type { FirstBookingCourtSlots } from '@/modules/onboarding/onboarding.service'
import { WizardShell } from './WizardShell'

/** Firma de la Server Action que carga la reserva del paso 4. */
type CreateFirstBookingAction = (input: {
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  guestName: string
}) => Promise<CreateFirstBookingResult>

/** Firma de la Server Action que cierra el wizard (redirige internamente). */
type FinishOnboardingAction = () => Promise<void>

type Props = {
  /** Día operativo de HOY (ART) sobre el que se generaron los slots. */
  date: string
  courts: FirstBookingCourtSlots[]
  action: CreateFirstBookingAction
  finishAction: FinishOnboardingAction
}

type ActiveSlot = {
  courtId: string
  courtName: string
  timeStart: string
  timeEnd: string
  price: number | null
}

function slotKey(courtId: string, timeStart: string): string {
  return `${courtId}-${timeStart}`
}

/**
 * Paso 4 — "Tu primera reserva" (§D del plan de refactor, reemplaza al viejo
 * paso de señas). Es el único momento del wizard donde ya existen los tres
 * requisitos duros de `createManualBooking`: cancha `online`, precio que cubre
 * el horario y horario de 60 min confirmado — así que en vez de seguir
 * describiendo el producto, lo usa: tocás un horario libre de HOY en la grilla
 * real y cargás un turno, el mismo gesto que el dueño va a repetir todos los días.
 *
 * Skippable siempre ("Saltar por ahora"): no bloquea nada, y una vez cargado
 * un turno el CTA cambia a "Terminar y ver mi complejo" (mismo texto que
 * usaba el viejo paso de señas al cerrar sin seña).
 */
export function StepFirstBooking({ date, courts, action, finishAction }: Props) {
  const [isPending, startTransition] = useTransition()
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null)
  const [guestName, setGuestName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [bookedKeys, setBookedKeys] = useState<Set<string>>(new Set())

  const hasAnySlot = courts.some((c) => c.slots.length > 0)
  const hasBooked = bookedKeys.size > 0

  function openSlot(
    court: FirstBookingCourtSlots,
    timeStart: string,
    timeEnd: string,
    price: number | null,
  ) {
    setError(null)
    setGuestName('')
    setActiveSlot({ courtId: court.courtId, courtName: court.courtName, timeStart, timeEnd, price })
  }

  function closeSlot() {
    setActiveSlot(null)
    setError(null)
  }

  function handleConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeSlot || isPending) return
    const trimmed = guestName.trim()
    if (!trimmed) {
      setError('Poné a nombre de quién va el turno.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await action({
        courtId: activeSlot.courtId,
        date,
        timeStart: activeSlot.timeStart,
        timeEnd: activeSlot.timeEnd,
        guestName: trimmed,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setBookedKeys((prev) =>
        new Set(prev).add(slotKey(result.booking.courtId, result.booking.timeStart)),
      )
      setActiveSlot(null)
      setGuestName('')
    })
  }

  function handleFinish() {
    startTransition(async () => {
      await finishAction()
    })
  }

  return (
    <WizardShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Tu primera reserva</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Probá: tocá un horario y cargá un turno. Es el mismo gesto que vas a usar todos los
            días.
          </p>
        </div>

        {hasBooked && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
          >
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            ¡Turno cargado! Ya está en tu grilla.
          </div>
        )}

        {!hasAnySlot ? (
          <EmptyState
            icon={CalendarClock}
            title="Hoy no quedan horarios libres"
            description="Podés cargar tu primera reserva más tarde desde la grilla. Esto no bloquea nada."
          />
        ) : (
          <div className="space-y-3">
            {courts.map((court) => (
              <div key={court.courtId} className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm font-semibold text-foreground">{court.courtName}</p>
                {court.slots.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Sin horarios libres hoy.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {court.slots.map((slot) => {
                      const key = slotKey(court.courtId, slot.timeStart)
                      const done = bookedKeys.has(key)
                      return (
                        // El momento pico del wizard (plan §F): el turno recién
                        // cargado hace un pulse único al aparecer en la grilla.
                        // `animate` reactivo (no `key`/remount): motion corre la
                        // secuencia de keyframes una sola vez cuando `done` pasa
                        // a `true` y queda quieto en el último valor.
                        <m.button
                          key={slot.timeStart}
                          type="button"
                          disabled={done || isPending}
                          onClick={() => openSlot(court, slot.timeStart, slot.timeEnd, slot.price)}
                          animate={done ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                          transition={{ duration: 0.4 }}
                          className={cn(
                            'flex h-11 min-w-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors disabled:cursor-default md:h-10',
                            done
                              ? 'border-emerald-600 bg-primary/10 text-emerald-700 dark:text-emerald-400'
                              : 'border-border bg-background text-foreground hover:border-emerald-600/50 hover:bg-accent',
                          )}
                        >
                          {done && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                          {slot.timeStart}
                        </m.button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeSlot && (
          <form
            onSubmit={handleConfirm}
            className="space-y-3 rounded-xl border border-emerald-600/40 bg-primary/5 p-4 dark:bg-emerald-500/10"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                {activeSlot.courtName} · {activeSlot.timeStart}–{activeSlot.timeEnd}
              </p>
              <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {activeSlot.price != null ? formatArs(activeSlot.price) : 'Sin precio'}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="first-booking-name"
                className="text-xs font-medium text-muted-foreground"
              >
                ¿A nombre de quién?
              </label>
              <input
                id="first-booking-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                autoFocus
                autoComplete="off"
                placeholder="Nombre"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-base focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm"
              />
            </div>
            {error && (
              // red-700, no red-600: acá el fondo es el tinte esmeralda del mini-form
              // (bg-primary/5), no el fondo plano del resto del wizard — red-600 mide
              // 4.49:1 sobre ese tinte, justo abajo del 4.5:1 que pide AA.
              <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={closeSlot} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={isPending} className="flex-1">
                Confirmar turno
              </Button>
            </div>
          </form>
        )}

        {!activeSlot && error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Link
            href={stepPath(3)}
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              isPending && 'pointer-events-none opacity-50',
            )}
            aria-disabled={isPending || undefined}
          >
            Volver
          </Link>
          <Button
            type="button"
            variant={hasBooked ? 'default' : 'ghost'}
            onClick={handleFinish}
            isLoading={isPending}
            className="flex-1"
          >
            {hasBooked ? 'Terminar y ver mi complejo' : 'Saltar por ahora'}
          </Button>
        </div>
      </div>
    </WizardShell>
  )
}
