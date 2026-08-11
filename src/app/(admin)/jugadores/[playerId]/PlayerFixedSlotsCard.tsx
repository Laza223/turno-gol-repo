'use client'

import { useState } from 'react'
import { Unlink } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { PlayerFixedSlotRow } from '../queries'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  paused: 'Pausado',
  canceled: 'Cancelado',
}

export type UnlinkContactFn = (
  playerId: string,
) => Promise<{ success: boolean; error?: string }>

/**
 * Turnos fijos a nombre del jugador, con el inverso de la vinculación de B13.
 *
 * "Desvincular" existe porque la vinculación es manual: un click equivocado
 * sobre una sugerencia de teléfono no puede quedar grabado para siempre, y no
 * hay ninguna otra pantalla que permita cambiarle el titular a un fijo. La
 * persona no se pierde al desvincular — `contact_name` y `contact_phone` siguen
 * en el fijo, así que vuelve a la lista de Personas como "Sin cuenta".
 */
export function PlayerFixedSlotsCard({
  playerId,
  playerName,
  slots,
  unlinkContactAction,
}: {
  playerId: string
  playerName: string
  slots: PlayerFixedSlotRow[]
  unlinkContactAction: UnlinkContactFn
}) {
  const [open, setOpen] = useState(false)

  if (slots.length === 0) return null

  return (
    <section className="card-premium rounded-xl p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Turnos fijos</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0 md:py-1.5"
        >
          <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
          Desvincular
        </button>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 text-sm">
        {slots.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {DAY_NAMES[s.dayOfWeek] ?? '—'} {s.timeStart.slice(0, 5)}–{s.timeEnd.slice(0, 5)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {s.courtName} · a nombre de {s.contactName}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {STATUS_LABELS[s.status] ?? s.status}
            </span>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Desvincular a ${playerName}`}
        description={
          <>
            {slots.length === 1 ? 'El turno fijo vuelve' : 'Los turnos fijos vuelven'} a figurar
            solo con el nombre y el teléfono del contacto, sin cuenta asociada.
          </>
        }
        consequences={[
          'Las reservas de esos fijos dejan de contar en su historial.',
          'La persona sigue apareciendo en Personas, como "Sin cuenta".',
          'Se puede volver a vincular desde esa lista.',
        ]}
        confirmLabel="Desvincular"
        variant="destructive"
        onConfirm={async () => {
          const res = await unlinkContactAction(playerId)
          if (res.success) toast({ title: 'Turnos fijos desvinculados' })
          return res
        }}
      />
    </section>
  )
}
