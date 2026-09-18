'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import type { CreateCashFlowAction } from './RegisterMovementModal'

const RegisterMovementModal = dynamic(
  () => import('./RegisterMovementModal').then((m) => m.RegisterMovementModal),
  { ssr: false },
)

/**
 * Botón + RegisterMovementModal, reusado en dos contextos: el header de
 * /caja ("+ Agregar movimiento") y el CTA del EmptyState de MovementsList
 * ("Registrar el primer movimiento"). Antes eran dos componentes casi
 * idénticos (CajaActions/EmptyMovementAction) — con el cierre de caja
 * eliminado, CajaActions quedó reducido a exactamente esto.
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
   */
  variant?: 'primary' | 'outline'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10',
          variant === 'primary'
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'border border-border text-foreground hover:bg-accent md:h-9',
        )}
      >
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
