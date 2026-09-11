import { Banknote, Undo2, Wallet } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { formatArs } from '@/lib/format'

/**
 * Encabezado perpetuo de Caja: cobrado hoy / lo que te deben / lo que debés,
 * SIEMPRE visibles.
 *
 * "Devolvés" cierra la simetría de las dos direcciones de la plata pendiente:
 * "Deudas" es la que entra, "Devolvés" la que sale. Sin esta card, la única
 * pista de que hay devoluciones sin saldar era entrar a la pestaña.
 *
 * "Deudas" viene de street-money.service.ts — la MISMA función que alimenta
 * la tab /caja/deudas, así que el número nunca puede divergir entre las dos
 * pantallas (criterio de salida #5, fuente única).
 */
export function CajaHeaderStats({
  collectedTodayCents,
  streetMoneyCents,
  pendingRefundsCents,
}: {
  /** Lo cobrado en el día: `summary.collected` (ver `cashflow/totals.ts`). */
  collectedTodayCents: number
  streetMoneyCents: number
  /** Total de `payments` type=refund status=pending — la MISMA fuente que /caja/devoluciones. */
  pendingRefundsCents: number
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MetricCard
        label="Cobrado hoy"
        value={formatArs(collectedTodayCents)}
        icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
        accent="emerald"
      />
      <MetricCard
        label="Deudas"
        sub="Pendiente de cobro"
        value={formatArs(streetMoneyCents)}
        icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
        accent={streetMoneyCents > 0 ? 'amber' : 'emerald'}
        href="/caja/deudas"
        ariaLabel={`Deudas: ${formatArs(streetMoneyCents)} — ver deudas pendientes`}
      />
      <MetricCard
        label="Devolvés"
        sub="Señas sin devolver"
        value={formatArs(pendingRefundsCents)}
        icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
        accent={pendingRefundsCents > 0 ? 'red' : 'emerald'}
        href="/caja/devoluciones"
        ariaLabel={`Devolvés: ${formatArs(pendingRefundsCents)} — ver devoluciones pendientes`}
      />
    </div>
  )
}
