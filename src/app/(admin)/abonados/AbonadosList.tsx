'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import Link from 'next/link'
import type { AbonadoRow } from '@/modules/abonados/abonado.types'
import { pauseAbonadoAction, reactivateAbonadoAction, cancelAbonadoAction } from './actions'
import { previewAbonadoSlotsAction } from './nuevo/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
    centavos / 100,
  )
}

/** Returns today in ART (UTC-3) as YYYY-MM-DD */
function todayART(): string {
  const d = new Date(new Date().getTime() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

/** Returns today+7 in ART as YYYY-MM-DD */
function defaultCancelDate(): string {
  const d = new Date(new Date().getTime() - 3 * 60 * 60 * 1000 + 7 * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  paused: 'Pausado',
  canceled: 'Cancelado',
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  paused: 'warning',
  canceled: 'secondary',
}

type DialogKind = 'pause' | 'reactivate' | 'cancel' | null

type RowState = {
  dialog: DialogKind
  /** Cancel-specific fields */
  cancelFromDate: string
  /** Reactivate preview data */
  reactivatePreviewDates: string[]
  reactivatePreviewConflicts: string[]
  reactivatePreviewLoading: boolean
  reactivatePreviewError: string | null
}

function defaultRowState(): RowState {
  return {
    dialog: null,
    cancelFromDate: defaultCancelDate(),
    reactivatePreviewDates: [],
    reactivatePreviewConflicts: [],
    reactivatePreviewLoading: false,
    reactivatePreviewError: null,
  }
}

type Props = {
  abonados: AbonadoRow[]
}

export function AbonadosList({ abonados }: Props) {
  if (abonados.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin abonados registrados"
        description="Creá el primer abonado para que aparezca acá."
        action={
          <Link
            href="/abonados/nuevo"
            className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-emerald-700"
          >
            + Nuevo Abonado
          </Link>
        }
      />
    )
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-3">Día / Horario</th>
            <th className="p-3">Contacto</th>
            <th className="p-3">Precio sesión</th>
            <th className="p-3">Precio mensual</th>
            <th className="p-3">Estado</th>
            <th className="p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {abonados.map((a) => (
            <AbonadoRow key={a.id} abonado={a} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AbonadoRow({ abonado: a }: { abonado: AbonadoRow }) {
  const [state, setState] = useState<RowState>(defaultRowState)
  // Buttons are disabled when a dialog is open (ConfirmDialog handles its own pending state).
  const isPending = state.dialog !== null

  function openDialog(dialog: DialogKind) {
    setState((prev) => ({ ...prev, dialog }))
  }

  function closeDialog() {
    setState(defaultRowState)
  }

  // ── Pause ─────────────────────────────────────────────────────────────────
  async function onConfirmPause(): Promise<{ success: boolean; error?: string }> {
    const res = await pauseAbonadoAction(a.id)
    if (!res.success) {
      return { success: false, error: res.error }
    }
    toast({ title: 'Abonado pausado correctamente.', variant: 'success' })
    return { success: true }
  }

  // ── Reactivate ────────────────────────────────────────────────────────────
  async function openReactivate() {
    setState((prev) => ({
      ...prev,
      dialog: 'reactivate',
      reactivatePreviewLoading: true,
      reactivatePreviewError: null,
      reactivatePreviewDates: [],
      reactivatePreviewConflicts: [],
    }))

    const preview = await previewAbonadoSlotsAction({
      courtId: a.courtId,
      dayOfWeek: a.dayOfWeek,
      timeStart: a.timeStart,
      timeEnd: a.timeEnd,
      startsOn: todayART(),
    })

    setState((prev) => ({
      ...prev,
      reactivatePreviewLoading: false,
      reactivatePreviewDates: preview.success ? preview.dates : [],
      reactivatePreviewConflicts: preview.success ? preview.conflicts : [],
      reactivatePreviewError: preview.success ? null : preview.error,
    }))
  }

  async function onConfirmReactivate(): Promise<{ success: boolean; error?: string }> {
    const res = await reactivateAbonadoAction(a.id)
    if (!res.success) {
      return { success: false, error: res.error }
    }
    const n = res.slotsGenerated ?? 0
    toast({
      title: `Reactivado. Se generaron ${n} slot${n !== 1 ? 's' : ''} futuros.`,
      variant: 'success',
    })
    return { success: true }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function onConfirmCancel(): Promise<{ success: boolean; error?: string }> {
    const res = await cancelAbonadoAction(a.id, state.cancelFromDate)
    if (!res.success) {
      return { success: false, error: res.error }
    }
    toast({ title: 'Abonado cancelado.', variant: 'default' })
    return { success: true }
  }

  const isActive = a.status === 'active'
  const isPaused = a.status === 'paused'

  return (
    <>
      <tr className="border-b last:border-0">
        <td className="p-3 font-medium">
          {DAY_NAMES[a.dayOfWeek]} {a.timeStart}–{a.timeEnd}
        </td>
        <td className="p-3">
          <div>{a.contactName}</div>
          <div className="text-muted-foreground text-xs">{a.contactPhone}</div>
        </td>
        <td className="p-3">{formatARS(a.pricePerSession)}</td>
        <td className="p-3">{formatARS(a.monthlyPrice)}</td>
        <td className="p-3">
          <Badge variant={STATUS_VARIANT[a.status] ?? 'secondary'}>
            {STATUS_LABELS[a.status] ?? a.status}
          </Badge>
        </td>
        <td className="p-3 space-x-2">
          {isActive && (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => openDialog('pause')}
                className="text-xs text-yellow-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Pausar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => openDialog('cancel')}
                className="text-xs text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </>
          )}
          {isPaused && (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => void openReactivate()}
                className="text-xs text-green-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reactivar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => openDialog('cancel')}
                className="text-xs text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </>
          )}
        </td>
      </tr>

      {/* ── Pause dialog ── */}
      <ConfirmDialog
        open={state.dialog === 'pause'}
        onOpenChange={(open) => { if (!open) closeDialog() }}
        title="Pausar abonado"
        description={
          <div className="space-y-2">
            <p>
              Eliminará todas las reservas futuras de este abonado. Podés reactivar después.
            </p>
          </div>
        }
        variant="default"
        confirmLabel="Pausar"
        cancelLabel="Volver"
        onConfirm={onConfirmPause}
      />

      {/* ── Reactivate dialog ── */}
      <ConfirmDialog
        open={state.dialog === 'reactivate'}
        onOpenChange={(open) => { if (!open) closeDialog() }}
        title="Reactivar abonado"
        description={
          <ReactivatePreview
            loading={state.reactivatePreviewLoading}
            dates={state.reactivatePreviewDates}
            conflicts={state.reactivatePreviewConflicts}
            error={state.reactivatePreviewError}
          />
        }
        variant="default"
        confirmLabel="Reactivar"
        cancelLabel="Volver"
        onConfirm={onConfirmReactivate}
      />

      {/* ── Cancel dialog ── */}
      <ConfirmDialog
        open={state.dialog === 'cancel'}
        onOpenChange={(open) => { if (!open) closeDialog() }}
        title="Cancelar abonado"
        description={
          <div className="space-y-2">
            <p>Esta acción es permanente. Se eliminarán todas las reservas futuras desde la fecha elegida.</p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
              Las reservas futuras desde esa fecha serán borradas sin posibilidad de recuperación.
            </p>
          </div>
        }
        variant="destructive"
        confirmLabel="Cancelar abonado"
        cancelLabel="Volver"
        confirmationPhrase="CANCELAR"
        onConfirm={onConfirmCancel}
      >
        <div className="space-y-1">
          <label htmlFor={`cancel-date-${a.id}`} className="text-xs font-medium text-slate-700">
            Cancelar desde
          </label>
          <input
            id={`cancel-date-${a.id}`}
            type="date"
            min={todayART()}
            value={state.cancelFromDate}
            onChange={(e) =>
              setState((prev) => ({ ...prev, cancelFromDate: e.target.value }))
            }
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>
      </ConfirmDialog>
    </>
  )
}

function ReactivatePreview({
  loading,
  dates,
  conflicts,
  error,
}: {
  loading: boolean
  dates: string[]
  conflicts: string[]
  error: string | null
}) {
  if (loading) {
    return <p className="text-sm text-slate-500">Cargando slots disponibles…</p>
  }
  if (error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        No se pudo cargar la vista previa: {error}
      </p>
    )
  }
  if (dates.length === 0) {
    return <p className="text-sm text-slate-500">No se encontraron slots futuros para generar.</p>
  }

  const available = dates.filter((d) => !conflicts.includes(d))
  const conflictSet = new Set(conflicts)

  return (
    <div className="space-y-2">
      <p className="text-sm">
        Se generarán <strong>{available.length}</strong> slot{available.length !== 1 ? 's' : ''} futuros
        {conflicts.length > 0 && (
          <span className="text-amber-700">
            {' '}({conflicts.length} con conflicto, se saltarán)
          </span>
        )}
        .
      </p>
      <ul className="max-h-40 overflow-y-auto space-y-1">
        {dates.map((d) => (
          <li key={d} className="flex items-center justify-between text-xs">
            <span>{d}</span>
            {conflictSet.has(d) ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Conflicto
              </span>
            ) : (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700 ring-1 ring-inset ring-green-600/20">
                OK
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
