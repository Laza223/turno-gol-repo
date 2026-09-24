import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SlotGates } from '@/components/booking/slot-panel/slot-gates'

/**
 * Menú "más acciones" del modal de cobro de Hoy: editar, reprogramar,
 * cancelar. Extraído de `HoyChargeModal` — solo se monta si hay al menos una
 * de las tres (`hasMenu` en el caller).
 */
export function HoyChargeModalMenu({
  gates,
  isPending,
  onEdit,
  onReschedule,
  onCancel,
}: {
  gates: Pick<SlotGates, 'canEdit' | 'canReschedule' | 'canCancel'>
  isPending: boolean
  onEdit: () => void
  onReschedule: () => void
  onCancel: () => void
}) {
  return (
    // A la izquierda del ✕ del diálogo (right-4). `modal={false}` por el mismo
    // motivo que el resto del repo: con el default, Radix marca todo el árbol
    // como aria-hidden, incluido el trigger.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        disabled={isPending}
        aria-label="Más acciones del turno"
        className="absolute right-11 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <MoreHorizontal aria-hidden className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {gates.canEdit && <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>}
        {gates.canReschedule && (
          <DropdownMenuItem onSelect={onReschedule}>Reprogramar</DropdownMenuItem>
        )}
        {gates.canCancel && (
          <DropdownMenuItem
            onSelect={onCancel}
            className="text-red-700 focus:text-red-800 dark:text-red-300"
          >
            Cancelar reserva
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
