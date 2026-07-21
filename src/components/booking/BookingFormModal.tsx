'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Sentry from '@sentry/nextjs'
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  GraduationCap,
  Info,
  MapPin,
  MoreHorizontal,
  PhoneCall,
  SlidersHorizontal,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { PhoneInput } from '@/components/ui/phone-input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { BookingActionResult } from '@/app/(admin)/reservas/actions'
import { formatDateLong } from '@/lib/format'
import { END_OF_DAY_MINS, endLabelFromMins } from '@/shared/time/operating-day'
import { cn } from '@/lib/utils'

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
  icon: React.ComponentType<{ className?: string }>
}

const REASONS: Reason[] = [
  { value: 'phone', label: 'Reserva Telefónica', kind: 'contact', icon: PhoneCall },
  { value: 'maintenance', label: 'Mantenimiento', kind: 'internal', autoName: 'Mantenimiento', icon: Wrench },
  {
    value: 'school',
    label: 'Escuelita de Fútbol',
    kind: 'internal',
    autoName: 'Escuelita de Fútbol',
    icon: GraduationCap,
  },
  { value: 'teachers', label: 'Profesores', kind: 'internal', autoName: 'Profesores', icon: UserCheck },
  { value: 'other', label: 'Otro', kind: 'contact', icon: MoreHorizontal },
]

const DEFAULT_REASON: ReasonValue = 'phone'

