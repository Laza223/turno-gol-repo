import { CalendarDays, Clock, MapPin } from 'lucide-react'
import { formatArs, formatDateLong } from '@/lib/format'

export type BookingSummaryData = {
  tenantName: string
  city: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  price: number
  depositAmount: number
}

/**
 * Resumen del turno en el checkout — misma receta que el comprobante del
 * éxito (`.reserva-receipt-card`): light = card blanca elevada con tinte
 * emerald, dark = slab glass. Chunking §9: QUIÉN / CUÁNDO / PLATA.
 */
export default function BookingSummary({ data }: { data: BookingSummaryData }) {
  const rest = Math.max(data.price - data.depositAmount, 0)
  return (
    <div className="reserva-receipt-card relative space-y-4 overflow-hidden rounded-2xl p-5">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">{data.tenantName}</h2>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden />{' '}
          {data.city}
        </p>
      </div>
      {/* <div>, no <dl>: son filas ícono+texto, no pares término/definición (axe definition-list). */}
      <div className="space-y-2.5 border-t border-border pt-4 text-sm dark:border-white/10">
        <div className="flex items-center gap-2 text-foreground/90">
          <CalendarDays className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
          <span>{formatDateLong(data.date)}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground/90">
          <Clock className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
          <span className="tabular-nums">
            {data.timeStart}–{data.timeEnd} · {data.courtName}
          </span>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-border pt-4 text-sm dark:border-white/10">
        <div className="flex justify-between text-muted-foreground">
          <span>Precio del turno</span>
          <span className="tabular-nums text-foreground">{formatArs(data.price)}</span>
        </div>
        {data.depositAmount > 0 ? (
          <>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="font-semibold text-foreground">Seña a pagar ahora</span>
              <span className="font-display text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatArs(data.depositAmount)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Resto en el complejo</span>
              <span className="tabular-nums">{formatArs(rest)}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Este complejo no requiere seña. Pagás el total en el complejo.
          </p>
        )}
      </div>
    </div>
  )
}
