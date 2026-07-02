'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { LayoutGrid } from 'lucide-react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { toggleCourtStatusAction, getCourtDeactivationImpactAction } from '../actions'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'

// The deactivate confirmation pulls in the Radix AlertDialog; only needed once an
// admin clicks "Desactivar", so lazy-load and mount it on demand.
const ConfirmDialog = dynamic(
  () => import('@/components/ui/confirm-dialog').then((m) => m.ConfirmDialog),
  { ssr: false },
)

// The court editor (pricing-rules builder + opening-hours grid) is the heaviest
// chunk on this route but only renders after a "Nueva cancha"/"Editar" click.
// Code-split it so it never weighs down the initial Canchas paint.
const CourtForm = dynamic(() => import('./CourtForm').then((m) => m.CourtForm), {
  ssr: false,
  loading: () => (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando formulario…">
      <Skeleton className="h-9 w-48" aria-hidden />
      <Skeleton className="h-32 w-full" aria-hidden />
      <Skeleton className="h-48 w-full" aria-hidden />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-28" aria-hidden />
        <Skeleton className="h-10 w-28" aria-hidden />
      </div>
    </div>
  ),
})

const SURFACE_LABELS: Record<string, string> = {
  synthetic_grass: 'Césped sintético',
  natural_grass: 'Césped natural',
  cement: 'Cemento',
  tile: 'Baldosa',
}

type Props = {
  initialCourts: CourtRow[]
  openingHours: OpeningHours
  isAdmin: boolean
}

export function CourtList({ initialCourts, openingHours, isAdmin }: Props) {
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
        otherCourts={courts
          .filter((c) => c.id !== editingCourt?.id)
          .map((c) => ({ id: c.id, name: c.name, rules: c.pricing.rules }))}
        onSaved={handleCourtSaved}
        onCancel={closeForm}
      />
    )
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-500 transition-colors duration-150"
          >
            + Nueva cancha
          </button>
        </div>
      )}

      {courts.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Sin canchas todavía"
          description={
            isAdmin
              ? 'Creá la primera para aparecer en búsquedas públicas.'
              : 'Todavía no hay canchas cargadas. Pedile al administrador que cree la primera.'
          }
          action={
            isAdmin ? (
              <button
                type="button"
                onClick={openCreate}
                className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-500 transition-colors duration-150"
              >
                + Nueva cancha
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {courts.map((court) => (
            <CourtCard key={court.id} court={court} onEdit={openEdit} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  )
}

function CourtCard({
  court,
  onEdit,
  isAdmin,
}: {
  court: CourtRow
  onEdit: (court: CourtRow) => void
  isAdmin: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [currentStatus, setCurrentStatus] = useState<'online' | 'offline'>(court.status)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [impact, setImpact] = useState<{ futureBookings: number; activeAbonados: number } | null>(
    null,
  )
  const [loadingImpact, setLoadingImpact] = useState(false)

  function activate() {
    const prev = currentStatus
    setCurrentStatus('online')
    startTransition(async () => {
      const res = await toggleCourtStatusAction(court.id, 'online')
      if (!res.success) {
        setCurrentStatus(prev)
        toast({ title: 'No se pudo activar', description: res.error, variant: 'destructive' })
      }
    })
  }

  async function openDeactivate() {
    setLoadingImpact(true)
    const res = await getCourtDeactivationImpactAction(court.id)
    setLoadingImpact(false)
    if (!res.success) {
      // Fix #58: no abrir el dialog con datos falsos (0/0) — el admin podría
      // desactivar creyendo que no hay impacto cuando en realidad no se pudo verificar.
      toast({
        title: 'No se pudo verificar el impacto',
        description: res.error ?? 'Reintentá en unos segundos.',
        variant: 'destructive',
      })
      return
    }
    setImpact({ futureBookings: res.futureBookings, activeAbonados: res.activeAbonados })
    setConfirmOpen(true)
  }

  async function onConfirmDeactivate(): Promise<{ success: boolean; error?: string }> {
    const prev = currentStatus
    setCurrentStatus('offline')
    const res = await toggleCourtStatusAction(court.id, 'offline')
    if (!res.success) {
      setCurrentStatus(prev)
      return res
    }
    toast({ title: 'Cancha desactivada', variant: 'success' })
    return res
  }

  function handleToggleClick() {
    if (currentStatus === 'online') void openDeactivate()
    else activate()
  }

  const warningLines: string[] = []
  if (impact && impact.futureBookings > 0)
    warningLines.push(
      `Hay ${impact.futureBookings} reserva(s) futura(s) en esta cancha. Gestionalas antes (las existentes se mantienen hasta que las canceles).`,
    )
  if (impact && impact.activeAbonados > 0)
    warningLines.push(`Hay ${impact.activeAbonados} abonado(s) activo(s) en esta cancha.`)

  return (
    <div className="card-premium rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{court.name}</span>
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
              currentStatus === 'online'
                ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/20 dark:ring-green-500/30'
                : 'bg-muted text-muted-foreground ring-1 ring-inset ring-border'
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
        {isAdmin && (
          <button
            type="button"
            onClick={() => onEdit(court)}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 font-medium px-2 py-1 rounded hover:bg-accent transition-colors duration-150"
          >
            Editar
          </button>
        )}
        <button
          type="button"
          onClick={handleToggleClick}
          disabled={isPending || loadingImpact}
          className="text-xs border border-border px-2 py-1 rounded text-muted-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
        >
          {isPending || loadingImpact ? '…' : currentStatus === 'online' ? 'Desactivar' : 'Activar'}
        </button>
      </div>

      {confirmOpen && (
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Desactivar ${court.name}`}
        description={
          <div className="space-y-2">
            <p>Una cancha offline no recibe reservas nuevas.</p>
            {warningLines.map((l, i) => (
              <p key={i} className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
                {l}
              </p>
            ))}
          </div>
        }
        variant="destructive"
        confirmLabel="Desactivar"
        cancelLabel="Volver"
        onConfirm={onConfirmDeactivate}
      />
      )}
    </div>
  )
}
