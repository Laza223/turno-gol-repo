'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { submitNewAbonado, type NewAbonadoState } from './actions'

const DAYS = [
  { value: '1', label: 'Lunes' }, { value: '2', label: 'Martes' }, { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' }, { value: '5', label: 'Viernes' }, { value: '6', label: 'Sábado' }, { value: '0', label: 'Domingo' },
]
const initial: NewAbonadoState = { status: 'idle' }
const field = 'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
const labelCls = 'space-y-1 text-sm block'
const labelSpan = 'font-medium text-slate-900'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
      {pending ? 'Guardando…' : 'Crear abonado'}
    </button>
  )
}

export default function AbonadoForm({ courts }: { courts: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(submitNewAbonado, initial)
  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelSpan}>Cancha</span>
          <select name="courtId" required className={field} defaultValue="">
            <option value="" disabled>Elegí una cancha</option>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          <span className={labelSpan}>Día de la semana</span>
          <select name="dayOfWeek" required className={field} defaultValue="1">
            {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label className={labelCls}><span className={labelSpan}>Hora inicio</span><input name="timeStart" type="time" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Hora fin</span><input name="timeEnd" type="time" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Nombre de contacto</span><input name="contactName" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Teléfono</span><input name="contactPhone" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Precio por turno (ARS)</span><input name="pricePerSession" type="number" min="0" step="0.01" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Precio mensual (ARS)</span><input name="monthlyPrice" type="number" min="0" step="0.01" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Desde</span><input name="startsOn" type="date" required className={field} /></label>
        <label className={labelCls}>
          <span className={labelSpan}>Método de pago</span>
          <select name="paymentMethod" className={field} defaultValue="cash">
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </select>
        </label>
      </div>
      <label className={labelCls}><span className={labelSpan}>Notas (opcional)</span><textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" /></label>
      {state.status === 'error' && <p role="alert" className="text-xs text-red-600">{state.message}</p>}
      <Submit />
    </form>
  )
}
