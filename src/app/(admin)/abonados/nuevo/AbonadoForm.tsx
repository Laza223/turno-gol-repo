'use client'

import { useTransition, useState, useMemo, useRef, useEffect } from 'react'
import type {
  NewAbonadoState,
  PreviewAbonadoSlotsInput,
  PreviewAbonadoSlotsResult,
} from './actions'
import type { SearchAbonadoPlayersActionResult } from '../actions'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'
import { Badge } from '@/components/ui/badge'
import { PhoneInput } from '@/components/ui/phone-input'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import DatePicker from '@/components/ui/date-picker'
import { MoneyInput } from '@/components/ui/money-input'
import { formatArs } from '@/lib/format'
import { todayART } from '@/shared/time/art-date'
import {
  Clock,
  CalendarDays,
  MapPin,
  User,
  DollarSign,
  Repeat,
  CheckCircle2,
  AlertTriangle,
  CalendarCheck2,
  ArrowRight,
  Sparkles,
  Check,
} from 'lucide-react'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'

export type SubmitNewAbonadoAction = (
  prevState: NewAbonadoState,
  formData: FormData,
) => Promise<NewAbonadoState>

export type PreviewAbonadoSlotsAction = (
  input: PreviewAbonadoSlotsInput,
) => Promise<PreviewAbonadoSlotsResult>

export type SearchAbonadoPlayersAction = (
  input: unknown,
) => Promise<SearchAbonadoPlayersActionResult>

const DAYS: ComboboxOption[] = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
]

/** Opciones de horarios en intervalos de 30 minutos (00:00 a 23:30) */
const TIME_OPTIONS: ComboboxOption[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor((i * 30) / 60)
  const m = (i * 30) % 60
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const val = `${hh}:${mm}`
  return {
    value: val,
    label: val === '00:00' && i > 0 ? '00:00 (Medianoche)' : val,
  }
})

const initial: NewAbonadoState = { status: 'idle' }

/**
 * Plural correcto del nombre de un día. Lunes/Martes/Miércoles/Jueves/Viernes
 * ya terminan en "s" y son invariables en plural ("los Lunes"); Sábado/Domingo
 * suman "s" ("Sábados"/"Domingos").
 */
function pluralizeDayLabel(label: string): string {
  return label.endsWith('s') ? label : `${label}s`
}

function normalizeMidnightEnd(timeEnd: string): string {
  return timeEnd === '00:00' ? '24:00' : timeEnd
}

function addOneHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return '20:00'
  const nextH = (h + 1) % 24
  const hh = String(nextH).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
}

