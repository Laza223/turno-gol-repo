'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { CreateCashFlowAction } from './RegisterMovementModal'

const RegisterMovementModal = dynamic(
  () => import('./RegisterMovementModal').then((m) => m.RegisterMovementModal),
  { ssr: false },
)

/**
 * CTA del EmptyState "Sin movimientos por ahora" (caja/page.tsx). Abre el
 * mismo RegisterMovementModal que ya monta CajaActions, sin duplicar su
 * wiring: el modal solo necesita `date` + `createCashFlowAction` (no depende
 * de los totales/closeDayAction de CloseDayButton), así que este componente
 * es un botón + el modal, nada más.
 */
export function EmptyMovementAction({
  date,
  createCashFlowAction,
}: {
  date: string
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
        Registrar el primer movimiento
      </button>
      <RegisterMovementModal
        open={open}
        onClose={() => setOpen(false)}
        date={date}
        createCashFlowAction={createCashFlowAction}
      />
    </>
  )
}
