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
        <h2 className="text-xl font-semibold">Horarios</h2>
        <p className="text-sm text-gray-500 mt-1">Paso 3 de 4 — Horarios de apertura</p>
      </div>

      <p className="text-sm text-gray-600">
        Valores pre-cargados. Editá solo lo que sea diferente para tu complejo.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
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
                        className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="time"
                        value={day.close}
                        onChange={(e) => updateDay(key, 'close', e.target.value)}
                        disabled={isClosed}
                        className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
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
                        <span className="text-xs text-gray-600">
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

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Guardando...' : 'Continuar →'}
        </button>
      </form>
    </div>
  )
}
