'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Sentry from '@sentry/nextjs'
import {
  AlertCircle,
  AlertTriangle,
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
import { MoneyInput } from '@/components/ui/money-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dialogContentClass } from '@/components/ui/dialog'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { BookingActionResult } from '@/app/(admin)/reservas/actions'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'
import { formatDateLong } from '@/lib/format'
import { END_OF_DAY_MINS, endLabelFromMins } from '@/shared/time/operating-day'
import { cn } from '@/lib/utils'

type Slot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  durationMins: 60 | 120
  /**
   * Estado de la cancha preseleccionada (BookingGrid la trae de CourtRow —
   * ver settings/canchas). Opcional: sin este dato
   * (stories/tests viejas, u otro caller que no lo cablea) el modal no
   * bloquea el submit — mismo criterio "fail open" que checkAvailabilityAction.
   */
  courtStatus?: 'online' | 'offline'
}

export type CreateBookingAction = (data: unknown) => Promise<BookingActionResult>

export type CheckSlotAvailabilityAction = (input: {
  courtId: string
  date: string
  timeStart: string
}) => Promise<{ available: boolean }>

export type SearchBookingPlayersResult =
  { success: true; players: PlayerSearchResult[] } | { success: false; error: string }

export type SearchBookingPlayersAction = (input: unknown) => Promise<SearchBookingPlayersResult>

type Props = {
  slot: Slot
  open: boolean
  onClose: () => void
  onSuccess: (booking: BookingRow) => void
  action: CreateBookingAction
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
}

type ReasonValue = 'phone' | 'maintenance' | 'school' | 'teachers' | 'other'
type Reason = {
  value: ReasonValue
  label: string
  kind: 'contact' | 'internal'
  autoName?: string
  icon: React.ComponentType<{ className?: string }>
}

const REASONS: Reason[] = [
  { value: 'phone', label: 'Reserva Telefónica', kind: 'contact', icon: PhoneCall },
  {
    value: 'maintenance',
    label: 'Mantenimiento',
    kind: 'internal',
    autoName: 'Mantenimiento',
    icon: Wrench,
  },
  {
    value: 'school',
    label: 'Escuelita de Fútbol',
    kind: 'internal',
    autoName: 'Escuelita de Fútbol',
    icon: GraduationCap,
  },
  {
    value: 'teachers',
    label: 'Profesores',
    kind: 'internal',
    autoName: 'Profesores',
    icon: UserCheck,
  },
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

const BASE_HOURLY_START_TIMES = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
  '23:00',
]

