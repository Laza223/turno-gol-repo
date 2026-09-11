'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
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
}: {
  label: string
  date: string
  /** Día operativo (ver operating-day.ts): lo reenvía a RegisterMovementModal. */
  cutoffMins: number
  createCashFlowAction: CreateCashFlowAction
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
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
