import type { ActionResult } from '@/shared/types/action-result'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { capitalizeFirst, formatArs } from '@/lib/format'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import { StatusBadge } from '@/components/ui/status-badge'
import { resolveDepositDisplayStatus } from '@/app/(admin)/reservas/deposit-display'
import type { BanCheckResult } from '@/modules/bans/ban.service'
import type { ManualBanDuration } from '@/modules/bans/ban.schema'
import type { PlayerProfile, PlayerStats, PlayerBookingRow, PlayerFixedSlotRow } from '../queries'
import { BanPlayerControls } from './BanPlayerControls'
import { PlayerTagsCard, type SetPlayerTagsFn } from './PlayerTagsCard'
import { PlayerFixedSlotsCard, type UnlinkContactFn } from './PlayerFixedSlotsCard'

const TYPE_LABELS: Record<string, string> = {
  spontaneous: 'Online',
  fixed: 'Turno fijo',
  block: 'Bloqueo',
}

/**
 * H128 (auditoría de coherencia 2026-09): el estado de la PLATA de cada turno
 * del historial, no el estado del sistema (regla del dueño #4, brief §8).
 * `null` cuando no hay nada cobrable que decir — un `no_show`/`expired` no es
 * deuda (veto "No-show NO es deuda") y una cancelación sin seña no tiene plata
 * que devolver.
 */
function paymentStatus(
  b: Pick<
    PlayerBookingRow,
    'status' | 'depositAmount' | 'depositStatus' | 'refundState' | 'pending' | 'totalPaid'
  >,
): { text: string; tone: 'paid' | 'pending' | 'neutral' } | null {
  if (b.status === 'canceled_refunded' || b.status === 'canceled_no_refund') {
    if (b.depositAmount <= 0) return null
    const display = resolveDepositDisplayStatus(b.depositStatus, b.refundState)
    if (display === 'refunded') return { text: 'Devuelto', tone: 'neutral' }
    if (display === 'refund_pending') return { text: 'A devolver', tone: 'pending' }
    return null
  }
  if (b.status === 'no_show' || b.status === 'expired') return null
  if (b.pending > 0) return { text: 'Pendiente', tone: 'pending' }
  if (b.totalPaid > 0) return { text: 'Cobrado', tone: 'paid' }
  return null
}

const PAYMENT_TONE_CLASS: Record<'paid' | 'pending' | 'neutral', string> = {
  paid: 'text-emerald-700 dark:text-emerald-400',
  pending: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-muted-foreground',
}

function formatDate(dateStr: string): string {
  return capitalizeFirst(
    new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  )
}

function formatDateArt(date: Date): string {
  return capitalizeFirst(
    date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    }),
  )
}

type Props = {
  profile: PlayerProfile
  stats: PlayerStats
  history: PlayerBookingRow[]
  ban: BanCheckResult
  fixedSlots: PlayerFixedSlotRow[]
  banPlayerAction: (
    playerId: string,
    reason: string,
    duration: ManualBanDuration,
  ) => Promise<ActionResult>
  liftPlayerBanAction: (playerId: string) => Promise<ActionResult>
  setPlayerTagsAction: SetPlayerTagsFn
  unlinkContactAction: UnlinkContactFn
}

/**
 * Vista presentacional de /jugadores/[playerId]: datos del jugador, stats,
 * indicador de softban (tenant_player_bans vía checkPlayerBanned) e historial
 * de reservas. Extraída de page.tsx, que solo aporta auth (requireOperatorStaff)
 * + el fetch (getPlayerProfile/getPlayerStats/getPlayerBookingHistory/checkPlayerBanned).
 */