export function BookingFormModal({
  slot,
  open,
  onClose,
  onSuccess,
  action,
  checkAvailabilityAction,
  searchPlayersAction,
}: Props) {
  const [timeStart, setTimeStart] = useState<string>(slot.timeStart)
  const [duration, setDuration] = useState<number>(slot.durationMins)
  const [reason, setReason] = useState<ReasonValue>(DEFAULT_REASON)
  const [isTimeStartOpen, setIsTimeStartOpen] = useState(false)
  const [isTimeEndOpen, setIsTimeEndOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const guestNameInputRef = useRef<HTMLInputElement>(null)

  // Autocomplete de jugador registrado: mientras no se elige un resultado
  // viaja como guestName/guestPhone libre igual que antes (playerId null).
  // Elegir un jugador oculta/vacía guestName/guestPhone — createManualBookingSchema
  // los declara mutuamente excluyentes.
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerQuery, setPlayerQuery] = useState('')
  const [playerResults, setPlayerResults] = useState<PlayerSearchResult[]>([])
  const [playerSearchOpen, setPlayerSearchOpen] = useState(false)
  const playerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Lo cobrado al crear el turno a mano. `''` = todavía no contestó y el submit
  // lo rechaza; `'none'` = dijo explícitamente que no cobró nada. Con un método
  // elegido, los tres campos (depositMethod/depositAmount/depositStatus:'paid')
  // viajan juntos o no viaja ninguno.
  const [depositMethod, setDepositMethod] = useState<
    '' | 'none' | 'cash' | 'transfer' | 'mercadopago' | 'other'
  >('')

  const isCourtOffline = slot.courtStatus === 'offline'

  function clearPlayer() {
    setPlayerId(null)
    setPlayerQuery('')
    setPlayerResults([])
    setPlayerSearchOpen(false)
  }

  function handlePlayerQueryChange(next: string) {
    setPlayerQuery(next)
    setPlayerId(null)
    if (playerDebounceRef.current) clearTimeout(playerDebounceRef.current)
    const q = next.trim()
    if (!searchPlayersAction || q.length < 2) {
      setPlayerResults([])
      setPlayerSearchOpen(false)
      return
    }
    playerDebounceRef.current = setTimeout(() => {
      void (async () => {
        const result = await searchPlayersAction({ query: q })
        if (result.success) {
          setPlayerResults(result.players)
          setPlayerSearchOpen(result.players.length > 0)
        }
      })()
    }, 300)
  }

  function selectPlayer(player: PlayerSearchResult) {
    setPlayerId(player.id)
    setPlayerQuery(player.name)
    setPlayerResults([])
    setPlayerSearchOpen(false)
  }

  useEffect(() => {
    return () => {
      if (playerDebounceRef.current) clearTimeout(playerDebounceRef.current)
    }
  }, [])

  function handleReasonSelect(val: ReasonValue) {
    setReason(val)
    if (val === 'other' || val === 'phone') {
      setTimeout(() => {
        guestNameInputRef.current?.focus()
      }, 50)
    }
  }

  // Al cambiar de slot, los campos vuelven a los valores de ESE turno. Ajuste
  // durante el render (patrón de React para adaptar estado a un cambio de prop)
  // en vez de un efecto: con el efecto, abrir otro turno mostraba por un frame
  // la duración y la hora del anterior.
  const slotKey = `${slot.courtId}|${slot.date}|${slot.timeStart}|${slot.durationMins}`
  const [lastSlotKey, setLastSlotKey] = useState(slotKey)
  if (slotKey !== lastSlotKey) {
    setLastSlotKey(slotKey)
    setDuration(slot.durationMins)
    setTimeStart(slot.timeStart)
  }

  useEffect(() => {
    if (!open || !checkAvailabilityAction) return
    let cancelled = false
    // Arranque de una operación asincrónica: limpia el error anterior antes de
    // volver a chequear disponibilidad. No encadena renders (el efecto no
    // depende de `error`).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null)
    checkAvailabilityAction({
      courtId: slot.courtId,
      date: slot.date,
      timeStart,
    })
      .then((result) => {
        if (!cancelled && !result.available) {
          setError('Este turno acaba de ser tomado.')
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, slot.courtId, slot.date, timeStart, checkAvailabilityAction])

  const selectedReason = reasonFor(reason)
  const isInternalBlock = selectedReason.kind === 'internal'
  const isOtherReason = reason === 'other'
  const allowsCustomDuration = isInternalBlock || isOtherReason

  const startMins = timeToMins(timeStart)
  const maxHours = Math.max(1, Math.floor((END_OF_DAY_MINS - startMins) / 60))
  const allDurations = Array.from({ length: maxHours }, (_, i) => (i + 1) * 60)
  const effectiveDuration = allowsCustomDuration ? duration : 60
  const timeEnd = endLabelFromMins(startMins + effectiveDuration)

  const startTimes = BASE_HOURLY_START_TIMES.includes(slot.timeStart)
    ? BASE_HOURLY_START_TIMES
    : [...BASE_HOURLY_START_TIMES, slot.timeStart].sort((a, b) => timeToMins(a) - timeToMins(b))

  const endOptions = allDurations.map((d) => {
    const mins = startMins + d
    return {
      durationMins: d,
      label: endLabelFromMins(mins),
      hoursLabel: `${d / 60} ${d === 60 ? 'hora' : 'horas'}`,
    }
  })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isCourtOffline) return
    const fd = new FormData(e.currentTarget)
    // Jugador registrado y datos de invitado son mutuamente excluyentes
    // (createManualBookingSchema): con playerId elegido, guestName/guestPhone
    // viajan vacíos aunque el input siga montado en el DOM.
    const guestName = playerId ? '' : ((fd.get('guestName') as string) ?? '').trim()
    const guestPhone = playerId ? '' : ((fd.get('guestPhone') as string) ?? '').trim()
    const notesInternal = ((fd.get('notesInternal') as string) ?? '').trim()

    // MoneyInput ya entrega el valor en CENTAVOS via el hidden input (name=) —
    // fd.get acá NO son pesos, así que no hay que volver a multiplicar por 100.
    const priceOverrideRaw = ((fd.get('priceOverridePesos') as string) ?? '').trim()
    const priceOverrideCents = priceOverrideRaw === '' ? undefined : Number(priceOverrideRaw)
    const priceOverride =
      priceOverrideCents !== undefined &&
      Number.isFinite(priceOverrideCents) &&
      priceOverrideCents >= 0
        ? priceOverrideCents
        : undefined

    // La seña solo aplica a reservas de cliente (no a bloqueos internos): los
    // tres campos (method/amount/status) viajan juntos o no viaja ninguno.
    // Narrowing por const, no por `depositMethod &&`: ahora `'none'` es truthy
    // (es una respuesta, no la ausencia de una), así que el check de falsy ya no
    // alcanza para dejar afuera los dos sentinels.
    const chargedMethod = depositMethod === '' || depositMethod === 'none' ? null : depositMethod
    const depositAmountRaw =
      !isInternalBlock && chargedMethod
        ? ((fd.get('depositAmountPesos') as string) ?? '').trim()
        : ''
    const depositAmountCents = depositAmountRaw === '' ? undefined : Number(depositAmountRaw)
    const depositAmount =
      depositAmountCents !== undefined &&
      Number.isFinite(depositAmountCents) &&
      depositAmountCents > 0
        ? depositAmountCents
        : undefined

    const common = {
      courtId: slot.courtId,
      date: slot.date,
      timeStart,
      timeEnd,
      ...(notesInternal ? { notesInternal } : {}),
      ...(priceOverride !== undefined ? { priceOverride } : {}),
      ...(!isInternalBlock && chargedMethod && depositAmount !== undefined
        ? { depositMethod: chargedMethod, depositAmount, depositStatus: 'paid' as const }
        : {}),
    }

    const isBlockType = isInternalBlock || (isOtherReason && effectiveDuration > 60)
    const data = isBlockType
      ? {
          ...common,
          type: 'block' as const,
          guestName: selectedReason.autoName ?? (guestName || 'Otro / Evento'),
          ...(guestPhone ? { guestPhone } : {}),
        }
      : {
          ...common,
          type: 'spontaneous' as const,
          ...(playerId ? { playerId } : {}),
          ...(guestName ? { guestName } : {}),
          ...(guestPhone ? { guestPhone } : {}),
        }

    // Respuesta obligatoria sobre la plata (pedido del dueño): un turno cargado
    // a mano no tiene ningún hecho de cobro detrás salvo lo que afirme el
    // mostrador. Los bloqueos internos no cobran nada, así que quedan afuera.
    if (!isInternalBlock && depositMethod === '') {
      setError('Decí si cobraste algo por este turno.')
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        const result = await action(data)
        if (result.success) {
          formRef.current?.reset()
          setDuration(slot.durationMins)
          setReason(DEFAULT_REASON)
          clearPlayer()
          setDepositMethod('')
          toast({
            title: isInternalBlock ? 'Turno bloqueado' : 'Reserva creada',
            description: `${slot.courtName} · ${timeStart}–${timeEnd}`,
            variant: 'success',
          })
          onSuccess(result.booking)
        } else {
          setError(result.error)
        }
      } catch (err) {
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
      clearPlayer()
      setDepositMethod('')
      onClose()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 dark:bg-black/80 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className={cn(dialogContentClass, 'max-w-3xl')}>
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
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                  <Clock className="h-3 w-3 shrink-0" />
                  {timeStart}–{timeEnd} ({effectiveDuration / 60}{' '}
                  {effectiveDuration === 60 ? 'hr' : 'hrs'})
                </span>
              </div>
            </Dialog.Description>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              {/* Columna Izquierda: Horarios y Motivos */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {/* Horario de inicio */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="time-start-trigger"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Horario de inicio
                    </Label>

                    {/* El <Label> de arriba apunta al BOTÓN del Popover, no a este
                        select, que es el campo real del form y sigue en el árbol de
                        accesibilidad (sr-only oculta a la vista, no al lector).
                        Sin nombre propio axe lo marca `select-name`. */}
                    <select
                      aria-label="Horario de inicio"
                      id="timeStart"
                      name="timeStart"
                      value={timeStart}
                      onChange={(e) => {
                        const newStart = e.target.value
                        setTimeStart(newStart)
                        const newStartMins = timeToMins(newStart)
                        const newMaxHours = Math.max(
                          1,
                          Math.floor((END_OF_DAY_MINS - newStartMins) / 60),
                        )
                        if (duration / 60 > newMaxHours) {
                          setDuration(newMaxHours * 60)
                        }
                      }}
                      className="sr-only"
                    >
                      {startTimes.map((t) => (
                        <option key={t} value={t}>
                          {t} hs
                        </option>
                      ))}
                    </select>

                    <Popover open={isTimeStartOpen} onOpenChange={setIsTimeStartOpen}>
                      <PopoverTrigger asChild>
                        <button
                          id="time-start-trigger"
                          type="button"
                          aria-label="Seleccionar horario de inicio"
                          className="flex w-full items-center justify-between gap-1.5 rounded-xl border border-border/80 bg-background dark:bg-zinc-900/60 px-3.5 py-2.5 text-xs font-semibold text-foreground transition-all hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500/40 shadow-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>{timeStart} hs</span>
                          </div>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                              isTimeStartOpen && 'rotate-180',
                            )}
                          />
                        </button>
                      </PopoverTrigger>
                      {/* Radix le pone role="dialog" al contenido del popover, y
                          un dialog sin nombre accesible es `aria-dialog-name`. */}
                      <PopoverContent
                        aria-label="Horarios de inicio"
                        align="start"
                        className="w-44 p-1.5 max-h-60 overflow-y-auto rounded-xl bg-card text-card-foreground border border-border/90 shadow-xl backdrop-blur-xl space-y-0.5 z-50"
                      >
                        {startTimes.map((t) => {
                          const isSelected = timeStart === t
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                setTimeStart(t)
                                const newStartMins = timeToMins(t)
                                const newMaxHours = Math.max(
                                  1,
                                  Math.floor((END_OF_DAY_MINS - newStartMins) / 60),
                                )
                                if (duration / 60 > newMaxHours) {
                                  setDuration(newMaxHours * 60)
                                }
                                setIsTimeStartOpen(false)
                              }}
                              className={cn(
                                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer text-left',
                                isSelected
                                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold'
                                  : 'hover:bg-accent text-foreground',
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {isSelected ? (
                                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                ) : (
                                  <div className="h-4 w-4 shrink-0" />
                                )}
                                <span>{t} hs</span>
                              </div>
                            </button>
                          )
                        })}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Horario de fin */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="time-end-trigger"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Horario de fin
                    </Label>

                    <select
                      aria-label="Duración del turno"
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

                    {allowsCustomDuration ? (
                      <Popover open={isTimeEndOpen} onOpenChange={setIsTimeEndOpen}>
                        <PopoverTrigger asChild>
                          <button
                            id="time-end-trigger"
                            type="button"
                            aria-label="Seleccionar horario de fin"
                            className="flex w-full items-center justify-between gap-1.5 rounded-xl border border-border/80 bg-background dark:bg-zinc-900/60 px-3.5 py-2.5 text-xs font-semibold text-foreground transition-all hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500/40 shadow-xs cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{timeEnd} hs</span>
                              <span className="text-[10px] text-muted-foreground font-normal">
                                ({effectiveDuration / 60} {effectiveDuration === 60 ? 'hr' : 'hrs'})
                              </span>
                            </div>
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                                isTimeEndOpen && 'rotate-180',
                              )}
                            />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          aria-label="Horarios de fin"
                          align="end"
                          className="w-48 p-1.5 max-h-60 overflow-y-auto rounded-xl bg-card text-card-foreground border border-border/90 shadow-xl backdrop-blur-xl space-y-0.5 z-50"
                        >
                          {endOptions.map((opt) => {
                            const isSelected = duration === opt.durationMins
                            return (
                              <button
                                key={opt.durationMins}
                                type="button"
                                onClick={() => {
                                  setDuration(opt.durationMins)
                                  setIsTimeEndOpen(false)
                                }}
                                className={cn(
                                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer text-left',
                                  isSelected
                                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold'
                                    : 'hover:bg-accent text-foreground',
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  {isSelected ? (
                                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  ) : (
                                    <div className="h-4 w-4 shrink-0" />
                                  )}
                                  <span>{opt.label} hs</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  ({opt.hoursLabel})
                                </span>
                              </button>
                            )
                          })}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <div className="flex w-full items-center justify-between gap-1 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{timeEnd} hs</span>
                        </div>
                        <span className="text-[10px] font-normal">(1 hr)</span>
                      </div>
                    )}
                  </div>
                </div>

                {!isInternalBlock && (
                  <div className="relative space-y-1.5">
                    <Label
                      htmlFor="playerSearch"
                      className="flex items-center justify-between text-sm font-medium text-foreground"
                    >
                      <span>Jugador registrado</span>
                      <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="playerSearch"
                      type="text"
                      autoComplete="off"
                      value={playerQuery}
                      onChange={(e) => handlePlayerQueryChange(e.target.value)}
                      onFocus={() => {
                        if (playerResults.length > 0) setPlayerSearchOpen(true)
                      }}
                      onBlur={() => {
                        // Delay para que el mousedown de la opción llegue a disparar antes.
                        setTimeout(() => setPlayerSearchOpen(false), 150)
                      }}
                      placeholder="Buscar por nombre o email..."
                      // `aria-expanded`/`aria-autocomplete` NO están permitidos en
                      // un textbox pelado (axe: aria-allowed-attr) — el control es
                      // un combobox y hay que declararlo. `aria-controls` solo
                      // cuando la lista existe: apuntar a un id inexistente es otra
                      // violación (aria-valid-attr-value).
                      role="combobox"
                      aria-expanded={playerSearchOpen}
                      aria-autocomplete="list"
                      aria-controls={
                        playerSearchOpen && playerResults.length > 0
                          ? 'playerSearchResults'
                          : undefined
                      }
                      className="rounded-xl border-border/80 bg-background dark:bg-zinc-900/60 transition-colors focus:border-emerald-500"
                    />
                    {playerId && (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3 w-3 shrink-0" />
                        <span>Vinculado a un jugador registrado.</span>
                        <button
                          type="button"
                          onClick={clearPlayer}
                          className="underline underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-300 cursor-pointer"
                        >
                          Quitar
                        </button>
                      </p>
                    )}
                    {playerSearchOpen && playerResults.length > 0 && (
                      <ul
                        id="playerSearchResults"
                        role="listbox"
                        aria-label="Jugadores encontrados"
                        className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border/90 bg-popover text-popover-foreground shadow-xl backdrop-blur-xl p-1 space-y-0.5"
                      >
                        {playerResults.map((p) => (
                          // `role="none"` en el li y `role="option"` en el botón: un
                          // listbox exige hijos option, y meter un botón DENTRO de
                          // un option sería un control anidado. El botón ES la opción.
                          <li key={p.id} role="none">
                            <button
                              type="button"
                              role="option"
                              aria-selected={false}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectPlayer(p)}
                              className="flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer hover:bg-accent"
                            >
                              <span className="truncate font-medium text-foreground">{p.name}</span>
                              <span className="truncate text-muted-foreground">{p.email}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {!isInternalBlock && !playerId && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="guestName"
                      className="flex items-center justify-between text-sm font-medium text-foreground"
                    >
                      <span>{reason === 'other' ? 'Nombre / Motivo' : 'Nombre del cliente'}</span>
                      <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Input
                      ref={guestNameInputRef}
                      id="guestName"
                      name="guestName"
                      type="text"
                      maxLength={200}
                      autoComplete="name"
                      placeholder={
                        reason === 'other'
                          ? 'Ej: Torneo nocturno, Cumpleaños, Juan...'
                          : 'Ej: Juan Pérez'
                      }
                      className="rounded-xl border-border/80 bg-background dark:bg-zinc-900/60 transition-colors focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Columna Derecha: Motivos y chips */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reason" className="block text-sm font-semibold text-foreground">
                    Motivo / Tipo de Bloqueo
                  </Label>

                  <div className="grid grid-cols-2 gap-1.5">
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
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-semibold shadow-2xs'
                              : 'bg-muted/40 hover:bg-muted/80 border-border/60 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Icon
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              isSelected
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground',
                            )}
                          />
                          <span className="truncate">{r.label}</span>
                        </button>
                      )
                    })}
                  </div>

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
                    <p className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl font-medium mt-1.5">
                      <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>
                        Bloqueo interno sin costo. Se agenda como{' '}
                        <strong>“{selectedReason.autoName}”</strong>.
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors pt-1 cursor-pointer"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Opciones avanzadas</span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent forceMount className="pt-3 space-y-3 data-[state=closed]:hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isInternalBlock && !playerId && (
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="guestPhone"
                        className="flex items-center justify-between text-sm font-medium text-foreground"
                      >
                        <span>Teléfono del cliente</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          (opcional)
                        </span>
                      </Label>
                      <PhoneInput
                        id="guestPhone"
                        name="guestPhone"
                        placeholder="Ej: 11 2345-6789"
                        className="rounded-xl border-border/80 bg-background dark:bg-zinc-900/60 transition-colors focus-within:border-emerald-500"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="priceOverridePesos"
                      className="flex items-center justify-between text-sm font-medium text-foreground"
                    >
                      <span>Precio del turno</span>
                      <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <MoneyInput
                      id="priceOverridePesos"
                      name="priceOverridePesos"
                      minCents={0}
                      placeholder="Precio de la grilla"
                    />
                  </div>

                  {!isInternalBlock && (
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="depositMethod"
                        className="flex items-center justify-between text-sm font-medium text-foreground"
                      >
                        <span>¿Cobraste algo ahora?</span>
                      </Label>
                      <select
                        id="depositMethod"
                        value={depositMethod}
                        onChange={(e) => setDepositMethod(e.target.value as typeof depositMethod)}
                        className="w-full rounded-xl border border-border/80 bg-background dark:bg-zinc-900/60 px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors focus:border-emerald-500 focus:outline-hidden"
                      >
                        <option value="" disabled>
                          Elegí una opción
                        </option>
                        <option value="none">No cobré</option>
                        <option value="cash">Efectivo</option>
                        <option value="transfer">Transferencia</option>
                        <option value="mercadopago">MercadoPago</option>
                        <option value="other">Otro</option>
                      </select>
                    </div>
                  )}

                  {!isInternalBlock && depositMethod !== '' && depositMethod !== 'none' && (
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="depositAmountPesos"
                        className="text-sm font-medium text-foreground"
                      >
                        Cuánto cobraste
                      </Label>
                      <MoneyInput
                        id="depositAmountPesos"
                        name="depositAmountPesos"
                        minCents={1}
                        placeholder="Monto"
                      />
                    </div>
                  )}

                  <div className={cn('space-y-1.5', (isInternalBlock || playerId) && 'col-span-2')}>
                    <Label
                      htmlFor="notesInternal"
                      className="flex items-center justify-between text-sm font-medium text-foreground"
                    >
                      <span>Notas internas</span>
                      <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <textarea
                      id="notesInternal"
                      name="notesInternal"
                      rows={2}
                      maxLength={1000}
                      placeholder="Ej: Avisó que llega 10 min tarde, traen pelota propia..."
                      className="w-full rounded-xl border border-border/80 bg-background dark:bg-zinc-900/60 px-3.5 py-2.5 text-sm text-foreground transition-all focus:border-emerald-500 focus:outline-hidden resize-none"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {isCourtOffline && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-400 text-xs font-medium"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Esta cancha está offline, no recibe reservas nuevas.</span>
              </div>
            )}

            {/* red-700 en claro, el token en oscuro: mismo idiom ya documentado
                en `error-state.tsx` — `text-destructive` (red-600) sobre su
                propio tinte translúcido en superficie clara no llega a AA. */}
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-red-700 dark:text-destructive text-xs font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
                className="rounded-xl font-medium"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                isLoading={isPending}
                disabled={isCourtOffline}
                className="rounded-xl font-semibold"
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
