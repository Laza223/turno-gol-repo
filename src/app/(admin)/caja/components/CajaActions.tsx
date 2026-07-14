'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { CloseDayButton, type CloseDayAction } from './CloseDayButton'
import type { CreateCashFlowAction } from './RegisterMovementModal'

const RegisterMovementModal = dynamic(
  () => import('./RegisterMovementModal').then((m) => m.RegisterMovementModal),
  { ssr: false },
)

// Jerarquía §6.2 (un primario por vista): "Agregar movimiento" es la acción
// frecuente del día → primario token AA. "Cerrar caja" pasa una vez por día
// → outline; su peso lo pone el ritual (CierreCard), no el botón.
export function CajaActions({
  date,
  totalIncome,
  totalExpense,
  balance,
  cashTotal,
  isClosed,
  createCashFlowAction,
  closeDayAction,
}: {
  date: string
  totalIncome: number
  totalExpense: number
  balance: number
  cashTotal: number
  isClosed: boolean
  createCashFlowAction: CreateCashFlowAction
  closeDayAction: CloseDayAction
}) {
  const [movOpen, setMovOpen] = useState(false)
  if (isClosed) return null
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setMovOpen(true)}
        className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
      >
        + Agregar movimiento
      </button>
      <CloseDayButton
        date={date}
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        balance={balance}
        cashTotal={cashTotal}
        closeDayAction={closeDayAction}
      />
      <RegisterMovementModal
        open={movOpen}
        onClose={() => setMovOpen(false)}
        date={date}
        createCashFlowAction={createCashFlowAction}
      />
    </div>
  )
}
