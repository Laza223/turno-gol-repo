'use client'

import { useState, useTransition } from 'react'
import { updateScheduleAction } from '../actions'
import type { OpeningHours, OpeningHoursDay } from '@/modules/tenants/tenant.types'

const DAYS = [
  { key: 'mon', label: 'Lunes' },
  { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' },
  { key: 'fri', label: 'Viernes' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
] as const

type DayKey = (typeof DAYS)[number]['key']

interface StepScheduleProps {
  openingHours: OpeningHours
}

export function StepSchedule({ openingHours }: StepScheduleProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [hours, setHours] = useState<OpeningHours>(openingHours)

  function updateDay(
    day: DayKey,
    field: keyof OpeningHoursDay,
    value: string | boolean,
  ) {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateScheduleAction(hours)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Horarios</h2>
        <p className="text-sm text-slate-600 mt-1">Horarios de apertura</p>
      </div>

      <p className="text-sm text-slate-600">
        Valores pre-cargados. Editá solo lo que sea diferente para tu complejo.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4 font-medium">Día</th>
                <th className="pb-2 pr-4 font-medium">Apertura</th>
                <th className="pb-2 pr-4 font-medium">Cierre</th>
                <th className="pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map(({ key, label }) => {
                const day = hours[key]
                const isClosed = day.closed === true
                return (
                  <tr key={key} className={isClosed ? 'opacity-50' : ''}>
                    <td className="py-2 pr-4 font-medium">{label}</td>
                    <td className="py-2 pr-4">
                      <input
                        type="time"
                        value={day.open}
                        onChange={(e) => updateDay(key, 'open', e.target.value)}
                        disabled={isClosed}
                        className="border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="time"
                        value={day.close}
                        onChange={(e) => updateDay(key, 'close', e.target.value)}
                        disabled={isClosed}
                        className="border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </td>
                    <td className="py-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!isClosed}
                          onChange={(e) => updateDay(key, 'closed', !e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-xs text-slate-600">
                          {isClosed ? 'Cerrado' : 'Abierto'}
                        </span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
        >
          {isPending ? 'Guardando...' : 'Continuar →'}
        </button>
      </form>
    </div>
  )
}
