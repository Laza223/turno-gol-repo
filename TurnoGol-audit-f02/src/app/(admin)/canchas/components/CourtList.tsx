'use client'

import { useState, useTransition } from 'react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { toggleCourtStatusAction } from '../actions'
import { CourtForm } from './CourtForm'

const SURFACE_LABELS: Record<string, string> = {
  synthetic_grass: 'Césped sintético',
  natural_grass: 'Césped natural',
  cement: 'Cemento',
  indoor: 'Indoor',
}

type Props = {
  initialCourts: CourtRow[]
  openingHours: OpeningHours
}

export function CourtList({ initialCourts, openingHours }: Props) {
  const [courts, setCourts] = useState<CourtRow[]>(initialCourts)
  const [showForm, setShowForm] = useState(false)
  const [editingCourt, setEditingCourt] = useState<CourtRow | null>(null)

  function handleCourtSaved(updatedCourt: CourtRow) {
    setCourts((prev) => {
      const idx = prev.findIndex((c) => c.id === updatedCourt.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updatedCourt
        return next
      }
      return [...prev, updatedCourt]
    })
    setShowForm(false)
    setEditingCourt(null)
  }

  function openCreate() {
    setEditingCourt(null)
    setShowForm(true)
  }

  function openEdit(court: CourtRow) {
    setEditingCourt(court)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingCourt(null)
  }

  if (showForm) {
    return (
      <CourtForm
        court={editingCourt}
        openingHours={openingHours}
        onSaved={handleCourtSaved}
        onCancel={closeForm}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-500 transition-colors duration-150"
        >
          + Nueva cancha
        </button>
      </div>

      {courts.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No tenés canchas todavía. Creá la primera para aparecer en búsquedas públicas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {courts.map((court) => (
            <CourtCard key={court.id} court={court} onEdit={openEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

function CourtCard({
  court,
  onEdit,
}: {
  court: CourtRow
  onEdit: (court: CourtRow) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [currentStatus, setCurrentStatus] = useState<'online' | 'offline'>(court.status)

  function handleToggle() {
    const next = currentStatus === 'online' ? 'offline' : 'online'
    startTransition(async () => {
      const result = await toggleCourtStatusAction(court.id, next)
      if (result.success) setCurrentStatus(next)
    })
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{court.name}</span>
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
              currentStatus === 'online'
                ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
                : 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200'
            }`}
          >
            {currentStatus === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {SURFACE_LABELS[court.surfaceType] ?? court.surfaceType} · {court.capacity} jugadores
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onEdit(court)}
          className="text-xs text-emerald-700 hover:text-emerald-800 font-medium px-2 py-1 rounded hover:bg-slate-50 transition-colors duration-150"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className="text-xs border border-slate-200 px-2 py-1 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
        >
          {isPending ? '...' : currentStatus === 'online' ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  )
}
