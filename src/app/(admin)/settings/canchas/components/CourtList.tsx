'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { LayoutGrid, Trophy } from 'lucide-react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { CourtActionResult, CourtDeactivationImpactResult } from '../actions'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/admin/PageHeader'
import { CourtStatusBadge } from './status-visual'
import type {
  CreateCourtAction,
  UpdateCourtAction,
  UploadCourtPhotoAction,
  RemoveCourtPhotoAction,
  ReorderCourtPhotosAction,
} from './CourtForm'

/**
 * Las 2 Server Actions propias de esta lista llegan por PROP, mismo motivo
 * que CourtForm (ver su comentario): '../actions' es `'use server'`.
 */
type ToggleCourtStatusAction = (
  courtId: string,
  status: 'online' | 'offline',
) => Promise<CourtActionResult>
type GetCourtDeactivationImpactAction = (
  courtId: string,
) => Promise<CourtDeactivationImpactResult>

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
  tenantName: string
  toggleStatusAction: ToggleCourtStatusAction
  getDeactivationImpactAction: GetCourtDeactivationImpactAction
  createAction: CreateCourtAction
  updateAction: UpdateCourtAction
  uploadPhotoAction: UploadCourtPhotoAction
  removePhotoAction: RemoveCourtPhotoAction
  reorderPhotosAction: ReorderCourtPhotosAction
}

export function CourtList({
  initialCourts,
  openingHours,
  isAdmin,
  tenantName,
  toggleStatusAction,
  getDeactivationImpactAction,
  createAction,
  updateAction,
  uploadPhotoAction,
  removePhotoAction,
  reorderPhotosAction,
}: Props) {
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

  const totalWord = courts.length === 1 ? '1 cancha' : `${courts.length} canchas`

  const header = (
    <PageHeader
      title="Canchas"
      subtitle={`${totalWord} · ${tenantName}`}
      icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
      actions={
        // El CTA se oculta con el form abierto (mismo comportamiento previo: no
        // se podía disparar "+ Nueva cancha" mientras ya se estaba creando/
        // editando una cancha). Texto con el "+" literal sin cambios: fijado
        // por e2e canchas-crud (`getByRole('button', { name: '+ Nueva cancha' })`).
        isAdmin && !showForm ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-primary/90 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            + Nueva cancha
          </button>
        ) : undefined
      }
    />
  )

  if (showForm) {
    return (
      <div className="space-y-6">
        {header}
        <CourtForm
          court={editingCourt}
          openingHours={openingHours}
          otherCourts={courts
            .filter((c) => c.id !== editingCourt?.id)
            .map((c) => ({ id: c.id, name: c.name, rules: c.pricing.rules }))}
          onSaved={handleCourtSaved}
          onCancel={closeForm}
          createAction={createAction}
          updateAction={updateAction}
          uploadPhotoAction={uploadPhotoAction}
          removePhotoAction={removePhotoAction}
          reorderPhotosAction={reorderPhotosAction}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

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
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
              >
                + Nueva cancha
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {courts.map((court) => (
            <CourtCard
              key={court.id}
              court={court}
              onEdit={openEdit}
              isAdmin={isAdmin}
              toggleStatusAction={toggleStatusAction}
              getDeactivationImpactAction={getDeactivationImpactAction}
            />
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
  toggleStatusAction,
  getDeactivationImpactAction,
}: {
  court: CourtRow
  onEdit: (court: CourtRow) => void
  isAdmin: boolean
  toggleStatusAction: ToggleCourtStatusAction
  getDeactivationImpactAction: GetCourtDeactivationImpactAction
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
      const res = await toggleStatusAction(court.id, 'online')
      if (!res.success) {
        setCurrentStatus(prev)
        toast({ title: 'No se pudo activar', description: res.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Cancha activada', variant: 'success' })
    })
  }

  async function openDeactivate() {
    setLoadingImpact(true)
    const res = await getDeactivationImpactAction(court.id)
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
    const res = await toggleStatusAction(court.id, 'offline')
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
    warningLines.push(`Hay ${impact.activeAbonados} turno(s) fijo(s) activo(s) en esta cancha.`)

  return (
    // rounded-lg (no rounded-xl pese a §4.2/card-premium): e2e canchas-crud
    // ancla las 3 cards vía `div.rounded-lg` (ver canchas.md §7 deuda declarada).
    <div className="card-premium rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{court.name}</span>
          <CourtStatusBadge status={currentStatus} />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {SURFACE_LABELS[court.surfaceType] ?? court.surfaceType} · {court.capacity} jugadores
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && (
          <button
            type="button"
            onClick={() => onEdit(court)}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 font-medium min-h-11 md:min-h-9 px-2 py-1 rounded-md hover:bg-accent transition-colors duration-150"
          >
            Editar
          </button>
        )}
        <button
          type="button"
          onClick={handleToggleClick}
          disabled={isPending || loadingImpact}
          className="text-xs border border-border min-h-11 md:min-h-9 px-2 py-1 rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
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
