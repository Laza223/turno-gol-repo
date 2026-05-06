'use client'

import { useState, useTransition } from 'react'
import type { CourtRow, PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { createCourtAction, updateCourtAction } from '../actions'

const SURFACE_OPTIONS = [
  { value: 'synthetic_grass', label: 'Césped sintético' },
  { value: 'natural_grass', label: 'Césped natural' },
  { value: 'cement', label: 'Cemento' },
  { value: 'indoor', label: 'Indoor' },
] as const

const CAPACITY_OPTIONS = [5, 7, 8, 9, 11] as const

const DAY_OPTIONS = [
  { key: 'mon', label: 'L' },
  { key: 'tue', label: 'M' },
  { key: 'wed', label: 'X' },
  { key: 'thu', label: 'J' },
  { key: 'fri', label: 'V' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'D' },
] as const

type DayKey = (typeof DAY_OPTIONS)[number]['key']

const DEFAULT_RULES: PricingRule[] = [
  {
    days: ['mon', 'tue', 'wed', 'thu'],
    from: '08:00',
    to: '18:00',
    prices: { '60': 800000, '120': 1500000 },
  },
  {
    days: ['mon', 'tue', 'wed', 'thu'],
    from: '18:00',
    to: '23:00',
    prices: { '60': 1200000, '120': 2300000 },
  },
  {
    days: ['fri', 'sat', 'sun'],
    from: '08:00',
    to: '23:00',
    prices: { '60': 1500000, '120': 2900000 },
  },
]

type Props = {
  court: CourtRow | null
  openingHours: OpeningHours
  onSaved: (court: CourtRow) => void
  onCancel: () => void
}

export function CourtForm({ court, onSaved, onCancel }: Props) {
  const isEdit = court !== null
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(court?.name ?? '')
  const [surfaceType, setSurfaceType] = useState<string>(court?.surfaceType ?? 'synthetic_grass')
  const [capacity, setCapacity] = useState<number>(court?.capacity ?? 10)
  const [rules, setRules] = useState<PricingRule[]>(
    court?.pricing.rules ?? DEFAULT_RULES,
  )

  function addRule() {
    setRules((prev) => [
      ...prev,
      { days: ['mon'], from: '08:00', to: '18:00', prices: { '60': 800000, '120': 1500000 } },
    ])
  }

  function removeRule(idx: number) {
    setRules((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateRuleField<K extends keyof PricingRule>(
    idx: number,
    field: K,
    value: PricingRule[K],
  ) {
    setRules((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    )
  }

  function toggleRuleDay(idx: number, day: DayKey) {
    setRules((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r
        const days = r.days.includes(day)
          ? r.days.filter((d) => d !== day)
          : [...r.days, day]
        return { ...r, days }
      }),
    )
  }

  function updateRulePrice(idx: number, duration: '60' | '120', cents: number) {
    setRules((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, prices: { ...r.prices, [duration]: cents } } : r,
      ),
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('pricing', JSON.stringify({ rules }))

    startTransition(async () => {
      const result = isEdit
        ? await updateCourtAction(court.id, formData)
        : await createCourtAction(formData)

      if (!result.success) {
        setError(result.error)
        return
      }
      // Reload page data by triggering a navigation refresh — parent handles via revalidatePath
      // For now signal parent with a stub row so list updates optimistically
      onSaved({
        ...(court ?? {
          id: result.courtId ?? '',
          tenantId: '',
          photos: [],
          createdAt: new Date(),
        }),
        name,
        surfaceType,
        capacity,
        status: court?.status ?? 'online',
        description: court?.description ?? null,
        pricing: { rules },
        updatedAt: new Date(),
      } as CourtRow)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {isEdit ? 'Editar cancha' : 'Nueva cancha'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>

      {/* Basic fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Cancha 1"
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Superficie <span className="text-red-500">*</span>
          </label>
          <select
            name="surfaceType"
            value={surfaceType}
            onChange={(e) => setSurfaceType(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {SURFACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Capacidad <span className="text-red-500">*</span>
          </label>
          <select
            name="capacity"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {CAPACITY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c} jugadores
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pricing rules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Precios por franja horaria</h3>
          <button
            type="button"
            onClick={addRule}
            className="text-xs text-emerald-700 hover:text-emerald-800 font-medium"
          >
            + Agregar franja
          </button>
        </div>

        {rules.map((rule, idx) => (
          <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-3">
            {/* Days */}
            <div className="flex items-center gap-1 flex-wrap">
              {DAY_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleRuleDay(idx, key)}
                  className={`w-8 h-8 rounded text-xs font-medium transition-colors duration-150 ${
                    rule.days.includes(key)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Time range + prices */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Desde</label>
                <input
                  type="time"
                  value={rule.from}
                  onChange={(e) => updateRuleField(idx, 'from', e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
                <input
                  type="time"
                  value={rule.to === '00:00' ? '00:00' : rule.to}
                  onChange={(e) => updateRuleField(idx, 'to', e.target.value || '00:00')}
                  className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">60 min (ARS)</label>
                <input
                  type="number"
                  value={Math.round(rule.prices['60'] / 100)}
                  onChange={(e) => updateRulePrice(idx, '60', Number(e.target.value) * 100)}
                  min={0}
                  step={100}
                  className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">120 min (ARS)</label>
                <input
                  type="number"
                  value={Math.round(rule.prices['120'] / 100)}
                  onChange={(e) => updateRulePrice(idx, '120', Number(e.target.value) * 100)}
                  min={0}
                  step={100}
                  className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {rules.length > 1 && (
              <button
                type="button"
                onClick={() => removeRule(idx)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Eliminar franja
              </button>
            )}
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          Los precios se ingresan en pesos argentinos (se almacenan en centavos internamente).
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
      >
        {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cancha'}
      </button>
    </form>
  )
}
