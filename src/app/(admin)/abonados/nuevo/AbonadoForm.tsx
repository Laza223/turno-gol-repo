'use client'

import { useTransition, useState } from 'react'
import { submitNewAbonado, previewAbonadoSlotsAction, type NewAbonadoState, type PreviewAbonadoSlotsInput } from './actions'
import { Badge } from '@/components/ui/badge'

const DAYS = [
  { value: '1', label: 'Lunes' }, { value: '2', label: 'Martes' }, { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' }, { value: '5', label: 'Viernes' }, { value: '6', label: 'Sábado' }, { value: '0', label: 'Domingo' },
]
const initial: NewAbonadoState = { status: 'idle' }
const field = 'h-10 w-full rounded-lg border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
const labelCls = 'space-y-1 text-sm block'
const labelSpan = 'font-medium text-foreground'

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
  monthlyPrice: string
  startsOn: string
  paymentMethod: string
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
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Fechas del turno fijo</h2>
      <ul className="divide-y divide-slate-100">
        {dates.map((d) => {
          const isConflict = conflictSet.has(d)
          return (
            <li key={d} className="flex items-center justify-between py-2">
              <span className="text-sm text-foreground">{d}</span>
              {isConflict
                ? <Badge variant="warning">Ocupado</Badge>
                : <Badge variant="success">Libre</Badge>
              }
            </li>
          )
        })}
      </ul>
      <p className="text-sm text-muted-foreground">
        Se crearán {goodCount} turno{goodCount !== 1 ? 's' : ''}.
        {conflicts.length > 0 &&
          (conflicts.length === 1
            ? ' 1 fecha ya está ocupada y se va a saltar.'
            : ` ${conflicts.length} fechas ya están ocupadas y se van a saltar.`)}
      </p>
      {noSlots && (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
          No se va a crear ningún turno: todas las fechas están ocupadas. Revisá el día y el horario elegidos.
        </p>
      )}
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="h-10 rounded-lg border border-border px-5 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
        >
          Volver a editar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={noSlots || isConfirming}
          className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          {isConfirming ? 'Guardando…' : 'Crear abonado'}
        </button>
      </div>
    </div>
  )
}

export default function AbonadoForm({ courts }: { courts: { id: string; name: string }[] }) {
  const [phase, setPhase] = useState<'form' | 'preview'>('form')
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [formValues, setFormValues] = useState<FormValues | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewing, startPreviewTransition] = useTransition()
  const [isConfirming, startConfirmTransition] = useTransition()

  function handlePreviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    const values: FormValues = {
      courtId: fd.get('courtId') as string,
      dayOfWeek: fd.get('dayOfWeek') as string,
      timeStart: fd.get('timeStart') as string,
      timeEnd: fd.get('timeEnd') as string,
      contactName: fd.get('contactName') as string,
      contactPhone: fd.get('contactPhone') as string,
      pricePerSession: fd.get('pricePerSession') as string,
      monthlyPrice: fd.get('monthlyPrice') as string,
      startsOn: fd.get('startsOn') as string,
      paymentMethod: (fd.get('paymentMethod') as string) || 'cash',
      notes: (fd.get('notes') as string) || '',
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
      const result = await previewAbonadoSlotsAction(input)
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
      const result = await submitNewAbonado(initial, fd)
      if (result.status === 'error') {
        setPhase('form')
        setPreviewData(null)
        setPreviewError(result.message)
      }
      // On success, submitNewAbonado calls redirect('/abonados'), so no explicit state update needed
    })
  }

  if (phase === 'preview' && previewData) {
    return (
      <PreviewSlotsView
        dates={previewData.dates}
        conflicts={previewData.conflicts}
        onBack={() => { setPhase('form'); setPreviewData(null) }}
        onConfirm={handleConfirm}
        isConfirming={isConfirming}
      />
    )
  }

  return (
    <form onSubmit={handlePreviewSubmit} className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-foreground">Turno fijo</legend>
          <label className={labelCls}>
            <span className={labelSpan}>Cancha</span>
            <select name="courtId" required className={field} defaultValue="">
              <option value="" disabled>Elegí una cancha</option>
              {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={labelSpan}>Día de la semana</span>
              <select name="dayOfWeek" required className={field} defaultValue="1">
                {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label className={labelCls}><span className={labelSpan}>Empieza el</span><input name="startsOn" type="date" required className={field} /></label>
            <label className={labelCls}><span className={labelSpan}>Hora de inicio</span><input name="timeStart" type="time" required className={field} /></label>
            <label className={labelCls}><span className={labelSpan}>Hora de fin</span><input name="timeEnd" type="time" required className={field} /></label>
          </div>
        </fieldset>

        <div className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground">Cliente</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={labelCls}><span className={labelSpan}>Nombre y apellido</span><input name="contactName" required className={field} /></label>
              <label className={labelCls}><span className={labelSpan}>Teléfono</span><input name="contactPhone" required className={field} /></label>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground">Precio y pago</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={labelCls}><span className={labelSpan}>Precio por turno (en pesos)</span><input name="pricePerSession" type="number" min="0" step="0.01" inputMode="decimal" autoComplete="off" required placeholder="Ej: 25000" className={field} /></label>
              <label className={labelCls}>
                <span className={labelSpan}>Método de pago</span>
                <select name="paymentMethod" className={field} defaultValue="cash">
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </label>
            </div>
            <label className={labelCls}>
              <span className={labelSpan}>Precio mensual (en pesos)</span>
              <input name="monthlyPrice" type="number" min="0" step="0.01" inputMode="decimal" autoComplete="off" required placeholder="Ej: 100000" className={field} />
              <span className="block text-xs font-normal text-muted-foreground">
                La cuota que el abonado paga por mes por su turno fijo. Es el monto que vas a cobrarle cada mes.
              </span>
            </label>
          </fieldset>
        </div>
      </div>
      <label className={labelCls}><span className={labelSpan}>Notas (opcional)</span><textarea name="notes" rows={2} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" /></label>
      {previewError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">{previewError}</p>
      )}
      <button
        type="submit"
        disabled={isPreviewing}
        className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
      >
        {isPreviewing ? 'Cargando…' : 'Ver fechas del turno'}
      </button>
    </form>
  )
}
