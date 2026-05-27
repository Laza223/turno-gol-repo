'use client'

import { useState } from 'react'
import { RegisterMovementModal } from './RegisterMovementModal'
import { CloseDayButton } from './CloseDayButton'

export function CajaActions({ date, balance, isClosed }: { date: string; balance: number; isClosed: boolean }) {
  const [movOpen, setMovOpen] = useState(false)
  if (isClosed) return null
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setMovOpen(true)}
        className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        + Agregar movimiento
      </button>
      <CloseDayButton date={date} balance={balance} />
      <RegisterMovementModal open={movOpen} onClose={() => setMovOpen(false)} />
    </div>
  )
}
