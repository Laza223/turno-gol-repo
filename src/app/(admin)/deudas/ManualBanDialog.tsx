'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { banPlayerAction } from './actions'
import type { ManualBanDuration } from '@/modules/bans/ban.schema'

type Props = {
  player: {
    id: string
    name: string
  } | null
  onClose: () => void
  onSuccess?: () => void
}

const DURATION_OPTIONS: { value: ManualBanDuration; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'indefinite', label: 'Permanente (Indefinido)' },
]

export function ManualBanDialog({ player, onClose, onSuccess }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [lastPlayerId, setLastPlayerId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState<ManualBanDuration>('30d')

  if (player && player.id !== lastPlayerId) {
    setLastPlayerId(player.id)
    setError(null)
    setReason('Deuda incobrable de reserva')
    setDuration('30d')
  }

  if (!player) return null

  function handleClose() {
    setError(null)
    setLastPlayerId(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!player) return
    if (!reason.trim()) {
      setError('Debes especificar un motivo para la sanción.')
      return
    }

    const targetPlayer = player

    setError(null)
    startTransition(async () => {
      const res = await banPlayerAction({
        playerId: targetPlayer.id,
        reason: reason.trim(),
        duration,
      })

      if (!res.success) {
        setError(res.error)
        return
      }

      toast({
        title: 'Jugador sancionado',
        description: `Se aplicó el baneo a ${targetPlayer.name} correctamente.`,
      })

      router.refresh()
      handleClose()
      onSuccess?.()
    })
  }

  return (
    <Dialog open={!!player} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md bg-white p-6 shadow-xl dark:bg-zinc-900">
        <DialogHeader>
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <ShieldAlert className="h-6 w-6" />
            <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Sancionar Jugador
            </DialogTitle>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Se bloqueará la capacidad de reservar online para{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">{player.name}</strong> en este complejo.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Motivo del Bloqueo
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Deuda pendiente incobrable de $5.000"
              rows={3}
              className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm text-zinc-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Duración de la Sanción
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value as ManualBanDuration)}
              className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm text-zinc-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
            >
              {isPending ? 'Sancionando...' : 'Aplicar Sanción'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
