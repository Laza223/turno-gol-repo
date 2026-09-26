'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { ImagePlus, LayoutGrid, Lock } from 'lucide-react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { CourtActionResult, CourtDeactivationImpactResult } from '../actions'
import {
  billingChangeMessage,
  billingChangeTitle,
  type BillingChangePreview,
} from '../billing-copy'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/admin/PageHeader'
import { cn } from '@/lib/utils'
import { COURT_STATUS_HINT, CourtStatusBadge } from './status-visual'
import { summarizePricing } from './price-setup/price-model'
import { PriceSummary } from './price-setup/PriceSummary'
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
 *
 * `confirmBillingChange`: prender una cancha por encima de las que se facturan
 * no se bloquea, pero tampoco se hace en silencio. La primera llamada vuelve
 * con `requiresBillingConfirmation` y sin tocar nada; la segunda, ya con el
 * dueño informado del monto, prende la cancha y agenda la suba.
 */
type ToggleCourtStatusAction = (
  courtId: string,
  status: 'online' | 'offline',
  confirmBillingChange?: boolean,
) => Promise<CourtActionResult>
type GetCourtDeactivationImpactAction = (courtId: string) => Promise<CourtDeactivationImpactResult>

// The pause confirmation pulls in the Radix AlertDialog; only needed once an
// admin clicks "Pausar", so lazy-load and mount it on demand.
const ConfirmDialog = dynamic(
  () => import('@/components/ui/confirm-dialog').then((m) => m.ConfirmDialog),
  { ssr: false },
)

// The court editor (price setup + hour-by-hour grid) is the heaviest chunk on
// this route but only renders after a "Nueva cancha"/"Editar" click. Code-split
// it so it never weighs down the initial Canchas paint.
const CourtForm = dynamic(() => import('./CourtForm').then((m) => m.CourtForm), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-3xl space-y-5" aria-busy="true" aria-label="Cargando la cancha…">
      <div className="space-y-2">
        <Skeleton className="h-5 w-20" aria-hidden />
        <Skeleton className="h-8 w-48" aria-hidden />
      </div>
      <Skeleton className="h-[28rem] w-full rounded-xl" aria-hidden />
    </div>
  ),
})

const SURFACE_LABELS: Record<string, string> = {
  synthetic_grass: 'Sintético',
  natural_grass: 'Césped natural',
  cement: 'Cemento',
  tile: 'Baldosa',
}

type Props = {
  initialCourts: CourtRow[]
  /** Solo para telemetría: el evento de "me trabé cargando precios" tiene que
   *  decir QUÉ complejo se trabó, y en el cliente no hay otra forma de saberlo
   *  (una cancha nueva todavía no existe, así que no lo trae en `court`). */
  tenantId: string
  openingHours: OpeningHours
  closesNextDay: boolean
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

type Editing = { court: CourtRow | null; section?: 'photos' }

/** MASTER §12 CHK-admin: lo que el rol no puede usar se ve con candado, nunca desaparece. */
function LockedAction({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground',
        className,
      )}
      title="Solo el dueño puede hacerlo"
    >
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
      <span className="sr-only">— solo el dueño puede hacerlo</span>
    </span>
  )
}

