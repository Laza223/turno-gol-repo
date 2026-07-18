'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { BanCheckResult } from '@/modules/bans/ban.service'
import type { ManualBanDuration } from '@/modules/bans/ban.schema'

type ActionResult = { success: boolean; error?: string }
type BanFn = (playerId: string, reason: string, duration: ManualBanDuration) => Promise<ActionResult>
type LiftFn = (playerId: string) => Promise<ActionResult>

type Props = {
  playerId: string
  ban: BanCheckResult
  banPlayerAction: BanFn
  liftPlayerBanAction: LiftFn
}

const DURATION_LABELS: Record<ManualBanDuration, string> = {
  '7d': '7 días',
  '30d': '30 días',
  indefinite: 'Indefinido',
}

const DURATIONS: ManualBanDuration[] = ['7d', '30d', 'indefinite']

/**
 * Ban manual de mostrador (doc7 Flujo 5B, ENS-8): el encargado bloquea/
 * desbloquea a un jugador conflictivo. Las Server Actions llegan por PROP,
 * no por import (mismo motivo que BookingActions.tsx: '../actions' es
 * 'use server' y arrastra node:async_hooks, que rompe Storybook).
 * Un ban con `bannedGlobal` (players.status='banned') no se gestiona desde
 * acá — solo se muestra el indicador (JugadorProfileView).
 */
export function BanPlayerControls({ playerId, ban, banPlayerAction, liftPlayerBanAction }: Props) {
  const [banOpen, setBanOpen] = useState(false)
  const [liftOpen, setLiftOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState<ManualBanDuration>('7d')

  async function onConfirmBan(): Promise<ActionResult> {
    if (!reason.trim()) return { success: false, error: 'Ingresá un motivo.' }
    const res = await banPlayerAction(playerId, reason.trim(), duration)
    if (res.success) toast({ title: 'Jugador bloqueado', variant: 'success' })
    return res
  }

  async function onConfirmLift(): Promise<ActionResult> {
    const res = await liftPlayerBanAction(playerId)
    if (res.success) toast({ title: 'Bloqueo levantado', variant: 'success' })
    return res
  }

  if (ban.banned && ban.bannedGlobal) return null

  if (ban.banned) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLiftOpen(true)}
          className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Levantar bloqueo
        </button>
        <ConfirmDialog
          open={liftOpen}
          onOpenChange={setLiftOpen}
          title="Levantar bloqueo"
          description="El jugador va a poder volver a reservar online en tu complejo de inmediato."
          confirmLabel="Levantar bloqueo"
          cancelLabel="Volver"
          onConfirm={onConfirmLift}
        />
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason('')
          setDuration('7d')
          setBanOpen(true)
        }}
        className="h-11 md:h-9 rounded-lg border border-red-200 dark:border-red-500/30 bg-card px-4 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        Bloquear jugador
      </button>
      <ConfirmDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        title="Bloquear jugador"
        description="El jugador no va a poder reservar online en tu complejo mientras dure el bloqueo. Podés levantarlo cuando quieras desde acá."
        variant="destructive"
        confirmLabel="Bloquear jugador"
        cancelLabel="Volver"
        onConfirm={onConfirmBan}
      >
        <div className="space-y-3">
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-foreground">Duración</legend>
            {DURATIONS.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="ban-duration"
                  checked={duration === d}
                  onChange={() => setDuration(d)}
                />
                {DURATION_LABELS[d]}
              </label>
            ))}
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
