'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { ImageOff, LandPlot, LayoutGrid, Lock } from 'lucide-react'
import type { CourtRow } from '@/modules/courts/court.types'
import { countCourtsWithoutPhoto } from '@/modules/tenants/setup-gaps'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { CourtActionResult, CourtDeactivationImpactResult } from '../actions'
import {
  billingChangeMessage,
  billingChangeTitle,
  type BillingChangePreview,
} from '../billing-copy'
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
  const [showForm, setShowForm] = useState(false)
  const [editingCourt, setEditingCourt] = useState<CourtRow | null>(null)

  function handleCourtSaved(updatedCourt: CourtRow) {
    const wasEdit = editingCourt !== null
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
    toast({ title: wasEdit ? 'Cancha actualizada' : 'Cancha creada', variant: 'success' })
  }

  function openCreate() {
    setEditingCourt(null)
    setShowForm(true)
  }

  function openEdit(court: CourtRow) {
    setEditingCourt(court)
    setShowForm(true)
  }

  // Las fotos se guardan en la DB apenas se eligen, aunque después se cancele el
  // form: sin llevarlas a `courts` la lista sigue marcando "sin foto" y "Editar"
  // reabre con la lista vieja.
  function closeForm(photos?: string[]) {
    const editedId = editingCourt?.id
    if (editedId && photos) {
      setCourts((prev) => prev.map((c) => (c.id === editedId ? { ...c, photos } : c)))
    }
    setShowForm(false)
    setEditingCourt(null)
  }

  const totalWord = courts.length === 1 ? '1 cancha' : `${courts.length} canchas`
  const withoutPhoto = countCourtsWithoutPhoto(courts)
  const withoutPhotoText =
    withoutPhoto === courts.length
      ? courts.length === 1
        ? 'Tu cancha no tiene foto.'
        : 'Ninguna de tus canchas tiene foto.'
      : `${withoutPhoto} de ${courts.length} canchas sin foto.`

  const header = (
    <PageHeader
      title="Canchas"
      subtitle={`${totalWord} · ${tenantName}`}
      icon={<LandPlot className="h-6 w-6" aria-hidden="true" />}
      actions={
        // El CTA se oculta del todo con el form abierto (mismo comportamiento
        // previo: no se podía disparar "+ Nueva cancha" mientras ya se estaba
        // creando/editando una cancha). Texto con el "+" literal sin cambios:
        // fijado por e2e canchas-crud (`getByRole('button', { name: '+ Nueva
        // cancha' })`). Para el manager NO se oculta (MASTER §12 CHK-admin:
        // "ítems bloqueados por rol muestran candado+tooltip, nunca
        // desaparecen") — mismo patrón que `torneos/page.tsx`.
        showForm ? undefined : isAdmin ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] hover:bg-primary/90 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            + Nueva cancha
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground"
            title="Solo el dueño puede crear canchas"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />+ Nueva cancha
            <span className="sr-only">— solo el dueño puede hacerlo</span>
          </span>
        )
      }
    />
  )

  if (showForm) {
    return (
      <div className="space-y-6">
        {header}
        <CourtForm
          court={editingCourt}
          tenantId={tenantId}
          openingHours={openingHours}
          closesNextDay={closesNextDay}
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
            ) : (
              // MASTER §12 CHK-admin: candado+tooltip, nunca desaparición.
              <span
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground"
                title="Solo el dueño puede crear canchas"
              >
                <Lock className="h-4 w-4" aria-hidden="true" />+ Nueva cancha
                <span className="sr-only">— solo el dueño puede hacerlo</span>
              </span>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Nada bloquea crear una cancha sin foto, así que sin este aviso el
              dueño no se entera de que en el perfil público sale como un fondo
              verde vacío. Solo el dueño puede arreglarlo (el manager no edita). */}
          {isAdmin && withoutPhoto > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
              <ImageOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {withoutPhotoText} Una cancha sin foto sale en tu perfil público como un fondo verde
                vacío.
              </span>
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
  // Aviso de "prender esta cancha te sube la cuota". Es un diálogo aparte del
  // de desactivar: son dos decisiones distintas y el de desactivar es
  // destructivo, este no.
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
        toast({ title: 'No se pudo activar', description: res.error, variant: 'destructive' })
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
        toast({ title: 'No se pudo desactivar', description: res.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'Cancha desactivada',
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

  async function onConfirmDeactivate(): Promise<ActionResult> {
    const prev = currentStatus
    setCurrentStatus('offline')
    const res = await toggleStatusAction(court.id, 'offline')
    if (!res.success) {
      setCurrentStatus(prev)
      return res
    }
    toast({
      title: 'Cancha desactivada',
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
        {isAdmin && court.photos.length === 0 && (
          <button
            type="button"
            onClick={() => onEdit(court)}
            className="inline-flex min-h-9 items-center gap-1 rounded-md py-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
            Sin foto · agregar
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isAdmin ? (
          <button
            type="button"
            onClick={() => onEdit(court)}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 font-medium min-h-11 md:min-h-9 px-2 py-1 rounded-md hover:bg-accent transition-colors duration-150"
          >
            Editar
          </button>
        ) : (
          // MASTER §12 CHK-admin: candado+tooltip, nunca desaparición.
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground min-h-11 md:min-h-9 px-2 py-1"
            title="Solo el dueño puede editar la cancha"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Editar
            <span className="sr-only">— solo el dueño puede hacerlo</span>
          </span>
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
          title={`Desactivar ${court.name}`}
          description={
            <div className="space-y-2">
              <p>Una cancha offline no recibe reservas nuevas.</p>
              {warningLines.map((l, i) => (
                <p
                  key={i}
                  className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30"
                >
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
