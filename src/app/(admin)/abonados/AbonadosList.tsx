'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { UserPlus, Users } from 'lucide-react'
import Link from 'next/link'
import type { AbonadoRow } from '@/modules/abonados/abonado.types'
import { pauseAbonadoAction, reactivateAbonadoAction, cancelAbonadoAction } from './actions'
import { previewAbonadoSlotsAction } from './nuevo/actions'
import { EmptyState } from '@/components/ui/empty-state'
import { formatArs } from '@/lib/format'
import { AbonadoStatusBadge } from './status-visual'
import { toast } from '@/hooks/use-toast'

// The pause/reactivate/cancel dialogs pull in the Radix-backed ConfirmDialog and
// are only needed once an admin clicks a row action. Lazy-load the whole subtree
// and mount it only while a dialog is open, so ConfirmDialog stays out of the
// initial Abonados chunk.
const AbonadoDialogs = dynamic(
  () => import('./AbonadoDialogs').then((m) => m.AbonadoDialogs),
  { ssr: false },
)

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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
  /** Etiqueta del filtro activo (ej. "activos"), para un empty state que explique el vacío. */
  filterLabel?: string
}

export function AbonadosList({ abonados, filterLabel }: Props) {
  if (abonados.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={filterLabel ? `Sin abonados ${filterLabel}` : 'Sin abonados registrados'}
        description={
          filterLabel
            ? 'No hay abonados con este estado. Probá otro filtro o cargá uno nuevo.'
            : 'Creá el primer abonado para que aparezca acá.'
        }
        action={
          <Link
            href="/abonados/nuevo"
            className="inline-flex h-10 items-center gap-2 justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Nuevo abonado
          </Link>
        }
      />
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Día / horario</th>
            <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Contacto</th>
            <th className="p-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Precio por turno</th>
            <th className="p-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Precio mensual</th>
            <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado</th>
            <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Acciones</th>
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
      // #15: respetar la fecha de fin del abonado para que el preview genere los
      // mismos slots que reactivateAbonado (que usa abonado.endsOn). Mismo formato
      // YYYY-MM-DD que abonado.service.ts para evitar drift de timezone.
      endsOn: a.endsOn ? a.endsOn.toISOString().slice(0, 10) : undefined,
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
      title: `Reactivado. Se generaron ${n} turno${n !== 1 ? 's' : ''} futuro${n !== 1 ? 's' : ''}.`,
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
      <tr className="border-b border-border last:border-0 transition-colors hover:bg-accent/50">
        <td className="p-3 font-medium tabular-nums">
          {DAY_NAMES[a.dayOfWeek]} {a.timeStart}–{a.timeEnd}
        </td>
        <td className="p-3">
          <div>{a.contactName}</div>
          <div className="text-muted-foreground text-xs">{a.contactPhone}</div>
        </td>
        <td className="p-3 text-right tabular-nums">{formatArs(a.pricePerSession)}</td>
        <td className="p-3 text-right tabular-nums">{formatArs(a.monthlyPrice)}</td>
        <td className="p-3">
          <AbonadoStatusBadge status={a.status} />
        </td>
        <td className="p-3 space-x-3">
          {isActive && (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => openDialog('pause')}
                className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Pausar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => openDialog('cancel')}
                className="text-xs font-medium text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reactivar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => openDialog('cancel')}
                className="text-xs font-medium text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </>
          )}
        </td>
      </tr>

      {state.dialog !== null &&
        createPortal(
          <AbonadoDialogs
            abonadoId={a.id}
            dialog={state.dialog}
            cancelFromDate={state.cancelFromDate}
            onCancelFromDateChange={(date) =>
              setState((prev) => ({ ...prev, cancelFromDate: date }))
            }
            reactivatePreviewLoading={state.reactivatePreviewLoading}
            reactivatePreviewDates={state.reactivatePreviewDates}
            reactivatePreviewConflicts={state.reactivatePreviewConflicts}
            reactivatePreviewError={state.reactivatePreviewError}
            onClose={closeDialog}
            onConfirmPause={onConfirmPause}
            onConfirmReactivate={onConfirmReactivate}
            onConfirmCancel={onConfirmCancel}
          />,
          document.body,
        )}
    </>
  )
}