export function CourtList({
  initialCourts,
  tenantId,
  openingHours,
  closesNextDay,
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
  const [editing, setEditing] = useState<Editing | null>(null)

  function handleCourtSaved(updatedCourt: CourtRow) {
    const wasEdit = editing?.court != null
    setCourts((prev) => {
      const idx = prev.findIndex((c) => c.id === updatedCourt.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updatedCourt
        return next
      }
      return [...prev, updatedCourt]
    })
    setEditing(null)
    toast({ title: wasEdit ? 'Cancha actualizada' : 'Cancha creada', variant: 'success' })
  }

  // Las fotos se guardan en la DB apenas se eligen, aunque después se cancele el
  // form: sin llevarlas a `courts` la lista sigue marcando "sin foto" y "Editar"
  // reabre con la lista vieja.
  function closeForm(photos?: string[]) {
    const editedId = editing?.court?.id
    if (editedId && photos) {
      setCourts((prev) => prev.map((c) => (c.id === editedId ? { ...c, photos } : c)))
    }
    setEditing(null)
  }

  if (editing) {
    return (
      <CourtForm
        court={editing.court}
        tenantId={tenantId}
        openingHours={openingHours}
        closesNextDay={closesNextDay}
        otherCourts={courts
          .filter((c) => c.id !== editing.court?.id)
          .map((c) => ({ id: c.id, name: c.name, rules: c.pricing.rules }))}
        onSaved={handleCourtSaved}
        onCancel={closeForm}
        initialSection={editing.section}
        createAction={createAction}
        updateAction={updateAction}
        uploadPhotoAction={uploadPhotoAction}
        removePhotoAction={removePhotoAction}
        reorderPhotosAction={reorderPhotosAction}
      />
    )
  }

  // Texto con el "+" literal sin cambios: fijado por e2e canchas-crud
  // (`getByRole('button', { name: '+ Nueva cancha' })`).
  const newCourt = isAdmin ? (
    <Button onClick={() => setEditing({ court: null })}>+ Nueva cancha</Button>
  ) : (
    <LockedAction label="+ Nueva cancha" className="h-11 md:h-10" />
  )

  return (
    <div className="space-y-5">
      <PageHeader
        variant="plain"
        title="Canchas"
        subtitle={`${courts.length === 1 ? '1 cancha' : `${courts.length} canchas`} · ${tenantName}`}
        actions={newCourt}
      />

      {courts.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Sin canchas todavía"
          description={
            isAdmin
              ? 'Creá la primera para aparecer en búsquedas públicas.'
              : 'Todavía no hay canchas cargadas. Pedile al administrador que cree la primera.'
          }
          action={newCourt}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {/* Encabezado de columnas: solo desde lg, donde cada cancha es una fila. */}
          <div
            aria-hidden="true"
            className="hidden border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:gap-6"
          >
            <span>Cancha</span>
            <span>Precio del turno</span>
            <span>En tu perfil</span>
            <span className="w-44" />
          </div>
          <ul className="divide-y divide-border">
            {courts.map((court) => (
              <CourtItem
                key={court.id}
                court={court}
                openingHours={openingHours}
                closesNextDay={closesNextDay}
                isAdmin={isAdmin}
                onEdit={(section) => setEditing({ court, section })}
                toggleStatusAction={toggleStatusAction}
                getDeactivationImpactAction={getDeactivationImpactAction}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Primera foto de la cancha, o el hueco "Sin foto" que la agrega (solo el dueño). */
function CourtThumb({
  court,
  onAdd,
  offline,
}: {
  court: CourtRow
  onAdd?: () => void
  offline: boolean
}) {
  const box = 'h-12 w-16 lg:h-10 lg:w-14'
  const photo = court.photos[0]
  if (photo) {
    return (
      <span
        className={cn(
          'relative shrink-0 overflow-hidden rounded-md bg-muted',
          box,
          offline && 'opacity-60 grayscale',
        )}
      >
        <Image src={photo} alt="" fill sizes="64px" className="object-cover" />
      </span>
    )
  }
  const cls = cn(
    'flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border text-muted-foreground',
    box,
  )
  const inner = (
    <>
      <ImagePlus className="h-4 w-4" aria-hidden="true" />
      <span className="text-[11px] font-medium leading-none lg:sr-only">Sin foto</span>
    </>
  )
  return onAdd ? (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Agregar foto a ${court.name}`}
      title="Sin foto: agregala"
      className={cn(
        cls,
        'transition-colors hover:border-primary hover:text-emerald-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-emerald-400',
      )}
    >
      {inner}
    </button>
  ) : (
    <span className={cls} title="Sin foto">
      {inner}
    </span>
  )
}

function CourtItem({
  court,
  openingHours,
  closesNextDay,
  isAdmin,
  onEdit,
  toggleStatusAction,
  getDeactivationImpactAction,
}: {
  court: CourtRow
  openingHours: OpeningHours
  closesNextDay: boolean
  isAdmin: boolean
  onEdit: (section?: 'photos') => void
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
  // Aviso de "prender esta cancha te sube la cuota". Es un diálogo aparte del
  // de pausar: son dos decisiones distintas y el de pausar es destructivo,
  // este no.
  const [billingPreview, setBillingPreview] = useState<BillingChangePreview | null>(null)

  // activate/deactivateDirect también son el "Deshacer" de un toast, o sea un
  // closure de un render viejo: el revert NO puede salir de `currentStatus`
  // capturado ahí (sería el estado de antes del toggle anterior). Cada una se
  // llama solo desde el estado opuesto, así que el revert es ese literal. El
  // set va en startTransition porque corre después del await (React 19).
  function activate() {
    setCurrentStatus('online')
    startTransition(async () => {
      const res = await toggleStatusAction(court.id, 'online')
      if (!res.success) {
        startTransition(() => setCurrentStatus('offline'))
        if (res.requiresBillingConfirmation) {
          // No es un error: la cancha sigue apagada porque prenderla sube la
          // cuota y el dueño tiene que ver el monto nuevo antes.
          setBillingPreview(res.requiresBillingConfirmation)
          return
        }
        toast({ title: 'No se pudo reactivar', description: res.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'Cancha activada',
        variant: 'success',
        // Clase A (gramática §3: "Activar/Desactivar cancha, toggle del mismo
        // endpoint, simétrico"): Deshacer re-invoca el toggle inverso directo,
        // sin pasar de nuevo por el ConfirmDialog de impacto.
        action: { label: 'Deshacer', onClick: () => deactivateDirect() },
      })
    })
  }

  async function confirmActivateWithBilling(): Promise<ActionResult> {
    const res = await toggleStatusAction(court.id, 'online', true)
    if (!res.success) return { success: false, error: res.error }
    setCurrentStatus('online')
    // Sin "Deshacer" acá, a diferencia del activar normal: apagar la cancha NO
    // revierte la suba de cuota que se acaba de agendar (decisión 2026-09-17,
    // P3), así que ofrecerlo diría una mentira.
    toast({ title: 'Cancha activada', variant: 'success' })
    return { success: true }
  }

  function deactivateDirect() {
    setCurrentStatus('offline')
    startTransition(async () => {
      const res = await toggleStatusAction(court.id, 'offline')
      if (!res.success) {
        startTransition(() => setCurrentStatus('online'))
        toast({ title: 'No se pudo pausar', description: res.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'Cancha pausada',
        variant: 'success',
        action: { label: 'Deshacer', onClick: () => activate() },
      })
    })
  }

  async function openDeactivate() {
    setLoadingImpact(true)
    const res = await getDeactivationImpactAction(court.id)
    setLoadingImpact(false)
    if (!res.success) {
      // Fix #58: no abrir el dialog con datos falsos (0/0) — el admin podría
      // pausar creyendo que no hay impacto cuando en realidad no se pudo verificar.
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

  async function onConfirmDeactivate(): Promise<ActionResult> {
    const prev = currentStatus
    setCurrentStatus('offline')
    const res = await toggleStatusAction(court.id, 'offline')
    if (!res.success) {
      setCurrentStatus(prev)
      return res
    }
    toast({
      title: 'Cancha pausada',
      variant: 'success',
      action: { label: 'Deshacer', onClick: () => activate() },
    })
    return res
  }

  function handleToggleClick() {
    if (currentStatus === 'online') void openDeactivate()
    else activate()
  }

  const warningLines: string[] = []
  if (impact && impact.futureBookings > 0)
    warningLines.push(
      impact.futureBookings === 1
        ? 'Tiene 1 turno por delante. Sigue en pie hasta que lo canceles.'
        : `Tiene ${impact.futureBookings} turnos por delante. Siguen en pie hasta que los canceles.`,
    )
  if (impact && impact.activeAbonados > 0)
    warningLines.push(
      impact.activeAbonados === 1
        ? 'Tiene 1 turno fijo activo.'
        : `Tiene ${impact.activeAbonados} turnos fijos activos.`,
    )

  const offline = currentStatus === 'offline'
  const busy = isPending || loadingImpact
  const summary = summarizePricing(court.pricing.rules, openingHours, closesNextDay)

  const toggle = (
    <Button
      type="button"
      size="sm"
      variant={offline ? 'outline' : 'ghost'}
      onClick={handleToggleClick}
      disabled={busy}
      className={cn(!offline && 'text-muted-foreground')}
    >
      {busy ? '…' : offline ? 'Reactivar' : 'Pausar'}
    </Button>
  )
  const edit = isAdmin ? (
    <Button type="button" size="sm" variant="outline" onClick={() => onEdit()}>
      Editar
    </Button>
  ) : (
    <LockedAction label="Editar" className="h-10 md:h-9" />
  )

  return (
    <li className="grid grid-cols-1 gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6 lg:py-3">
      {/* Cancha */}
      <div className="flex min-w-0 items-center gap-3">
        <CourtThumb
          court={court}
          offline={offline}
          onAdd={isAdmin ? () => onEdit('photos') : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">{court.name}</p>
          <p className="text-xs text-muted-foreground">
            Fútbol {court.format} · {SURFACE_LABELS[court.surfaceType] ?? court.surfaceType}
          </p>
        </div>
      </div>

      {/* Precio */}
      <div className="min-w-0">
        {isAdmin ? (
          <button
            type="button"
            onClick={() => onEdit()}
            aria-label={`Cambiar el precio de ${court.name}`}
            className="-mx-2 -my-1 max-w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PriceSummary summary={summary} />
          </button>
        ) : (
          <PriceSummary summary={summary} />
        )}
      </div>

      {/* En el teléfono, estado y acciones comparten renglón; desde lg son dos columnas. */}
      <div className="flex items-center justify-between gap-3 lg:contents">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:flex-col lg:items-start">
          <CourtStatusBadge status={currentStatus} />
          <span className="text-xs text-muted-foreground">{COURT_STATUS_HINT[currentStatus]}</span>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5 lg:w-44">
          {toggle}
          {edit}
        </div>
      </div>

      {billingPreview && (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) setBillingPreview(null)
          }}
          title={billingChangeTitle(billingPreview)}
          description={<p>{billingChangeMessage(billingPreview)}</p>}
          confirmLabel="Confirmar"
          cancelLabel="Cancelar"
          onConfirm={confirmActivateWithBilling}
        />
      )}

      {confirmOpen && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Pausar ${court.name}`}
          description={
            <div className="space-y-2">
              <p>
                Mientras esté pausada, los jugadores no la ven en tu perfil y no se le pueden cargar
                turnos nuevos. La reactivás cuando quieras.
              </p>
              {warningLines.map((l, i) => (
                <p
                  key={i}
                  className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
                >
                  {l}
                </p>
              ))}
            </div>
          }
          variant="destructive"
          confirmLabel="Pausar"
          cancelLabel="Volver"
          onConfirm={onConfirmDeactivate}
        />
      )}
    </li>
  )
}
