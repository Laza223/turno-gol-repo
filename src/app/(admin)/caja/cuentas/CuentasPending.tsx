'use client'

import { useState, type ReactNode } from 'react'
import type { StreetMoneyRow } from '@/modules/cashflow/street-money.service'
import { StreetMoneyChargeDialog } from '../deudas/StreetMoneyChargeDialog'
import { StreetMoneyCancelTabDialog } from '../deudas/StreetMoneyCancelTabDialog'
import { PendingLines } from './PendingLines'

/**
 * Lo sin cobrar de Cuentas con sus diálogos: el cobro y la anulación son los
 * mismos de antes (`StreetMoneyChargeDialog`, `StreetMoneyCancelTabDialog`),
 * con las mismas Server Actions. Este componente queda montado aunque la lista
 * se vacíe, así el diálogo de cobro sobrevive al `revalidatePath` que saca la
 * fila recién cobrada. Se abre ENCIMA del modal de la lista, que sigue abierto
 * para cobrar el siguiente.
 */
export function CuentasPending({
  rows,
  windowNote,
}: {
  rows: StreetMoneyRow[]
  windowNote?: ReactNode
}) {
  const [charging, setCharging] = useState<StreetMoneyRow | null>(null)
  const [canceling, setCanceling] = useState<StreetMoneyRow | null>(null)
  // Instante fijo por render: "hace X" no cambia sin refresh.
  const [nowMs] = useState(() => Date.now())

  return (
    <>
      <PendingLines
        rows={rows}
        nowMs={nowMs}
        onCharge={setCharging}
        onCancelTab={setCanceling}
        windowNote={windowNote}
      />
      <StreetMoneyChargeDialog row={charging} onClose={() => setCharging(null)} />
      <StreetMoneyCancelTabDialog row={canceling} onClose={() => setCanceling(null)} />
    </>
  )
}
