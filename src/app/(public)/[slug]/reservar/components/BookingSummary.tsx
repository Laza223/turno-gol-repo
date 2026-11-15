import Image from 'next/image'
import { formatLabel } from '@/components/public/courtFacets'
import { formatArs, formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import '@/components/booking/reserva.css'

export type BookingSummaryData = {
  tenantName: string
  /** Si el complejo no la cargó, se dice solo la ciudad. */
  address?: string
  city: string
  /** La portada del complejo (o su logo): la miniatura de 64 px. Sin ella va el nombre solo. */
  imageUrl?: string | null
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

/**
 * Miniatura, nombre y dirección del complejo (`.sum__top` del mockup). El nombre es un h2: la
 * pantalla tiene su propio h1. La foto es decorativa: el nombre ya está escrito al lado.
 */
export function SummaryHead({ data }: { data: BookingSummaryData }) {
  const where = [data.address, data.city].filter(Boolean).join(', ')
  return (
    <div className="rv-head">
      {data.imageUrl && <Image src={data.imageUrl} alt="" width={64} height={64} sizes="64px" />}
      <div>
        <h2>
          <b>{data.tenantName}</b>
        </h2>
        <span>{where}</span>
      </div>
    </div>
  )
}

/**
 * QUÉ y CUÁNDO, y la plata si el complejo la muestra, en pares de clave y valor (`.kv`). Con
 * `hidePrices` no sale ningún monto, en ningún texto ni atributo, y tampoco dice cómo se paga en
 * confirmar: eso lo dice la nota que va junto al botón. En la reserva confirmada lo dice `payNote`.
 */
export function SummaryRows({ data }: { data: BookingSummaryData }) {
  const rest = Math.max(data.price - data.depositAmount, 0)
  const withDeposit = data.depositAmount > 0
  return (
    <>
      <dl className="rv-kv">
        <div>
          <dt>Cancha</dt>
          <dd>
            {data.courtName}
            {data.courtFormat ? (
              <>
                {' · '}
                {/* "Fútbol 11" no se parte en dos renglones ("Fútbol / 11") en pantallas angostas. */}
                <span className="whitespace-nowrap">{formatLabel(data.courtFormat)}</span>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Día</dt>
          <dd>{formatDateLong(data.date)}</dd>
        </div>
        <div>
          <dt>Hora</dt>
          <dd>
            {data.timeStart} a {data.timeEnd}
          </dd>
        </div>
        {data.payNote && (
          <div>
            <dt>Pago</dt>
            <dd>{data.payNote}</dd>
          </div>
        )}
      </dl>
      {!data.hidePrices && (
        <>
          <hr className="rv-rule" />
          <dl className="rv-kv">
            <div className={cn(!withDeposit && 'is-key')}>
              <dt>Precio del turno</dt>
              <dd>{formatArs(data.price)}</dd>
            </div>
            {withDeposit && (
              <>
                <div className="is-key">
                  <dt>{data.depositPaid ? 'Seña pagada' : 'Seña a pagar ahora'}</dt>
                  <dd>{formatArs(data.depositAmount)}</dd>
                </div>
                <div>
                  <dt>Resto en el complejo</dt>
                  <dd>{formatArs(rest)}</dd>
                </div>
              </>
            )}
          </dl>
        </>
      )}
    </>
  )
}

/**
 * Resumen del turno en la pantalla de confirmar (`.sum` del mockup): vidrio pintado, porque detrás
 * no pasa nada que desenfocar. La reserva confirmada arma su ticket con las mismas dos piezas.
 */
export default function BookingSummary({
  data,
  className,
}: {
  data: BookingSummaryData
  className?: string
}) {
  return (
    <section aria-label="Tu turno" className={cn('rv-sum glass-painted', className)}>
      <SummaryHead data={data} />
      <SummaryRows data={data} />
    </section>
  )
}
