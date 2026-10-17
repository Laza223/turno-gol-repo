import Link from 'next/link'
import { Pager } from '@/components/ui/pager'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { StatusBadge } from '@/components/ui/status-badge'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import { formatArs } from '@/lib/format'
import { TONE_BADGE } from '@/lib/status-tone'
import type { PlayerBookingRow } from '@/modules/super-admin/players.service'
import { formatDayStr, formatTimeRange } from '../../../_components/sa-format'

function Origin({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE.neutral}`}
    >
      {online ? 'Online' : 'Cargada por el complejo'}
    </span>
  )
}

function BookingStatus({ row }: { row: PlayerBookingRow }) {
  const v = bookingBadgeVisual({
    status: row.status,
    type: row.type,
    depositStatus: row.depositStatus,
  })
  return <StatusBadge visual={{ icon: v.icon, label: v.label, tone: v.tone }} />
}

/** Historial de reservas del jugador, en todos los complejos. */
export function PlayerBookingsTable({
  rows,
  page,
  total,
  pageSize,
  hrefFor,
}: {
  rows: PlayerBookingRow[]
  /** Página actual, 0-based. */
  page: number
  total: number
  pageSize: number
  hrefFor: (page: number) => string
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Reservas</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border/60 bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {total > 0 ? (
            <>
              Esa página no existe.{' '}
              <Link
                href={hrefFor(0)}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Volver al principio
              </Link>
            </>
          ) : (
            'Todavía no hizo reservas.'
          )}
        </p>
      ) : (
        <>
          <ResponsiveList
            table={
              <table className="w-full text-left">
                <caption className="sr-only">Reservas del jugador</caption>
                <thead>
                  <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="p-3">
                      Día
                    </th>
                    <th scope="col" className="p-3">
                      Horario
                    </th>
                    <th scope="col" className="p-3">
                      Complejo
                    </th>
                    <th scope="col" className="p-3">
                      Cancha
                    </th>
                    <th scope="col" className="p-3">
                      Origen
                    </th>
                    <th scope="col" className="p-3">
                      Estado
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Precio
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm text-foreground">
                  {rows.map((b) => (
                    <tr key={b.id}>
                      <td className="p-3 tabular-nums">{formatDayStr(b.date)}</td>
                      <td className="p-3 tabular-nums">
                        {formatTimeRange(b.timeStart, b.timeEnd)}
                      </td>
                      <td className="p-3">{b.tenantName}</td>
                      <td className="p-3 text-muted-foreground">{b.courtName ?? '—'}</td>
                      <td className="p-3">
                        <Origin online={b.online} />
                      </td>
                      <td className="p-3">
                        <BookingStatus row={b} />
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatArs(b.priceSnapshot)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            cards={
              <ul className="divide-y divide-border">
                {rows.map((b) => (
                  <li key={b.id} className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium tabular-nums text-foreground">
                        {formatDayStr(b.date)} · {formatTimeRange(b.timeStart, b.timeEnd)}
                      </p>
                      <BookingStatus row={b} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {b.tenantName}
                      {b.courtName ? ` · ${b.courtName}` : ''}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <Origin online={b.online} />
                      <span className="text-sm font-medium tabular-nums">
                        {formatArs(b.priceSnapshot)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            }
          />
          <Pager
            label="Paginación de reservas"
            page={page}
            total={total}
            pageSize={pageSize}
            shown={rows.length}
            hrefFor={hrefFor}
          />
        </>
      )}
    </section>
  )
}