function reasonFor(value: ReasonValue): Reason {
  return REASONS.find((r) => r.value === value) ?? REASONS[0]!
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function BookingFormModal({
  slot,
  open,
  onClose,
  onSuccess,
  action,
  checkAvailabilityAction,
}: Props) {
  const [duration, setDuration] = useState<number>(slot.durationMins)
  const [reason, setReason] = useState<ReasonValue>(DEFAULT_REASON)
  const [isDurationOpen, setIsDurationOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const guestNameInputRef = useRef<HTMLInputElement>(null)

  function handleReasonSelect(val: ReasonValue) {
    setReason(val)
    if (val === 'other' || val === 'phone') {
      setTimeout(() => {
        guestNameInputRef.current?.focus()
      }, 50)
    }
  }

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
  const allowsCustomDuration = isInternalBlock || reason === 'other'
  // Bloqueos internos y "Otro" (torneos, eventos) pueden abarcar
  // desde 1 hora hasta la jornada completa (varias horas).
  const startMins = timeToMins(slot.timeStart)
  const maxHours = Math.max(1, Math.floor((END_OF_DAY_MINS - startMins) / 60))
  const allDurations = Array.from({ length: maxHours }, (_, i) => (i + 1) * 60)
  const effectiveDuration = allowsCustomDuration ? duration : 60
  const timeEnd = endLabelFromMins(startMins + effectiveDuration)

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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 dark:bg-black/80 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        {/* w-[calc(100vw-2rem)]: gutter de 1rem por lado en mobile (misma receta
            que ui/dialog.tsx) — con w-full el card quedaba edge-to-edge <448px. */}
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100vw-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card text-card-foreground border border-border/80 rounded-2xl shadow-2xl backdrop-blur-xl p-6 sm:p-7 focus:outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Close className="absolute right-4 top-4 rounded-lg opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </Dialog.Close>

          <div className="mb-5 space-y-2">
            <Dialog.Title className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Nueva reserva
            </Dialog.Title>

            <Dialog.Description asChild>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {slot.courtName}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium border border-border/60">
                  <Calendar className="h-3 w-3 shrink-0" />
                  {formatDateLong(slot.date)}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium border border-border/60">
                  <Clock className="h-3 w-3 shrink-0" />
                  {slot.timeStart}–{timeEnd}
                </span>
              </div>
            </Dialog.Description>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason" className="block text-sm font-semibold text-foreground">
                Motivo / Tipo de Bloqueo
              </Label>

              {/* Selector táctil en chips para UX rápida de 1 tap */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {REASONS.map((r) => {
                  const Icon = r.icon
                  const isSelected = reason === r.value
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => handleReasonSelect(r.value)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all duration-150 text-left cursor-pointer',
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold shadow-2xs'
                          : 'bg-muted/40 hover:bg-muted/80 border-border/60 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} />
                      <span className="truncate">{r.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Native Select oculto visualmente pero activo en DOM para accesibilidad/tests */}
              <select
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => handleReasonSelect(e.target.value as ReasonValue)}
                className="sr-only"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              {isInternalBlock && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl font-medium mt-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>Bloqueo interno sin costo. Se agenda como <strong>“{selectedReason.autoName}”</strong>.</span>
                </p>
              )}
            </div>

            {allowsCustomDuration && (
              <div className="space-y-1.5">
                <Label htmlFor="duration-select-trigger" className="flex items-center justify-between text-sm font-semibold text-foreground">
                  <span>Duración {reason === 'other' ? 'de la reserva' : 'del bloqueo / evento'}</span>
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg">
                    Hasta las {timeEnd} ({effectiveDuration / 60} hs)
                  </span>
                </Label>

                {/* Hidden native select for form serialization & accessible test queries */}
                <select
                  id="duration"
                  name="duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="sr-only"
                >
                  {allDurations.map((d) => (
                    <option key={d} value={d}>
                      {d / 60} {d === 60 ? 'hora' : 'horas'}
                    </option>
                  ))}
                </select>

                {/* Modern Popover Selector Custom UI */}
                <Popover open={isDurationOpen} onOpenChange={setIsDurationOpen}>
                  <PopoverTrigger asChild>
                    <button
                      id="duration-select-trigger"
                      type="button"
                      aria-label="Seleccionar duración"
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/80 bg-background dark:bg-zinc-900/60 px-3.5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500/40 shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="font-semibold text-foreground">
                          {duration / 60} {duration === 60 ? 'hora' : 'horas'}
                        </span>
                        <span className="text-xs text-muted-foreground font-normal">
                          (hasta las {endLabelFromMins(startMins + duration)})
                        </span>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200", isDurationOpen && "rotate-180")} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1.5 rounded-xl bg-card text-card-foreground border border-border/90 shadow-xl backdrop-blur-xl space-y-0.5">
                    {allDurations.map((d) => {
                      const isSelected = duration === d
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setDuration(d)
                            setIsDurationOpen(false)
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer text-left',
                            isSelected
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                              : 'hover:bg-accent text-foreground'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected ? (
                              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <div className="h-4 w-4 shrink-0" />
                            )}
                            <span>{d / 60} {d === 60 ? 'hora' : 'horas'}</span>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">
                            hasta {endLabelFromMins(startMins + d)}
                          </span>
                        </button>
                      )
                    })}
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {!isInternalBlock && (
              <div className="space-y-1.5">
                <Label htmlFor="guestName" className="flex items-center justify-between text-sm font-medium text-foreground">
                  <span>{reason === 'other' ? 'Nombre / Motivo' : 'Nombre'}</span>
                  <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  ref={guestNameInputRef}
                  id="guestName"
                  name="guestName"
                  type="text"
                  maxLength={200}
                  autoComplete="name"
                  placeholder={reason === 'other' ? 'Ej: Torneo nocturno, Cumpleaños, Juan...' : 'Ej: Juan Pérez'}
                  className="rounded-xl border-border/80 bg-background dark:bg-zinc-900/60 transition-all focus:border-emerald-500"
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
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground group-hover:text-foreground">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Opciones avanzadas
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3.5 pt-3">
                {!isInternalBlock && (
                  <PhoneInput
                    id="guestPhone"
                    name="guestPhone"
                    label="Teléfono (opcional)"
                    placeholder="11 1234-5678"
                  />
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="notesInternal" className="flex items-center justify-between text-sm font-medium text-foreground">
                    <span>Notas internas</span>
                    <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <textarea
                    id="notesInternal"
                    name="notesInternal"
                    maxLength={1000}
                    rows={2}
                    className="w-full rounded-xl border border-input bg-background dark:bg-zinc-900/60 text-foreground placeholder:text-muted-foreground/60 px-3.5 py-2.5 min-h-16 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary resize-none shadow-xs"
                    placeholder="Solo visible para el staff"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:text-red-400 shadow-xs animate-in fade-in-50"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2.5 justify-end pt-2">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl px-4"
                >
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                disabled={isPending}
                isLoading={isPending}
                className="rounded-xl px-5 font-semibold bg-primary hover:bg-emerald-600 text-primary-foreground shadow-md shadow-emerald-500/20"
              >
                {isPending ? 'Guardando…' : 'Confirmar'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
