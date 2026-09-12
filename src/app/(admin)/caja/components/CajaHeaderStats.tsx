import { Banknote, Undo2, Wallet } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { formatArs } from '@/lib/format'
import { methodBreakdown } from '../caja-lib'
import type { MethodKey } from '../caja-lib'

/**
 * Los tres números de Cuentas: lo que entró hoy, lo que te deben y lo que
 * debés.
 *
 * Vive en /caja/cuentas y no en la raíz: el encargado que vende no necesita
 * ninguno de los tres, y ocupaban la mitad de la pantalla donde trabaja.
 *
 * "Deudas" y "Devolvés" son las dos direcciones de la plata pendiente y NUNCA
 * se netean: son dos cifras separadas con dos listas debajo. El total de
 * "Deudas" sale de street-money.service.ts — la MISMA función que arma la
 * lista de abajo y el número de la pantalla "Hoy", así que no puede divergir.
 *
 * Las tres cards perdieron su `href`: antes llevaban a la pestaña con el
 * detalle, y ahora el detalle está en esta misma pantalla, debajo.
 */
export function CajaHeaderStats({
  collectedTodayCents,
  collectedByMethod,
  streetMoneyCents,
  streetMoneyCount,
  pendingRefundsCents,
  pendingRefundsCount,
}: {
  /** Lo cobrado en el día: `summary.collected` (ver `cashflow/totals.ts`). */
  collectedTodayCents: number
  /** `summary.collectedByMethod` — sus partes suman `collectedTodayCents`. */
  collectedByMethod: Partial<Record<MethodKey, number>>
  streetMoneyCents: number
  streetMoneyCount: number
  /** Total de `payments` type=refund status=pending — la MISMA fuente que la lista. */
  pendingRefundsCents: number
  pendingRefundsCount: number
}) {
  const methods = methodBreakdown(collectedByMethod)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MetricCard
        label="Cobrado hoy"
        value={formatArs(collectedTodayCents)}
        icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
        accent="emerald"
        footer={
          methods.length > 0 ? (
            <dl className="flex flex-wrap gap-x-4 gap-y-1">
              {methods.map(({ key, label, total }) => (
                <div key={key} className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-xs font-semibold tabular-nums text-foreground">
                    {formatArs(total)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">Todavía no entró plata hoy.</p>
          )
        }
      />
      <MetricCard
        label="Deudas"
        sub={
          streetMoneyCount > 0
            ? `${streetMoneyCount} ${streetMoneyCount === 1 ? 'pendiente' : 'pendientes'} de cobro`
            : 'Nadie te debe nada'
        }
        value={formatArs(streetMoneyCents)}
        icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
        accent={streetMoneyCents > 0 ? 'amber' : 'emerald'}
      />
      <MetricCard
        label="Devolvés"
        sub={
          pendingRefundsCount > 0
            ? `${pendingRefundsCount} ${pendingRefundsCount === 1 ? 'seña' : 'señas'} sin devolver`
            : 'No debés ninguna seña'
        }
        value={formatArs(pendingRefundsCents)}
        icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
        accent={pendingRefundsCents > 0 ? 'red' : 'emerald'}
      />
    </div>
  )
}
