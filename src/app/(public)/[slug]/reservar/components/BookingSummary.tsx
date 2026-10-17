import { CalendarDays, Clock, Goal, MapPin, Wallet } from 'lucide-react'
import { formatLabel } from '@/components/public/courtFacets'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { formatArs, formatDateLong } from '@/lib/format'

export type BookingSummaryData = {
  tenantName: string
  /** Si el complejo no la cargó, se dice solo la ciudad. */
  address?: string
  city: string
  courtName: string
  /** Jugadores por lado de la cancha (`courts.format`): "Cancha 2 · Fútbol 5". */
  courtFormat?: number
  date: string
  timeStart: string
  timeEnd: string
  price: number
  depositAmount: number
  /** El complejo oculta sus precios: se dice CÓMO se paga, sin montos. */
  hidePrices?: boolean
  /** Ya se pagó la seña (pantalla de reserva confirmada): "Seña pagada" en vez de "Seña a pagar ahora". */
  depositPaid?: boolean
  /** Cómo se paga, en palabras, como una fila más (reserva confirmada); va aunque los precios estén ocultos. */
  payNote?: string
}

const ROW = 'flex items-start gap-3'
const ICON = 'mt-0.5 size-5 shrink-0 text-muted-foreground'

/**
 * Resumen del turno en la pantalla de confirmar: QUIÉN, CUÁNDO, DÓNDE y, si el complejo los
 * muestra, la plata. Plano, sin sombra: borde de 1 px sobre `card`. Con `hidePrices` no sale
 * ningún monto, en ningún texto ni atributo, y tampoco dice cómo se paga: eso lo dice la sección
 * de pago, que siempre está debajo.
 */
export default function BookingSummary({ data }: { data: BookingSummaryData }) {
  const rest = Math.max(data.price - data.depositAmount, 0)
  const where = [data.address, data.city].filter(Boolean).join(', ')
  return (
    <section aria-label="Tu turno" className="rounded-xl border border-border bg-card p-4">
      <h2 className={PORTAL_SECTION_TITLE}>{data.tenantName}</h2>
      <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{where}</span>
      </p>
      {/* <div>, no <dl>: son filas ícono+texto, no pares término/definición (axe definition-list). */}
      <div className="mt-4 space-y-3 border-t border-border pt-4 text-base text-foreground">
        <div className={ROW}>
          <CalendarDays className={ICON} aria-hidden />
          <span>{formatDateLong(data.date)}</span>
        </div>
        <div className={ROW}>
          <Clock className={ICON} aria-hidden />
          <span className="tabular-nums">
            {data.timeStart} a {data.timeEnd}
          </span>
        </div>
        <div className={ROW}>
          <Goal className={ICON} aria-hidden />
          <span>
            {data.courtName}
            {data.courtFormat ? (
              <>
                {' · '}
                {/* "Fútbol 11" no se parte en dos renglones ("Fútbol / 11") en pantallas angostas. */}
                <span className="whitespace-nowrap">{formatLabel(data.courtFormat)}</span>
              </>
            ) : null}
          </span>
        </div>
        {data.payNote && (
          <div className={ROW}>
            <Wallet className={ICON} aria-hidden />
            <span>{data.payNote}</span>
          </div>
        )}
      </div>
      {!data.hidePrices && (
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-base">
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Precio del turno</span>
            <span className="tabular-nums text-foreground">{formatArs(data.price)}</span>
          </div>
          {data.depositAmount > 0 && (
            <>
              <div className="flex justify-between gap-4 font-semibold text-foreground">
                <span>{data.depositPaid ? 'Seña pagada' : 'Seña a pagar ahora'}</span>
                <span className="tabular-nums">{formatArs(data.depositAmount)}</span>
              </div>
              <div className="flex justify-between gap-4 text-sm text-muted-foreground">
                <span>Resto en el complejo</span>
                <span className="tabular-nums">{formatArs(rest)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
