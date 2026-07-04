import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import {
  CalendarX,
  CheckCheck,
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  RotateCcw,
  UserX,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { formatArs } from '@/lib/format'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { CancelBookingButton } from './CancelBookingButton'
import { LeaveReviewButton } from './LeaveReviewButton'

type BookingRow = {
  id: string
  date: string
  time_start: string
  time_end: string
  type: string
  status: string
  price_snapshot: number
  court_name: string
  tenant_name: string
  tenant_slug: string
  has_review: boolean
}

function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

const AR_TZ = 'America/Argentina/Buenos_Aires'

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: AR_TZ,
  })
}

/** Partes para el bloque-fecha de la tarjeta (día grande + mes/día-semana chico). */
function dateParts(dateStr: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${dateStr}T12:00:00Z`)
  return {
    weekday: d.toLocaleDateString('es-AR', { weekday: 'short', timeZone: AR_TZ }),
    day: d.toLocaleDateString('es-AR', { day: '2-digit', timeZone: AR_TZ }),
    month: d.toLocaleDateString('es-AR', { month: 'short', timeZone: AR_TZ }),
  }
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmado',
  pending_payment: 'Pago pendiente',
  completed: 'Completado',
  canceled_refunded: 'Cancelado (con reembolso)',
  canceled_no_refund: 'Cancelado (sin reembolso)',
  no_show: 'Ausente',
  expired: 'Expirado',
}

// §6.5: estado = color + ícono + texto, nunca color solo. Los textos son
// contrato e2e (player-bookings.spec) — el ícono suma, no reemplaza.
const STATUS_ICONS: Record<string, LucideIcon> = {
  confirmed: CheckCircle2,
  pending_payment: Clock,
  completed: CheckCheck,
  canceled_refunded: XCircle,
  canceled_no_refund: XCircle,
  no_show: UserX,
  expired: XCircle,
}

const STATUS_CLASSES: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  pending_payment: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  completed: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  canceled_refunded: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  canceled_no_refund: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  no_show: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20',
  expired: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
}

/** Color del bloque-fecha según estado (esmeralda activo, atenuado si cerrado). */
const DATE_BLOCK_CLASSES: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
}
const DATE_BLOCK_MUTED = 'bg-muted text-muted-foreground ring-border'

export default async function MisReservasPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const today = artToday()
  const tab = searchParams.tab === 'historial' ? 'historial' : 'proximos'

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.execute(sql`
      SELECT b.id, b.date::text, b.time_start::text, b.time_end::text,
             b.type, b.status, b.price_snapshot,
             c.name AS court_name, t.name AS tenant_name, t.slug AS tenant_slug,
             EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS has_review
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.player_id = ${user.playerId}
      ORDER BY b.date DESC, b.time_start DESC
      LIMIT 200
    `),
  )

  const allBookings = rows as unknown as BookingRow[]
  const bookings = allBookings.filter((b) =>
    tab === 'proximos' ? b.date >= today : b.date < today,
  )
  const upcomingCount = allBookings.filter((b) => b.date >= today).length

  const tabClass = (active: boolean) =>
    `flex-1 rounded-full py-2 text-center text-sm font-semibold transition-all duration-150 ${
      active
        ? 'bg-primary text-primary-foreground shadow-md shadow-emerald-600/25 dark:shadow-emerald-500/25'
        : 'text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      {/* Banda hero premium theme-adaptive (puente visual con el home) */}
      <section className="player-hero-band relative isolate overflow-hidden rounded-3xl border px-6 py-7">
        <div
          aria-hidden
          className="hero-glow-blob pointer-events-none absolute right-[-12%] top-[-60%] -z-10 h-[420px] w-[420px] rounded-full blur-[12px]"
        />
        <div
          aria-hidden
          className="player-hero-grid pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundSize: '38px 38px',
            WebkitMaskImage: 'radial-gradient(85% 120% at 100% 0%, #000, transparent 62%)',
            maskImage: 'radial-gradient(85% 120% at 100% 0%, #000, transparent 62%)',
          }}
        />
        <div className="font-logo text-[12px] font-bold uppercase tracking-[.1em] text-emerald-600 dark:text-emerald-400">
          Tu actividad
        </div>
        <h1
          className="mt-2 font-display font-black italic text-foreground"
          style={{ fontSize: 'clamp(26px, 6vw, 36px)', lineHeight: '1', letterSpacing: '-0.03em' }}
        >
          Mis <span className="hero-accent-text">reservas</span>
        </h1>
        <p className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground tabular-nums">
          {upcomingCount > 0
            ? `Tenés ${upcomingCount} turno${upcomingCount === 1 ? '' : 's'} por jugar.`
            : 'Consultá tus próximas reservas y tu historial de partidos.'}
        </p>
      </section>

      {/* Tabs como segmented control premium */}
      <div className="flex gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
        <Link href="/mis-reservas?tab=proximos" className={tabClass(tab === 'proximos')}>
          Próximos
        </Link>
        <Link href="/mis-reservas?tab=historial" className={tabClass(tab === 'historial')}>
          Historial
        </Link>
      </div>

      {/* Booking list */}
      {bookings.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-6 py-14 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            <CalendarX className="h-8 w-8" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
              {tab === 'proximos' ? 'Todavía no tenés reservas' : 'Historial vacío'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tab === 'proximos'
                ? 'Encontrá tu próxima cancha y reservá al instante.'
                : 'Acá van a aparecer tus partidos jugados.'}
            </p>
          </div>
          <Link
            href="/explorar"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
          >
            <Compass className="h-4 w-4" aria-hidden />
            Explorar complejos
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const dp = dateParts(b.date)
            const blockClass = DATE_BLOCK_CLASSES[b.status] ?? DATE_BLOCK_MUTED
            return (
              <li
                key={b.id}
                className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/10 motion-reduce:hover:translate-y-0"
              >
                <div className="flex gap-4">
                  {/* Bloque-fecha */}
                  <div
                    className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-xl py-2 ring-1 ring-inset ${blockClass}`}
                  >
                    <span className="font-logo text-[10px] font-bold uppercase tracking-wide opacity-70">
                      {dp.weekday}
                    </span>
                    <span className="font-display text-xl font-black italic leading-none tabular-nums">
                      {dp.day}
                    </span>
                    <span className="font-logo text-[10px] font-bold uppercase tracking-wide opacity-70">
                      {dp.month}
                    </span>
                  </div>

                  {/* Contenido */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{b.court_name}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0 text-emerald-600/70" aria-hidden />
                          {b.tenant_name}
                        </p>
                      </div>
                      {(() => {
                        const StatusIcon = STATUS_ICONS[b.status]
                        return (
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              STATUS_CLASSES[b.status] ?? STATUS_CLASSES.completed
                            }`}
                          >
                            {StatusIcon && <StatusIcon className="h-3 w-3" aria-hidden />}
                            {STATUS_LABELS[b.status] ?? b.status}
                          </span>
                        )
                      })()}
                    </div>

                    <div className="mt-2.5 flex items-end justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-sm text-foreground tabular-nums">
                          {b.time_start.slice(0, 5)}–{b.time_end.slice(0, 5)}
                        </p>
                        <p className="font-display text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {formatArs(b.price_snapshot)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {b.type === 'fixed' && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
                            Turno fijo
                          </span>
                        )}
                        {b.status === 'confirmed' && (
                          <CancelBookingButton
                            bookingId={b.id}
                            courtName={b.court_name}
                            dateLabel={formatDate(b.date)}
                            timeLabel={`${b.time_start.slice(0, 5)}–${b.time_end.slice(0, 5)}`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {b.status === 'completed' && (
                  <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2">
                    {!b.has_review && (
                      <LeaveReviewButton bookingId={b.id} tenantName={b.tenant_name} />
                    )}
                    <Link
                      href={`/${b.tenant_slug}`}
                      className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Reservar de nuevo
                    </Link>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
