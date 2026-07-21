'use client'

import { useTransition, useState, useMemo } from 'react'
import type {
  NewAbonadoState,
  PreviewAbonadoSlotsInput,
  PreviewAbonadoSlotsResult,
} from './actions'
import { Badge } from '@/components/ui/badge'
import { PhoneInput } from '@/components/ui/phone-input'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import DatePicker from '@/components/ui/date-picker'
import { formatArs } from '@/lib/format'
import {
  Clock,
  CalendarDays,
  MapPin,
  User,
  DollarSign,
  FileText,
  Repeat,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  CalendarCheck2,
  ArrowRight,
  Sparkles,
} from 'lucide-react'

export type SubmitNewAbonadoAction = (
  prevState: NewAbonadoState,
  formData: FormData,
) => Promise<NewAbonadoState>

export type PreviewAbonadoSlotsAction = (
  input: PreviewAbonadoSlotsInput,
) => Promise<PreviewAbonadoSlotsResult>

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

type PreviewData = {
  dates: string[]
  conflicts: string[]
}

type FormValues = {
  courtId: string
  dayOfWeek: string
  timeStart: string
  timeEnd: string
  contactName: string
  contactPhone: string
  pricePerSession: string
  startsOn: string
  notes: string
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
            <span className="font-semibold">Atención:</span> Hay {conflicts.length} fecha{conflicts.length !== 1 ? 's' : ''} que ya {conflicts.length === 1 ? 'está ocupada' : 'están ocupadas'} por otra reserva. {conflicts.length === 1 ? 'Esa fecha se saltará' : 'Esas fechas se saltarán'} al crear el abonado.
          </div>
        </div>
      )}

      {noSlots && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          <span>No se creará ningún turno porque todas las fechas coinciden con reservas existentes. Elegí otro horario o cancha.</span>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto rounded-xl border border-border bg-background/50 p-2 space-y-1.5 divide-y divide-border/40">
        {dates.map((d) => {
          const isConflict = conflictSet.has(d)
          return (
            <div key={d} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/40 transition-colors">
              <span className="text-sm font-medium text-foreground">{d}</span>
              {isConflict ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/15 px-2.5 py-0.5 rounded-full">
                  <AlertTriangle className="h-3 w-3" />
                  Ocupado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full">
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
          className="h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2 active:scale-[0.98]"
        >
          {isConfirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
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
}: {
  courts: { id: string; name: string }[]
  submitAction: SubmitNewAbonadoAction
  previewAction: PreviewAbonadoSlotsAction
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
  const [pricePerSession, setPricePerSession] = useState('')

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
    const num = Number(pricePerSession)
    if (isNaN(num) || num <= 0) return '$ 0'
    return formatArs(Math.round(num * 100))
  }, [pricePerSession])

  const formattedMonthly = useMemo(() => {
    const num = Number(pricePerSession)
    if (isNaN(num) || num <= 0) return '$ 0'
    return formatArs(Math.round(num * 4 * 100))
  }, [pricePerSession])

  function handlePreviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    const values: FormValues = {
      courtId,
      dayOfWeek,
      timeStart: (fd.get('timeStart') as string) || timeStart,
      timeEnd: normalizeMidnightEnd((fd.get('timeEnd') as string) || timeEnd),
      contactName,
      contactPhone: fd.get('contactPhone') as string,
      pricePerSession,
      startsOn,
      notes: (fd.get('notes') as string) || '',
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
      fd.set(key, val)
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

  const fieldBase =
    'h-11 w-full rounded-xl border border-input bg-background text-sm text-foreground shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-ring hover:border-accent-foreground/20'

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
                <p className="text-xs text-muted-foreground">Definí el día, horario y cancha de la reserva fija.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
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
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" /> Día semanal
                  </label>
                  <Combobox
                    id="dayOfWeek"
                    options={DAYS}
                    value={dayOfWeek}
                    onChange={setDayOfWeek}
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
                    placeholder="Seleccionar fecha"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
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
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
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
                <h2 className="text-base font-semibold text-foreground">Cliente y Facturación</h2>
                <p className="text-xs text-muted-foreground">Datos de contacto y tarifa por sesión.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Cliente
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
                    <input
                      name="contactName"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Nombre y apellido"
                      className={`${fieldBase} pl-10 pr-3`}
                    />
                  </div>
                </div>

                <PhoneInput id="contactPhone" name="contactPhone" label="Teléfono" required />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Precio por turno (pesos)
                  </label>
                  <div className="relative">
                    <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
                    <input
                      name="pricePerSession"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      autoComplete="off"
                      required
                      value={pricePerSession}
                      onChange={(e) => setPricePerSession(e.target.value)}
                      placeholder="Ej: 25000"
                      className={`${fieldBase} pl-10 pr-3 font-semibold text-foreground`}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Notas (opcional)
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Observaciones internas sobre este abonado..."
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring hover:border-accent-foreground/20"
                />
              </div>
            </div>
          </div>

          {previewError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-700 dark:text-red-300">
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
                  {selectedDayLabel}s
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
                <span className="font-semibold text-foreground">
                  {formattedStartsOn}
                </span>
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
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Tarifa / turno
                </span>
                <span className="font-bold text-foreground text-sm">
                  {formattedPrice}
                </span>
              </div>

              <div className="rounded-xl bg-accent/40 p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Estimación mensual (~4 turnos):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {formattedMonthly}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
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
                  <Loader2 className="h-4 w-4 animate-spin" />
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
