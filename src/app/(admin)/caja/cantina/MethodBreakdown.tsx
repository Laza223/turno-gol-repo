import { ArrowRightLeft, Banknote, Coins, CreditCard, type LucideIcon } from 'lucide-react'
import { formatArs } from '@/lib/format'
import type { MethodKey, MethodTotal } from '../caja-lib'
import { Disclosure } from '../components/Disclosure'

const METHOD_ICON: Record<MethodKey, LucideIcon> = {
  cash: Banknote,
  transfer: ArrowRightLeft,
  mercadopago: CreditCard,
  other: Coins,
}

/**
 * Referencia del arqueo, no algo que se mira en cada visita (H002, auditoría
 * de coherencia 2026-09-09 §11) — plegado por defecto detrás de un
 * `Disclosure` que sí dice, en el encabezado, qué hay adentro.
 */
export function MethodBreakdown({ methods }: { methods: MethodTotal[] }) {
  if (methods.length === 0) return null

  return (
    <Disclosure
      heading="Desglose por método"
      hint="Neto del día: ingresos menos gastos por método."
      hideHintOnMobile
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {methods.map(({ key, label, total }) => {
          const Icon = METHOD_ICON[key]
          return (
            <div key={key} className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                  {total < 0 ? `−${formatArs(-total)}` : formatArs(total)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </Disclosure>
  )
}