export function JugadorProfileView({
  profile,
  stats,
  history,
  ban,
  fixedSlots,
  banPlayerAction,
  liftPlayerBanAction,
  setPlayerTagsAction,
  unlinkContactAction,
}: Props) {
  // H126 (auditoría de coherencia 2026-09): la tasa de ausencia sin la base
  // del cálculo no se puede leer (Nielsen #1) y necesita el tratamiento
  // visual de advertencia que le falta (LEY-von-restorff, MASTER §9) cuando
  // el jugador acumula ausencias — no la misma tarjeta neutra que las demás.
  // H135 (auditoría de coherencia 2026-09): cuando la cuenta no tiene
  // teléfono cargado, se deriva del turno fijo vinculado — mismo patrón de
  // derivación que ya usa /jugadores para las personas "Sin cuenta".
  const derivedPhone = profile.phone ?? fixedSlots.find((s) => s.contactPhone)?.contactPhone ?? null
  const played = stats.completed + stats.noShow
  const noShowWarning = played > 0 && stats.noShowRate >= 50
  const statCards: Array<{ label: string; value: string; subtitle?: string; warn?: boolean }> = [
    { label: 'Reservas totales', value: String(stats.total) },
    { label: 'Completadas', value: String(stats.completed) },
    { label: 'Ausencias', value: String(stats.noShow) },
    {
      label: 'Tasa de ausencia',
      value: `${stats.noShowRate}%`,
      subtitle:
        played > 0
          ? `${stats.noShow} de ${played} turnos jugados o ausentes`
          : 'Sin turnos jugados ni ausencias',
      warn: noShowWarning,
    },
  ]

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <Link
        href="/jugadores"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> Personas
      </Link>

      <div className="card-premium rounded-xl p-6">
        <h1 className="text-2xl font-semibold text-foreground">{profile.name}</h1>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
            <dd className="text-foreground">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Teléfono</dt>
            <dd className="text-foreground">{derivedPhone ?? '—'}</dd>
          </div>
          {profile.firstSeenAt && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Cliente desde
              </dt>
              <dd className="text-foreground">{formatDateArt(new Date(profile.firstSeenAt))}</dd>
            </div>
          )}
        </dl>
      </div>

      {ban.banned && (
        <div className="card-premium rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
            Bloqueado para reservar online
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/80">
            {ban.reason}
            {ban.until ? ` Hasta el ${formatDateArt(ban.until)}.` : ' Sin fecha de fin.'}
          </p>
        </div>
      )}

      <BanPlayerControls
        playerId={profile.playerId}
        playerName={profile.name}
        ban={ban}
        banPlayerAction={banPlayerAction}
        liftPlayerBanAction={liftPlayerBanAction}
      />

      {/*
        H133/H128 (auditoría de coherencia 2026-09): regla del dueño #4
        (brief §8) — la app muestra el estado de la PLATA antes que las
        estadísticas de comportamiento. El historial con montos y cobro sube
        acá arriba; los 4 KPIs analíticos (regla #1: "ocasionales") bajan al
        final de la ficha.
      */}
      <section className="card-premium rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground">Historial de reservas</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Sin reservas registradas.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {history.map((b) => {
              const visual = bookingBadgeVisual(b)
              const money = paymentStatus(b)
              return (
                <li key={b.id}>
                  <Link
                    href={`/reservas/${b.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {formatDate(b.date)} · {b.timeStart.slice(0, 5)}–{b.timeEnd.slice(0, 5)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.courtName} · {TYPE_LABELS[b.type] ?? b.type}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-foreground">{formatArs(b.priceSnapshot)}</p>
                      <StatusBadge visual={visual} />
                      {money && (
                        <p className={cn('text-xs font-medium', PAYMENT_TONE_CLASS[money.tone])}>
                          {money.text}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <PlayerTagsCard
        playerId={profile.playerId}
        tags={profile.tags}
        setPlayerTagsAction={setPlayerTagsAction}
      />

      <PlayerFixedSlotsCard
        playerId={profile.playerId}
        playerName={profile.name}
        slots={fixedSlots}
        unlinkContactAction={unlinkContactAction}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={cn(
              'card-premium rounded-xl p-4',
              card.warn &&
                'border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
            )}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p
              className={cn(
                'mt-1 text-xl font-semibold',
                card.warn ? 'text-amber-800 dark:text-amber-400' : 'text-foreground',
              )}
            >
              {card.value}
            </p>
            {card.subtitle && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{card.subtitle}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
