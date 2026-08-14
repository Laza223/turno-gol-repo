'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import type { ManualBanDuration } from '@/modules/bans/ban.schema'

export type BanPlayerFn = (
  playerId: string,
  reason: string,
  duration: ManualBanDuration,
) => Promise<{ success: boolean; error?: string }>

const DURATION_LABELS: Record<ManualBanDuration, string> = {
  '7d': '7 días',
  '30d': '30 días',
  indefinite: 'Permanente',
}

const DURATIONS: ManualBanDuration[] = ['7d', '30d', 'indefinite']

/**
 * Diálogo de ban manual — ÚNICA superficie del producto (🔴 auditoría
 * 2026-08-01 §4.11): usado desde `/jugadores/[playerId]`
 * (`BanPlayerControls`) y desde `/deudas` (`ManualBanDialog`, que antes tenía
 * su propia action sin audit log y precargaba "Deuda incobrable de reserva" +
 * 30 días — reintroducía con un click el modelo no-show=deuda revertido el
 * 2026-07-11). Decisión del dueño 2026-08-01: motivo vacío obligatorio +
 * default 7 días; "Permanente" sigue disponible, nunca sugerido.
 */
export function BanPlayerDialog({
  open,
  onOpenChange,
  playerId,
  playerName,
  banPlayerAction,
  onBanned,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerId: string
  playerName?: string
  banPlayerAction: BanPlayerFn
  onBanned?: () => void
}) {
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState<ManualBanDuration>('7d')

  // El reset vivía en el handler que Radix invoca cuando el DIÁLOGO cambia su
  // propio estado (ESC, click afuera, sus botones) — nunca cuando el padre hace
  // setOpen(true). Abriendo desde afuera reaparecía el motivo y la duración del
  // intento que se había cancelado (🟡 QA 2026-08-13). Reaccionar a la
  // transición de `open` cubre a cualquier caller, no solo al de esta pantalla
  // (el precedente de LinkContactDialog resetea en su botón disparador, y eso
  // deja el bug latente para el próximo que monte el diálogo).
  // Ajuste durante el render (no en un efecto: `react-hooks/set-state-in-effect`
  // lo prohíbe, y con razón — un efecto pintaría un frame con los valores viejos).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setReason('')
      setDuration('7d')
    }
  }

  async function handleConfirm(): Promise<{ success: boolean; error?: string }> {
    if (!reason.trim()) return { success: false, error: 'Ingresá un motivo.' }
    const res = await banPlayerAction(playerId, reason.trim(), duration)
    if (res.success) onBanned?.()
    return res
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bloquear jugador"
      description={
        <>
          El jugador no va a poder reservar online en tu complejo mientras dure el bloqueo.
          {playerName ? (
            <>
              {' '}
              Se aplica a <strong className="text-foreground">{playerName}</strong>.
            </>
          ) : null}
        </>
      }
      variant="destructive"
      confirmLabel="Bloquear jugador"
      cancelLabel="Cancelar"
      onConfirm={handleConfirm}
    >
      <div className="space-y-3">
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-foreground">Duración</legend>
          <RadioChipGroup
            value={duration}
            onValueChange={(v) => setDuration(v as ManualBanDuration)}
          >
            {DURATIONS.map((d) => (
              <RadioChip key={d} value={d}>
                {DURATION_LABELS[d]}
              </RadioChip>
            ))}
          </RadioChipGroup>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="ban-reason" className="text-xs font-medium text-foreground">
            Motivo (obligatorio)
          </label>
          <textarea
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
    </ConfirmDialog>
  )
}
