'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BanPlayerDialog, type BanPlayerFn } from '@/components/admin/BanPlayerDialog'
import { toast } from '@/hooks/use-toast'
import type { BanCheckResult } from '@/modules/bans/ban.service'

type ActionResult = { success: boolean; error?: string }
type LiftFn = (playerId: string) => Promise<ActionResult>

type Props = {
  playerId: string
  /** Para el texto de confirmación del bloqueo (§4.11: unificado con /deudas). */
  playerName?: string
  ban: BanCheckResult
  banPlayerAction: BanPlayerFn
  liftPlayerBanAction: LiftFn
}

/**
 * Ban manual de mostrador (doc7 Flujo 5B, ENS-8): el encargado bloquea/
 * desbloquea a un jugador conflictivo. Las Server Actions llegan por PROP,
 * no por import (mismo motivo que BookingActions.tsx: '../actions' es
 * 'use server' y arrastra node:async_hooks, que rompe Storybook).
 * Un ban con `bannedGlobal` (players.status='banned') no se gestiona desde
 * acá — solo se muestra el indicador (JugadorProfileView).
 *
 * El formulario de bloqueo vive en `BanPlayerDialog` (compartido con
 * `/deudas/ManualBanDialog.tsx` — misma action, mismos defaults, 🔴 auditoría
 * 2026-08-01 §4.11).
 */
export function BanPlayerControls({
  playerId,
  playerName,
  ban,
  banPlayerAction,
  liftPlayerBanAction,
}: Props) {
  const [banOpen, setBanOpen] = useState(false)
  const [liftOpen, setLiftOpen] = useState(false)

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
        onClick={() => setBanOpen(true)}
        className="h-11 md:h-9 rounded-lg border border-red-200 dark:border-red-500/30 bg-card px-4 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        Bloquear jugador
      </button>
      <BanPlayerDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        playerId={playerId}
        playerName={playerName}
        banPlayerAction={banPlayerAction}
        onBanned={() => toast({ title: 'Jugador bloqueado', variant: 'success' })}
      />
    </>
  )
}
