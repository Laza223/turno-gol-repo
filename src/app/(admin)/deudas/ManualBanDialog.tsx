'use client'

import { useRouter } from 'next/navigation'
import { BanPlayerDialog } from '@/components/admin/BanPlayerDialog'
import { toast } from '@/hooks/use-toast'
import { banPlayerAction } from '@/app/(admin)/jugadores/actions'

type Props = {
  player: { id: string; name: string } | null
  onClose: () => void
  onSuccess?: () => void
}

/**
 * Adaptador fino sobre `BanPlayerDialog` (compartido con
 * `/jugadores/[playerId]/BanPlayerControls.tsx`) — antes este archivo tenía
 * su propio diálogo con una Server Action que NO auditaba y precargaba
 * "Deuda incobrable de reserva" + 30 días (🔴 auditoría 2026-08-01 §4.11,
 * reintroducía el modelo no-show=deuda revertido el 2026-07-11). Unificado
 * 2026-08-01: misma action (`jugadores/actions.ts`, audita siempre), mismos
 * defaults (motivo vacío + 7 días).
 *
 * `key={player.id}`: sin esto, cambiar de jugador sin cerrar el diálogo de
 * por medio dejaría el motivo/duración tipeados para el jugador anterior.
 */
export function ManualBanDialog({ player, onClose, onSuccess }: Props) {
  const router = useRouter()
  if (!player) return null

  return (
    <BanPlayerDialog
      key={player.id}
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      playerId={player.id}
      playerName={player.name}
      banPlayerAction={banPlayerAction}
      onBanned={() => {
        toast({ title: 'Jugador bloqueado', description: player.name, variant: 'success' })
        router.refresh()
        onClose()
        onSuccess?.()
      }}
    />
  )
}
