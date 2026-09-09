import { Banknote, Lock, Unlock, Wallet } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { formatArs } from '@/lib/format'
import { formatTimeArt } from '../caja-lib'

/**
 * Encabezado perpetuo de Caja (Fase 1, criterio de salida #1 del contrato):
 * cobrado hoy / pendiente de cobro / estado de la caja, SIEMPRE visibles —
 * a diferencia de OpenDayCard/CierreCard (que se alternan según isClosed),
 * estas 3 cards se renderizan siempre, sea cual sea el estado del día.
 *
 * "Deudas" viene de street-money.service.ts — la MISMA función que alimenta
 * la tab /caja/deudas, así que el número nunca puede divergir entre las dos
 * pantallas (criterio de salida #5, fuente única).
 */
export function CajaHeaderStats({
  collectedTodayCents,
  streetMoneyCents,
  isClosed,
  openedAt,
  closedAt,
}: {
  /** Lo cobrado en el día: `summary.collected` (ver `cashflow/totals.ts`). */
  collectedTodayCents: number
  streetMoneyCents: number
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
