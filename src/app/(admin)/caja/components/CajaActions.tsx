'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { CloseDayButton } from './CloseDayButton'

const RegisterMovementModal = dynamic(
  () => import('./RegisterMovementModal').then((m) => m.RegisterMovementModal),
  { ssr: false },
)

export function CajaActions({
  date,
  totalIncome,
  totalExpense,
  balance,
  isClosed,
}: {
  date: string
  totalIncome: number
  totalExpense: number
  balance: number
  isClosed: boolean
}) {
  const [movOpen, setMovOpen] = useState(false)
  if (isClosed) return null
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setMovOpen(true)}
        className="h-11 md:h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        + Agregar movimiento
      </button>
      <CloseDayButton date={date} totalIncome={totalIncome} totalExpense={totalExpense} balance={balance} />
      <RegisterMovementModal open={movOpen} onClose={() => setMovOpen(false)} date={date} />
    </div>
  )
}
