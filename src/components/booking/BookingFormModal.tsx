'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Sentry from '@sentry/nextjs'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { PhoneInput } from '@/components/ui/phone-input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { BookingActionResult } from '@/app/(admin)/reservas/actions'
import { formatDateLong } from '@/lib/format'

type Slot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  durationMins: 60 | 120
}

/** Firma de createBookingAction (@/app/(admin)/reservas/actions). */
export type CreateBookingAction = (data: unknown) => Promise<BookingActionResult>

/** Firma de checkSlotAvailabilityAction (@/app/(admin)/reservas/actions). */
export type CheckSlotAvailabilityAction = (input: {
  courtId: string
  date: string
  timeStart: string
}) => Promise<{ available: boolean }>

type Props = {
  slot: Slot
  open: boolean
  onClose: () => void
  onSuccess: (booking: BookingRow) => void
  /**
   * La Server Action llega por PROP, no por import: `./actions` es `'use server'`
   * y arrastra drizzle/postgres/`node:async_hooks`, que Vite externaliza en el
   * bundle de browser y rompe cualquier story (ver docs/storybook/STORYBOOK_ARCHITECTURE.md).
   * BookingGrid (único caller) la recibe a su vez por prop y la reenvía acá.
   */
  action: CreateBookingAction
  /**
   * Chequeo optimista de disponibilidad (Fase 4 UX), opcional: sin esta prop
   * (tests/stories viejas, o callers que todavía no la cablean) el modal se
   * comporta exactamente igual que antes. Ver el comentario en
   * checkSlotAvailabilityAction (@/app/(admin)/reservas/actions) — nunca
   * reemplaza la validación real del server en el submit.
   */
  checkAvailabilityAction?: CheckSlotAvailabilityAction
}

// Motivo / Tipo de bloqueo del turno manual. Dos familias:
//   * 'contact' → reserva real (type='spontaneous'): muestra datos de contacto
//     opcionales y cotiza con el precio de la cancha.
//   * 'internal' → bloqueo interno (type='block'): sin contacto, sin costo
//     (el server fuerza price 0 para type='block') y `guestName` autocompletado
//     con el motivo, que la grilla muestra como etiqueta del bloque.
type ReasonValue = 'phone' | 'maintenance' | 'school' | 'teachers' | 'other'
type Reason = {
  value: ReasonValue
  label: string
  kind: 'contact' | 'internal'
  /** Nombre autocompletado para bloqueos internos (se guarda en guest_name). */
  autoName?: string
}

const REASONS: Reason[] = [
  { value: 'phone', label: 'Reserva Telefónica', kind: 'contact' },
  { value: 'maintenance', label: 'Mantenimiento', kind: 'internal', autoName: 'Mantenimiento' },
  {
    value: 'school',
    label: 'Escuelita de Fútbol',
    kind: 'internal',
    autoName: 'Escuelita de Fútbol',
  },
  { value: 'teachers', label: 'Profesores', kind: 'internal', autoName: 'Profesores' },
  { value: 'other', label: 'Otro', kind: 'contact' },
]

const DEFAULT_REASON: ReasonValue = 'phone'

