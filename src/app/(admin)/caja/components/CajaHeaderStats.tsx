import { Banknote, Lock, Undo2, Unlock, Wallet } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { formatArs } from '@/lib/format'
import { formatTimeArt } from '../caja-lib'

/**
 * Encabezado perpetuo de Caja (Fase 1, criterio de salida #1 del contrato):
 * cobrado hoy / lo que te deben / lo que debés / estado de la caja, SIEMPRE
 * visibles — a diferencia de OpenDayCard/CierreCard (que se alternan según
 * isClosed), estas 4 cards se renderizan siempre, sea cual sea el estado del día.
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
  isClosed,
  openedAt,
  closedAt,
}: {
  /** Lo cobrado en el día: `summary.collected` (ver `cashflow/totals.ts`). */
  collectedTodayCents: number
  streetMoneyCents: number
  /** Total de `payments` type=refund status=pending — la MISMA fuente que /caja/devoluciones. */
  pendingRefundsCents: number
  isClosed: boolean
  openedAt: Date | null
  closedAt: Date | null
}) {
  const estado =
    isClosed && closedAt
      ? `Cerrada — ${formatTimeArt(closedAt)} hs`
      : openedAt
        ? `Abierta — desde las ${formatTimeArt(openedAt)} hs`
        : 'Sin abrir'

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <MetricCard
        label="Estado de caja"
        value={estado}
        icon={
          isClosed ? (
            <Lock className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Unlock className="h-4 w-4" aria-hidden="true" />
          )
        }
        accent={isClosed ? 'slate' : 'emerald'}
      />
    </div>
  )
}
