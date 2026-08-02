'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import DatePicker from '@/components/ui/date-picker'

type DialogKind = 'pause' | 'reactivate' | 'cancel' | 'cancel-single' | null

type ConfirmResult = { success: boolean; error?: string }

/** Today in ART (UTC-3) as YYYY-MM-DD — used as the min for the cancel date. */
function todayART(): string {
  const d = new Date(new Date().getTime() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

export type AbonadoDialogsProps = {
  abonadoId: string
  dialog: DialogKind
  cancelFromDate: string
  onCancelFromDateChange: (date: string) => void
  reactivatePreviewLoading: boolean
  reactivatePreviewDates: string[]
  reactivatePreviewConflicts: string[]
  reactivatePreviewError: string | null
  onClose: () => void
  onConfirmPause: () => Promise<ConfirmResult>
  onConfirmReactivate: () => Promise<ConfirmResult>
  onConfirmCancel: () => Promise<ConfirmResult>
}

/**
 * The abonado action dialogs (pause / reactivate / cancel / cancel-single) all pull in the
 * Radix-backed ConfirmDialog. They are only needed once an admin clicks a row
 * action, so this whole subtree is lazy-loaded by AbonadosList and mounted only
 * while a dialog is active — keeping ConfirmDialog out of the initial chunk.
 */
export function AbonadoDialogs({
  abonadoId,
  dialog,
  cancelFromDate,
  onCancelFromDateChange,
  reactivatePreviewLoading,
  reactivatePreviewDates,
  reactivatePreviewConflicts,
  reactivatePreviewError,
  onClose,
  onConfirmPause,
  onConfirmReactivate,
  onConfirmCancel,
}: AbonadoDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={dialog === 'pause'}
        onOpenChange={(open) => { if (!open) onClose() }}
        title="Pausar turno fijo"
        consequences={[
          'Elimina todas las reservas futuras de este turno fijo.',
          'Podés reactivarlo después, pero las horas liberadas mientras tanto pueden ocuparse.',
        ]}
        variant="destructive"
        confirmLabel="Pausar"
        cancelLabel="Volver"
        onConfirm={onConfirmPause}
      />

      <ConfirmDialog
        open={dialog === 'reactivate'}
        onOpenChange={(open) => { if (!open) onClose() }}
        title="Reactivar turno fijo"
        description={
          <ReactivatePreview
            loading={reactivatePreviewLoading}
            dates={reactivatePreviewDates}
            conflicts={reactivatePreviewConflicts}
            error={reactivatePreviewError}
          />
        }
        variant="default"
        confirmLabel="Reactivar"
        cancelLabel="Volver"
        onConfirm={onConfirmReactivate}
      />

      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => { if (!open) onClose() }}
        title="Cancelar turno fijo"
        description={
          <div className="space-y-2">
            <p>Esta acción es permanente. Se eliminarán todas las reservas futuras desde la fecha elegida.</p>
            <p className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
              Las reservas futuras desde esa fecha serán borradas sin posibilidad de recuperación.
            </p>
          </div>
        }
        variant="destructive"
        confirmLabel="Cancelar turno fijo"
        cancelLabel="Volver"
        confirmationPhrase="CANCELAR"
        onConfirm={onConfirmCancel}
      >
        <div className="space-y-1.5">
          <label htmlFor={`cancel-date-${abonadoId}`} className="text-xs font-medium text-foreground">
            Cancelar desde
          </label>
          <DatePicker
            id={`cancel-date-${abonadoId}`}
            value={cancelFromDate}
            onChange={onCancelFromDateChange}
            min={todayART()}
            placeholder="Seleccionar fecha"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'cancel-single'}
        onOpenChange={(open) => { if (!open) onClose() }}
        title="Cancelar una fecha puntual"
        description={
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Para cancelar únicamente el turno de una fecha específica (ej: este martes) sin dar de baja el turno fijo permanente:
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-foreground bg-muted/40 p-3 rounded-xl border border-border">
              <li>Ingresá a la <strong>Grilla</strong> o a la lista de <strong>Reservas</strong>.</li>
              <li>Buscá la fecha del día que avisaron que no asistirán.</li>
              <li>Hacé clic en el turno de ese horario y seleccioná <strong>“Cancelar reserva”</strong>.</li>
            </ol>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              ✓ La cancha quedará libre para esa fecha puntual y el turno fijo continuará activo para todas las demás semanas.
            </p>
          </div>
        }
        variant="default"
        confirmLabel="Ir a la Grilla"
        cancelLabel="Cerrar"
        onConfirm={async () => {
          window.location.href = '/grilla'
          return { success: true }
        }}
      />
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
    return <p className="text-sm text-muted-foreground">Cargando fechas disponibles…</p>
  }
  if (error) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
        No se pudo cargar la vista previa: {error}
      </p>
    )
  }
  if (dates.length === 0) {
    return <p className="text-sm text-muted-foreground">No se encontraron fechas futuras para generar.</p>
  }

  const available = dates.filter((d) => !conflicts.includes(d))
  const conflictSet = new Set(conflicts)

  return (
    <div className="space-y-2">
      <p className="text-sm">
        Se generarán <strong>{available.length}</strong> turno{available.length !== 1 ? 's' : ''}{' '}
        futuro{available.length !== 1 ? 's' : ''}
        {conflicts.length > 0 && (
          <span className="text-amber-700 dark:text-amber-300">
            {' '}
            ({conflicts.length === 1
              ? '1 fecha ya ocupada se va a saltar'
              : `${conflicts.length} fechas ya ocupadas se van a saltar`})
          </span>
        )}
        .
      </p>
      <ul className="max-h-40 overflow-y-auto space-y-1">
        {dates.map((d) => (
          <li key={d} className="flex items-center justify-between text-xs">
            <span>{d}</span>
            {conflictSet.has(d) ? (
              <span className="rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
                Ocupado
              </span>
            ) : (
              <span className="rounded-full bg-green-50 dark:bg-green-500/10 px-2 py-0.5 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/20 dark:ring-green-500/30">
                Libre
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
