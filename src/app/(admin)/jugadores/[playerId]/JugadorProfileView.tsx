import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { capitalizeFirst, formatArs } from '@/lib/format'
import type { BanCheckResult } from '@/modules/bans/ban.service'
import type { ManualBanDuration } from '@/modules/bans/ban.schema'
import type { PlayerProfile, PlayerStats, PlayerBookingRow, PlayerFixedSlotRow } from '../queries'
import { BanPlayerControls } from './BanPlayerControls'
import { PlayerTagsCard, type SetPlayerTagsFn } from './PlayerTagsCard'
import { PlayerFixedSlotsCard, type UnlinkContactFn } from './PlayerFixedSlotsCard'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  no_show: 'Ausente',
  canceled_refunded: 'Cancelada (con reembolso)',
  canceled_no_refund: 'Cancelada (sin reembolso)',
  expired: 'Expirada',
}

const TYPE_LABELS: Record<string, string> = {
  spontaneous: 'Online',
  fixed: 'Turno fijo',
  block: 'Bloqueo',
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

type ActionResult = { success: boolean; error?: string }

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
  const statCards: Array<[string, string]> = [
    ['Reservas totales', String(stats.total)],
    ['Completadas', String(stats.completed)],
    ['Ausencias', String(stats.noShow)],
    ['Tasa de ausencia', `${stats.noShowRate}%`],
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
            <dd className="text-foreground">{profile.phone ?? '—'}</dd>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map(([label, value]) => (
          <div key={label} className="card-premium rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
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

      <section className="card-premium rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground">Historial de reservas</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Sin reservas registradas.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {history.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-medium text-foreground">
                    {formatDate(b.date)} · {b.timeStart.slice(0, 5)}–{b.timeEnd.slice(0, 5)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.courtName} · {TYPE_LABELS[b.type] ?? b.type}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-foreground">{formatArs(b.priceSnapshot)}</p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABELS[b.status] ?? b.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
