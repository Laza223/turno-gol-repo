'use client'

import { useState, useTransition } from 'react'
import type { CourtRow, PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { createCourtAction, updateCourtAction } from '../actions'
import { PricingGrid } from './PricingGrid'
import { Button } from '@/components/ui/button'

const SURFACE_OPTIONS = [
  { value: 'synthetic_grass', label: 'Césped sintético' },
  { value: 'natural_grass', label: 'Césped natural' },
  { value: 'cement', label: 'Cemento' },
  { value: 'tile', label: 'Baldosa' },
] as const

const CAPACITY_OPTIONS = [5, 7, 8, 9, 11] as const

const DEFAULT_RULES: PricingRule[] = [
  {
    days: ['mon', 'tue', 'wed', 'thu'],
    from: '08:00',
    to: '18:00',
    price: 800000,
  },
  {
    days: ['mon', 'tue', 'wed', 'thu'],
    from: '18:00',
    to: '23:00',
    price: 1200000,
  },
  {
    days: ['fri', 'sat', 'sun'],
    from: '08:00',
    to: '23:00',
    price: 1500000,
  },
]

type Props = {
  court: CourtRow | null
  openingHours: OpeningHours
  onSaved: (court: CourtRow) => void
  onCancel: () => void
}

export function CourtForm({ court, openingHours, onSaved, onCancel }: Props) {
  const isEdit = court !== null
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(court?.name ?? '')
  const [surfaceType, setSurfaceType] = useState<string>(court?.surfaceType ?? 'synthetic_grass')
  const [capacity, setCapacity] = useState<number>(court?.capacity ?? 5)
  const [rules, setRules] = useState<PricingRule[]>(court?.pricing.rules ?? DEFAULT_RULES)

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
    <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border shadow-sm p-6 space-y-6">
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
            className="w-full border rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
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
            className="w-full border rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
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
            className="w-full border rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {CAPACITY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c} jugadores
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pricing grid */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Precios por hora</h3>
          <p className="text-xs text-muted-foreground">
            Cargá el precio de cada turno. Los precios se ingresan en pesos (se guardan en centavos).
          </p>
        </div>

        <PricingGrid
          openingHours={openingHours}
          initialRules={court?.pricing.rules ?? DEFAULT_RULES}
          onChange={setRules}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button
        type="submit"
        isLoading={isPending}
        className="w-full h-11"
      >
        {isEdit ? 'Guardar cambios' : 'Crear cancha'}
      </Button>
    </form>
  )
}