function reasonFor(value: ReasonValue): Reason {
  return REASONS.find((r) => r.value === value) ?? REASONS[0]!
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function BookingFormModal({
  slot,
  open,
  onClose,
  onSuccess,
  action,
  checkAvailabilityAction,
}: Props) {
  const [duration, setDuration] = useState<60 | 120>(slot.durationMins)
  const [reason, setReason] = useState<ReasonValue>(DEFAULT_REASON)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // If the parent reuses this modal instance for a different slot, the duration
  // useState initializer won't re-run — resync it so the summary and payload
  // don't go stale.
  useEffect(() => {
    setDuration(slot.durationMins)
  }, [slot.courtId, slot.date, slot.timeStart, slot.durationMins])

  // Fase 4 UX: chequeo optimista de disponibilidad al abrir el modal (o si el
  // caller lo reutiliza para otro slot sin desmontarlo). Solo un aviso
  // temprano — el server sigue siendo quien decide en el submit — así que
  // nunca deshabilita el botón, solo muestra el mismo alert inline de abajo.
  // `cancelled` evita que una respuesta tardía (o el doble efecto de strict
  // mode) pise el estado de un slot que ya no es el actual.
  useEffect(() => {
    if (!open || !checkAvailabilityAction) return
    let cancelled = false
    setError(null)
    checkAvailabilityAction({
      courtId: slot.courtId,
      date: slot.date,
      timeStart: slot.timeStart,
    })
      .then((result) => {
        if (!cancelled && !result.available) {
          setError('Este turno acaba de ser tomado.')
        }
      })
      .catch(() => {
        // Fail-open: un chequeo optimista roto (red, timeout) nunca debe
        // bloquear ni mostrar error — el submit real sigue siendo la fuente
        // de verdad.
      })
    return () => {
      cancelled = true
    }
  }, [open, slot.courtId, slot.date, slot.timeStart, checkAvailabilityAction])

  const selectedReason = reasonFor(reason)
  const isInternalBlock = selectedReason.kind === 'internal'
  // Tarea #6: las reservas reales son de 60 min fijos. Solo los bloqueos internos
  // (mantenimiento, escuelita) pueden abarcar varias horas, así que el selector de
  // duración se muestra únicamente para ellos.
  const effectiveDuration = isInternalBlock ? duration : 60
  const timeEnd = minsToTime(timeToMins(slot.timeStart) + effectiveDuration)

  // Invariante: createManualBookingSchema tiene un .refine() que exige playerId
  // XOR guestName/guestPhone (no se puede mezclar un jugador registrado con
  // datos de invitado). Este form nunca setea `playerId` — no tiene selector de
  // jugador, solo guestName/guestPhone sueltos — así que ese refine nunca puede
  // fallar acá y no hace falta espejarlo del lado del cliente. Si algún día se
  // agrega un selector de jugador, ahí sí replicar el refine en este handler.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const guestName = ((fd.get('guestName') as string) ?? '').trim()
    const guestPhone = ((fd.get('guestPhone') as string) ?? '').trim()
    const notesInternal = ((fd.get('notesInternal') as string) ?? '').trim()

    const common = {
      courtId: slot.courtId,
      date: slot.date,
      timeStart: slot.timeStart,
      timeEnd,
      ...(notesInternal ? { notesInternal } : {}),
    }

    // Bloqueo interno: type='block' (precio 0 forzado en el server), nombre
    // autocompletado con el motivo, sin datos de contacto.
    // Reserva real (telefónica / otro): type='spontaneous'; nombre y teléfono
    // son opcionales e independientes (sin burocracia para el admin).
    const data = isInternalBlock
      ? { ...common, type: 'block' as const, guestName: selectedReason.autoName }
      : {
          ...common,
          type: 'spontaneous' as const,
          ...(guestName ? { guestName } : {}),
          ...(guestPhone ? { guestPhone } : {}),
        }

    setError(null)
    startTransition(async () => {
      try {
        const result = await action(data)
        if (result.success) {
          formRef.current?.reset()
          setDuration(slot.durationMins)
          setReason(DEFAULT_REASON)
          toast({
            title: isInternalBlock ? 'Turno bloqueado' : 'Reserva creada',
            description: `${slot.courtName} · ${slot.timeStart}–${timeEnd}`,
            variant: 'success',
          })
          onSuccess(result.booking)
        } else {
          setError(result.error)
        }
      } catch (err) {
        // A thrown action (network drop, server crash) must not leave the submit
        // button stuck on "Guardando…" — surface a recoverable error instead.
        // Report it too: a silent catch would hide a real server failure.
        Sentry.captureException(err)
        setError('No pudimos crear la reserva. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setError(null)
      setDuration(slot.durationMins)
      setReason(DEFAULT_REASON)
      onClose()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        {/* w-[calc(100vw-2rem)]: gutter de 1rem por lado en mobile (misma receta
            que ui/dialog.tsx) — con w-full el card quedaba edge-to-edge <448px. */}
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100vw-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card text-card-foreground border border-border rounded-xl shadow-2xl dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] p-6 focus:outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Title className="text-base font-semibold text-foreground mb-1">
            Nueva reserva
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-4">
            {slot.courtName} · {formatDateLong(slot.date)} · {slot.timeStart}–{timeEnd}
          </Dialog.Description>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-foreground mb-1">
                Motivo / Tipo de Bloqueo
              </label>
              <select
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as ReasonValue)}
                className="w-full rounded-md border border-input bg-background text-foreground px-3 py-2 h-11 md:h-10 text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {isInternalBlock && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Bloqueo interno sin costo. Se agenda como “{selectedReason.autoName}”.
                </p>
              )}
            </div>

            {isInternalBlock && (
              <div>
                <label
                  id="duration-label"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Duración del bloqueo
                </label>
                <div role="group" aria-labelledby="duration-label" className="flex gap-2">
                  {([60, 120] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={duration === d}
                      onClick={() => setDuration(d)}
                      className={`flex-1 py-1.5 min-h-11 md:min-h-9 rounded border text-sm font-medium transition-colors duration-100 ${
                        duration === d
                          ? 'bg-primary text-white border-emerald-600'
                          : 'bg-card text-foreground border-border hover:bg-accent'
                      }`}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isInternalBlock && (
              <div>
                <label
                  htmlFor="guestName"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Nombre <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="guestName"
                  name="guestName"
                  type="text"
                  maxLength={200}
                  autoComplete="name"
                  className="w-full rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground px-3 py-2 h-11 md:h-10 text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  placeholder="Ej: Juan Pérez"
                />
              </div>
            )}

            {/* Secundarios (Fase 3 UX, progressive disclosure): teléfono y notas
                internas no son necesarios para cargar el turno rápido — se
                colapsan bajo "Opciones avanzadas". El único error de esta action
                es el genérico de abajo (result.error, sin atar a un campo
                puntual) y vive FUERA de este Collapsible, siempre visible sea
                cual sea su estado — no hace falta auto-expandirlo. */}
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                Opciones avanzadas
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                {!isInternalBlock && (
                  <PhoneInput
                    id="guestPhone"
                    name="guestPhone"
                    label="Teléfono (opcional)"
                    placeholder="11 1234-5678"
                  />
                )}

                <div>
                  <label
                    htmlFor="notesInternal"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    Notas internas <span className="text-muted-foreground">(opcional)</span>
                  </label>
                  <textarea
                    id="notesInternal"
                    name="notesInternal"
                    maxLength={1000}
                    rows={2}
                    className="w-full rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground px-3 py-2 min-h-11 md:min-h-9 text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none"
                    placeholder="Solo visible para el staff"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {error && (
              <p
                role="alert"
                className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/25"
              >
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 h-11 md:h-10 text-sm font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors duration-100"
                >
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 h-11 md:h-10 text-sm font-medium text-white bg-primary rounded-md hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-100 active:scale-[0.98] motion-reduce:active:scale-100"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isPending ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
