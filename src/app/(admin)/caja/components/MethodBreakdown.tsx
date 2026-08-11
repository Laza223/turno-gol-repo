import { ArrowRightLeft, Banknote, Coins, CreditCard, type LucideIcon } from 'lucide-react'
import { formatArsContable } from '@/lib/format'
import type { MethodKey, MethodTotal } from '../caja-lib'

const METHOD_ICON: Record<MethodKey, LucideIcon> = {
  cash: Banknote,
  transfer: ArrowRightLeft,
  mercadopago: CreditCard,
  other: Coins,
}

export function MethodBreakdown({ methods }: { methods: MethodTotal[] }) {
  if (methods.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Desglose por método</h2>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Neto del día: ingresos menos gastos por método.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {methods.map(({ key, label, total }) => {
          const Icon = METHOD_ICON[key]
          return (
            <div key={key} className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                  {total < 0 ? `−${formatArsContable(-total)}` : formatArsContable(total)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