function getNextMatchingDate(fromDateStr: string | null, targetDayOfWeek: number): string {
  let base: Date
  if (fromDateStr && /^\d{4}-\d{2}-\d{2}$/.test(fromDateStr)) {
    const [y, m, d] = fromDateStr.split('-').map(Number)
    base = new Date(y!, m! - 1, d!)
  } else {
    base = new Date()
  }

  if (base.getDay() === targetDayOfWeek) {
    const y = base.getFullYear()
    const m = String(base.getMonth() + 1).padStart(2, '0')
    const d = String(base.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const next = new Date(base)
  while (next.getDay() !== targetDayOfWeek) {
    next.setDate(next.getDate() + 1)
  }
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type PreviewData = {
  dates: string[]
  conflicts: string[]
}

type FormValues = {
  courtId: string
  playerId: string | null
  dayOfWeek: string
  timeStart: string
  timeEnd: string
  contactName: string
  contactPhone: string
  pricePerSessionCents: number | null
  startsOn: string
}

export function PreviewSlotsView({
  dates,
  conflicts,
  onBack,
  onConfirm,
  isConfirming,
}: {
  dates: string[]
  conflicts: string[]
  onBack: () => void
  onConfirm: () => void
  isConfirming: boolean
}) {
  const conflictSet = new Set(conflicts)
  const goodCount = dates.length - conflicts.length
  const noSlots = goodCount === 0

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-primary" />
            Vista previa de fechas
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Revisá los turnos recurrentes que se generarán para este abonado.
          </p>
        </div>
        <Badge variant={noSlots ? 'destructive' : conflicts.length > 0 ? 'warning' : 'success'}>
          {goodCount} turno{goodCount !== 1 ? 's' : ''} libre{goodCount !== 1 ? 's' : ''}
        </Badge>
      </div>

      {conflicts.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <span className="font-semibold">Atención:</span> Hay {conflicts.length} fecha
            {conflicts.length !== 1 ? 's' : ''} que ya{' '}
            {conflicts.length === 1 ? 'está ocupada' : 'están ocupadas'} por otra reserva.{' '}
            {conflicts.length === 1 ? 'Esa fecha se saltará' : 'Esas fechas se saltarán'} al crear
            el abonado.
          </div>
        </div>
      )}

      {noSlots && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          <span>
            No se creará ningún turno porque todas las fechas coinciden con reservas existentes.
            Elegí otro horario o cancha.
          </span>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto rounded-xl border border-border bg-background/50 p-2 space-y-1.5 divide-y divide-border/40">
        {dates.map((d) => {
          const isConflict = conflictSet.has(d)
          return (
            <div
              key={d}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/40 transition-colors"
            >
              <span className="text-sm font-medium text-foreground">{d}</span>
              {isConflict ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-400 bg-amber-500/15 px-2.5 py-0.5 rounded-full">
                  <AlertTriangle className="h-3 w-3" />
                  Ocupado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" />
                  Libre
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 flex-wrap pt-2 border-t border-border">
        <button
          type="button"
          onClick={onBack}
          disabled={isConfirming}
          className="h-11 rounded-xl border border-border px-5 text-sm font-semibold text-foreground hover:bg-accent transition-all active:scale-[0.98]"
        >
          Volver a editar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={noSlots || isConfirming}
          className="h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-2 active:scale-[0.98]"
        >
          {isConfirming ? (
            <>
              <TgBallSpinner size="xs" aria-hidden />
              Guardando abonado...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Confirmar y Crear Abonado
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default function AbonadoForm({
  courts,
  submitAction,
  previewAction,
  searchPlayersAction,
}: {
  courts: { id: string; name: string }[]
  submitAction: SubmitNewAbonadoAction
  previewAction: PreviewAbonadoSlotsAction
  searchPlayersAction: SearchAbonadoPlayersAction
}) {
  const [phase, setPhase] = useState<'form' | 'preview'>('form')
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [formValues, setFormValues] = useState<FormValues | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewing, startPreviewTransition] = useTransition()
  const [isConfirming, startConfirmTransition] = useTransition()

  // Form State
  const [courtId, setCourtId] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [startsOn, setStartsOn] = useState('')
  const [timeStart, setTimeStart] = useState('19:00')
  const [timeEnd, setTimeEnd] = useState('20:00')
  const [contactName, setContactName] = useState('')
  // El teléfono vivía SOLO en el FormData: al volver del preview tras un error de
  // validación el form se remonta y el campo salía vacío, mientras Nombre y Precio
  // conservaban su valor. El usuario corregía el nombre, reenviaba y se comía un
  // segundo error no relacionado ('Teléfono requerido') — 🟡 QA 2026-08-13.
  const [contactPhone, setContactPhone] = useState('')
  const [pricePerSessionCents, setPricePerSessionCents] = useState<number | null>(null)

  // H124: autocomplete de jugador registrado sobre el campo Cliente — mismo
  // patrón que BookingFormModal (searchPlayersAction debounced). Elegir un
  // resultado vincula playerId Y pisa contactName con el nombre real; seguir
  // tipeando después de elegir desvincula (mismo comportamiento que Booking).
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerResults, setPlayerResults] = useState<PlayerSearchResult[]>([])
  const [playerSearchOpen, setPlayerSearchOpen] = useState(false)
  const playerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (playerDebounceRef.current) clearTimeout(playerDebounceRef.current)
    }
  }, [])

  function handleContactNameChange(next: string) {
    setContactName(next)
    setPlayerId(null)
    if (playerDebounceRef.current) clearTimeout(playerDebounceRef.current)
    const q = next.trim()
    if (q.length < 2) {
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
    setContactName(player.name)
    setPlayerResults([])
    setPlayerSearchOpen(false)
  }

  function clearPlayer() {
    setPlayerId(null)
  }

  const courtOptions: ComboboxOption[] = useMemo(
    () => courts.map((c) => ({ value: c.id, label: c.name })),
    [courts],
  )

  const selectedCourtName = useMemo(() => {
    return courts.find((c) => c.id === courtId)?.name || 'Sin seleccionar'
  }, [courts, courtId])

  const selectedDayLabel = useMemo(() => {
    return DAYS.find((d) => d.value === dayOfWeek)?.label || 'Lunes'
  }, [dayOfWeek])

  const formattedStartsOn = useMemo(() => {
    if (!startsOn) return 'Sin seleccionar'
    const [y, m, d] = startsOn.split('-')
    return `${d}/${m}/${y}`
  }, [startsOn])

  const formattedPrice = useMemo(() => {
    if (!pricePerSessionCents || pricePerSessionCents <= 0) return '$ 0'
    return formatArs(pricePerSessionCents)
  }, [pricePerSessionCents])

  const formattedMonthly = useMemo(() => {
    if (!pricePerSessionCents || pricePerSessionCents <= 0) return '$ 0'
    return formatArs(pricePerSessionCents * 4)
  }, [pricePerSessionCents])

  function handlePreviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    const phoneFromForm = (fd.get('contactPhone') as string) ?? ''
    setContactPhone(phoneFromForm)

    const values: FormValues = {
      courtId,
      playerId,
      dayOfWeek,
      timeStart: (fd.get('timeStart') as string) || timeStart,
      timeEnd: normalizeMidnightEnd((fd.get('timeEnd') as string) || timeEnd),
      contactName,
      contactPhone: phoneFromForm,
      pricePerSessionCents,
      startsOn,
    }

    if (!values.courtId) {
      setPreviewError('Elegí una cancha.')
      return
    }
    if (!values.startsOn) {
      setPreviewError('Elegí la fecha de inicio.')
      return
    }
    if (!values.timeStart || !values.timeEnd) {
      setPreviewError('Elegí los horarios de inicio y fin.')
      return
    }
    if (values.pricePerSessionCents == null || values.pricePerSessionCents <= 0) {
      setPreviewError('Ingresá el precio por turno.')
      return
    }

    const input: PreviewAbonadoSlotsInput = {
      courtId: values.courtId,
      dayOfWeek: Number(values.dayOfWeek),
      timeStart: values.timeStart,
      timeEnd: values.timeEnd,
      startsOn: values.startsOn,
    }

    setPreviewError(null)
    startPreviewTransition(async () => {
      const result = await previewAction(input)
      if (!result.success) {
        setPreviewError(result.error)
        return
      }
      setFormValues(values)
      setPreviewData({ dates: result.dates, conflicts: result.conflicts })
      setPhase('preview')
    })
  }

  function handleConfirm() {
    if (!formValues) return
    const fd = new FormData()
    for (const [key, val] of Object.entries(formValues)) {
      // playerId es el único campo nullable: si no hay jugador vinculado no
      // se manda la clave (un '' no pasa z.guid().optional() del lado server).
      if (val == null) continue
      fd.set(key, String(val))
    }
    startConfirmTransition(async () => {
      const result = await submitAction(initial, fd)
      if (result.status === 'error') {
        setPhase('form')
        setPreviewData(null)
        setPreviewError(result.message)
      }
    })
  }

  if (phase === 'preview' && previewData) {
    return (
      <PreviewSlotsView
        dates={previewData.dates}
        conflicts={previewData.conflicts}
        onBack={() => {
          setPhase('form')
          setPreviewData(null)
        }}
        onConfirm={handleConfirm}
        isConfirming={isConfirming}
      />
    )
  }

  // text-base en mobile: < 16px dispara el zoom de iOS al enfocar (MASTER §3.x).
  const fieldBase =
    'h-11 w-full rounded-xl border border-input bg-background text-base md:text-sm text-foreground shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-ring hover:border-accent-foreground/20'

  return (
    <form onSubmit={handlePreviewSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Columna Izquierda / Central: Formulario */}
        <div className="lg:col-span-2 space-y-6">
          {/* Seccion 1: Turno Fijo */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-border">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Repeat className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Turno Fijo Recurrente</h2>
                <p className="text-xs text-muted-foreground">
                  Definí el día, horario y cancha de la reserva fija.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="courtId"
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5 text-primary" /> Cancha
                </label>
                <Combobox
                  id="courtId"
                  options={courtOptions}
                  value={courtId}
                  onChange={setCourtId}
                  placeholder="Elegí una cancha"
                  inputClassName={`${fieldBase} pl-3 pr-8`}
                  listboxLabel="Canchas disponibles"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="dayOfWeek"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-primary" /> Día semanal
                  </label>
                  <Combobox
                    id="dayOfWeek"
                    options={DAYS}
                    value={dayOfWeek}
                    onChange={(newDay) => {
                      setDayOfWeek(newDay)
                      const targetDay = Number(newDay)
                      if (!isNaN(targetDay)) {
                        setStartsOn((prev) => getNextMatchingDate(prev || null, targetDay))
                      }
                    }}
                    placeholder="Elegí un día"
                    inputClassName={`${fieldBase} pl-3 pr-8`}
                    listboxLabel="Días de la semana"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CalendarCheck2 className="h-3.5 w-3.5 text-primary" /> Empieza el
                  </label>
                  <DatePicker
                    id="startsOn"
                    value={startsOn}
                    onChange={setStartsOn}
                    // Un turno fijo son reservas a futuro: sin este piso se aceptaba una
                    // fecha pasada y se generaban reservas retroactivas que el trigger de
                    // 24h pasaba a 'completed' — partidos 'jugados' que nunca ocurrieron, y
                    // que ni pausar ni cancelar el abonado borran después (🟡 QA 2026-08-13).
                    min={todayART()}
                    allowedDayOfWeek={dayOfWeek !== '' ? Number(dayOfWeek) : undefined}
                    placeholder="Seleccionar fecha"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="timeStart"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                  >
                    <Clock className="h-3.5 w-3.5 text-primary" /> Hora inicio
                  </label>
                  <Combobox
                    id="timeStart"
                    options={TIME_OPTIONS}
                    value={timeStart}
                    onChange={(val) => {
                      setTimeStart(val)
                      setTimeEnd(addOneHour(val))
                    }}
                    placeholder="Seleccionar hora"
                    inputClassName={`${fieldBase} pl-10 pr-8 font-medium`}
                    leadingIcon={
                      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
                    }
                    listboxLabel="Horario de inicio"
                  />
                  <input type="hidden" name="timeStart" value={timeStart} />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="timeEnd"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                  >
                    <Clock className="h-3.5 w-3.5 text-primary" /> Hora fin
                  </label>
                  <Combobox
                    id="timeEnd"
                    options={TIME_OPTIONS}
                    value={timeEnd}
                    onChange={setTimeEnd}
                    placeholder="Seleccionar hora"
                    inputClassName={`${fieldBase} pl-10 pr-8 font-medium`}
                    leadingIcon={
                      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
                    }
                    listboxLabel="Horario de fin"
                  />
                  <input type="hidden" name="timeEnd" value={timeEnd} />
                </div>
              </div>
            </div>
          </div>

          {/* Seccion 2: Cliente y Precio */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-border">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Cliente y tarifa</h2>
                <p className="text-xs text-muted-foreground">
                  Datos de contacto y tarifa por sesión.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="relative space-y-1.5">
                  {/* F-021: era el único campo del form sin label asociada — un
                      lector de pantalla anunciaba "Nombre y apellido, requerido"
                      sin decir de quién. `htmlFor`/`id` como los otros seis. */}
                  <label
                    htmlFor="contactName"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                  >
                    <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Cliente
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
                    <input
                      id="contactName"
                      name="contactName"
                      required
                      autoComplete="off"
                      value={contactName}
                      onChange={(e) => handleContactNameChange(e.target.value)}
                      onFocus={() => {
                        if (playerResults.length > 0) setPlayerSearchOpen(true)
                      }}
                      onBlur={() => {
                        // Delay para que el mousedown de la opción llegue a disparar antes.
                        setTimeout(() => setPlayerSearchOpen(false), 150)
                      }}
                      placeholder="Nombre y apellido"
                      // H124: mismo tratamiento a11y que el autocomplete de BookingFormModal
                      // (role=combobox — aria-expanded/aria-autocomplete no valen en un
                      // textbox pelado, axe: aria-allowed-attr).
                      role="combobox"
                      aria-expanded={playerSearchOpen}
                      aria-autocomplete="list"
                      aria-controls={
                        playerSearchOpen && playerResults.length > 0
                          ? 'abonadoPlayerSearchResults'
                          : undefined
                      }
                      className={`${fieldBase} pl-10 pr-3`}
                    />
                  </div>
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
                      id="abonadoPlayerSearchResults"
                      role="listbox"
                      aria-label="Jugadores encontrados"
                      className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border/90 bg-popover text-popover-foreground shadow-xl backdrop-blur-xl p-1 space-y-0.5"
                    >
                      {playerResults.map((p) => (
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

                <PhoneInput
                  id="contactPhone"
                  name="contactPhone"
                  label="Teléfono"
                  defaultValue={contactPhone}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="pricePerSessionCents"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                  >
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />{' '}
                    Precio por turno (pesos)
                  </label>
                  <MoneyInput
                    id="pricePerSessionCents"
                    valueCents={pricePerSessionCents}
                    onValueChange={setPricePerSessionCents}
                    placeholder="Ej: 25.000"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {previewError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-700 dark:text-red-300"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{previewError}</span>
            </div>
          )}
        </div>

        {/* Columna Derecha: Tarjeta de Resumen en Vivo (Desktop Sidebar) */}
        <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Resumen de Suscripción
              </h3>
              <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                Recurrente
              </Badge>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> Cancha
                </span>
                <span className="font-semibold text-foreground truncate max-w-[130px]">
                  {selectedCourtName}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5 text-primary" /> Frecuencia
                </span>
                <span className="font-semibold text-foreground">
                  {pluralizeDayLabel(selectedDayLabel)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" /> Horario
                </span>
                <span className="font-semibold text-foreground">
                  {timeStart} a {timeEnd} hs
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CalendarCheck2 className="h-3.5 w-3.5 text-primary" /> Inicia
                </span>
                <span className="font-semibold text-foreground">{formattedStartsOn}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Cliente
                </span>
                <span className="font-semibold text-foreground truncate max-w-[130px]">
                  {contactName || 'Sin especificar'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />{' '}
                  Tarifa / turno
                </span>
                <span className="font-bold text-foreground text-sm">{formattedPrice}</span>
              </div>

              <div className="rounded-xl bg-accent/40 p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Estimación mensual (~4 turnos):</span>
                  <span className="font-bold text-emerald-800 dark:text-emerald-400 text-sm">
                    {formattedMonthly}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Al continuar, se verificará la disponibilidad para generar los turnos.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPreviewing}
              className="w-full h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {isPreviewing ? (
                <>
                  <TgBallSpinner size="xs" aria-hidden />
                  Procesando...
                </>
              ) : (
                <>
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
