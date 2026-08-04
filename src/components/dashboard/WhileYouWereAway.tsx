import Link from 'next/link'
import { CalendarPlus, HandCoins, XCircle } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { formatArs } from '@/lib/format'
import type { WhileAwayItem } from '@/modules/home/home.types'

const ART_TZ = 'America/Argentina/Buenos_Aires'

function clockLabel(at: Date): string {
  return at.toLocaleTimeString('es-AR', { timeZone: ART_TZ, hour: '2-digit', minute: '2-digit' })
}

function lineFor(item: WhileAwayItem): string {
  switch (item.kind) {
    case 'booking_online':
      return `Reserva online — ${item.courtName} ${item.timeLabel}`
    case 'cancellation':
      return `Cancelación — ${item.courtName} ${item.timeLabel}`
    case 'deposit_paid':
      return `Seña acreditada — ${formatArs(item.amountCents)}`
  }
}

const ICON_BY_KIND = {
  booking_online: CalendarPlus,
  cancellation: XCircle,
  deposit_paid: HandCoins,
} as const

/**
 * "Mientras no estabas" (Fase 2, contrato §4.1): feed de lo que pasó sin el
 * admin — reservas online entrantes (el momento-magia: "el sistema vendió
 * por vos"), cancelaciones, señas acreditadas. Server Component: sin
 * Realtime/polling en v1 (mismo criterio que el resto de Hoy).
 */
export function WhileYouWereAway({ items }: { items: WhileAwayItem[] }) {
  return (
    <div className="card-premium rounded-2xl">
      <h2 className="border-b border-border px-4 py-3 text-base font-semibold text-foreground sm:px-5">
        Mientras no estabas
      </h2>
      {items.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Nada nuevo desde la última vez."
          className="rounded-t-none border-0 py-10"
        />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = ICON_BY_KIND[item.kind]
            return (
              <li key={`${item.kind}-${item.bookingId}`}>
                <Link
                  href={`/reservas/${item.bookingId}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-accent/50 sm:px-5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{lineFor(item)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{clockLabel(item.at)}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{item.contactName}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
