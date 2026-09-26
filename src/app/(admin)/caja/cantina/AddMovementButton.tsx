'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CreateCashFlowAction } from './RegisterMovementModal'

const RegisterMovementModal = dynamic(
  () => import('./RegisterMovementModal').then((m) => m.RegisterMovementModal),
  { ssr: false },
)

/**
 * Botón + RegisterMovementModal: el alta manual de un movimiento, que cuelga
 * del libro de Caja › Cuentas ("Registrar movimiento"). Antes eran dos
 * componentes casi idénticos (CajaActions/EmptyMovementAction) — con el cierre
 * de caja eliminado, CajaActions quedó reducido a exactamente esto.
 */
export function AddMovementButton({
  label,
  date,
  cutoffMins,
  createCashFlowAction,
  variant = 'primary',
}: {
  label: string
  date: string
  /** Día operativo (ver operating-day.ts): lo reenvía a RegisterMovementModal. */
  cutoffMins: number
  createCashFlowAction: CreateCashFlowAction
  /**
   * `outline` cuando cuelga de un encabezado de sección: es una acción de una o
   * dos veces por día y no le corresponde el único verde de la pantalla.
   * `ghost` en el libro de Cuentas: en el Vagón se usó 0 veces en diez noches,
   * así que está a mano pero no compite con los movimientos.
   */
  variant?: 'primary' | 'outline' | 'ghost'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10',
          variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
          variant === 'outline' && 'border border-border text-foreground hover:bg-accent md:h-9',
          variant === 'ghost' &&
            'px-3 font-medium text-muted-foreground hover:bg-accent hover:text-foreground md:h-9',
        )}
      >
        {variant === 'ghost' && <Plus aria-hidden className="h-4 w-4" />}
        {label}
      </button>
      <RegisterMovementModal
        open={open}
        onClose={() => setOpen(false)}
        date={date}
        cutoffMins={cutoffMins}
        createCashFlowAction={createCashFlowAction}
      />
    </>
  )
}
