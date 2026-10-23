import { Check } from 'lucide-react'
import Link from 'next/link'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { TONE_BADGE, type StatusTone } from '@/lib/status-tone'
import { RIVAL_LEVEL_LABELS, RIVAL_POSITION_LABELS, whenLabel } from '@/modules/rival/rival-display'
import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import { FactPill, RIVAL_CTA, StampBadge } from '../../MatchBits'
import { OrganizerActions } from './OrganizerActions'
import { ShirtGrid } from './ShirtGrid'

const MEMBER_SINCE = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Argentina/Buenos_Aires',
})

function initialsOf(shortName: string): string {
  return shortName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function Avatar({ entry }: { entry: RivalRosterEntry }) {
  return entry.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={entry.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-display text-sm font-black italic text-foreground"
    >
      {initialsOf(entry.shortName)}
    </span>
  )
}

const STATUS_BADGE: Partial<
  Record<RivalRosterEntry['status'], { label: string; tone: StatusTone }>
> = {
  confirmed: { label: 'Confirmado', tone: 'success' },
  bench: { label: 'En el banco', tone: 'neutral' },
  requested: { label: 'Pidió sumarse', tone: 'neutral' },
}

/** Una fila del plantel. Con `detail` (solo el organizador) suma la ficha de la spec §6. */
function PersonRow({ entry, detail }: { entry: RivalRosterEntry; detail: boolean }) {
  const badge = detail ? STATUS_BADGE[entry.status] : undefined
  const facts = detail
    ? [
        entry.position ? RIVAL_POSITION_LABELS[entry.position] : null,
        entry.zone,
        entry.gamesPlayed !== null
          ? `${entry.gamesPlayed} ${entry.gamesPlayed === 1 ? 'partido jugado' : 'partidos jugados'}`
          : null,
        entry.memberSince ? `En TurnoGol desde ${MEMBER_SINCE.format(entry.memberSince)}` : null,
      ].filter((f): f is string => f !== null)
    : []
  return (
    <li className="flex items-start gap-3 py-2">
      <Avatar entry={entry} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-base font-medium text-foreground">
          {entry.role === 'rival_captain' ? 'Equipo rival: ' : ''}
          {entry.shortName}
          {entry.isMe && <span className="font-normal text-muted-foreground"> (vos)</span>}
        </p>
        {facts.length > 0 && <p className="text-sm text-muted-foreground">{facts.join(' · ')}</p>}
      </div>
      {badge && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium',
            TONE_BADGE[badge.tone],
          )}
        >
          {badge.label}
        </span>
      )}
    </li>
  )
}

function PeopleSection({
  title,
  entries,
  detail,
}: {
  title: string
  entries: RivalRosterEntry[]
  detail: boolean
}) {
  if (entries.length === 0) return null
  return (
    <section aria-label={title} className="space-y-1">
      <h2 className="font-display text-lg font-extrabold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <PersonRow key={e.participantId} entry={e} detail={detail} />
        ))}
      </ul>
    </section>
  )
}

/** Mi estado cuando juego o pedí sumarme (la acción de bajarse es del PR3). */
function myStatusLine(status: RivalRosterEntry['status']): string | null {
  switch (status) {
    case 'confirmed':
      return 'Estás adentro. Nos vemos en la cancha.'
    case 'bench':
      return 'Estás en el banco. Si alguien se baja, entrás vos.'
    case 'requested':
      return 'Tu pedido está enviado. Te avisamos por mail si te aceptan.'
    case 'declined':
      return 'Esta vez no hubo lugar.'
    default:
      return null
  }
}

type Props = {
  match: RivalPublicMatch
  /** `true` si hay un jugador con sesión mirando. */
  signedIn: boolean
  /** Lo que `getRoster` deja ver a este jugador (vacío sin sesión). */
  roster: RivalRosterEntry[]
  shareUrl: string
  /** Recién creado (`?creado=1`): muestra el aviso del organizador. */
  justCreated: boolean
  now: Date
  cancelAction: (matchId: string) => Promise<ActionResult>
}

/**
 * La vista del partido por link (`/rival/p/[code]`), según quién mira (spec §5.2, §5.3, §6):
 * sin sesión no hay personas; con sesión, nombre corto y foto de los confirmados; el organizador
 * ve además el banco, los pedidos y la ficha. "Voy", "Me bajo" y "Avisar al grupo" son del PR3
 * y publicar en el tablón del PR4: acá no hay botones muertos.
 */
export function MatchView({
  match,
  signedIn,
  roster,
  shareUrl,
  justCreated,
  now,
  cancelAction,
}: Props) {
  const canceled = match.status === 'canceled'
  const ended = !canceled && match.startsAt.getTime() <= now.getTime()
  const open = !canceled && !ended
  const me = roster.find((r) => r.isMe)
  const confirmed = roster.filter((r) => r.status === 'confirmed')
  const bench = roster.filter((r) => r.status === 'bench')
  const requested = roster.filter((r) => r.status === 'requested')

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      {justCreated && match.isOrganizer && open && (
        <p
          role="status"
          className="flex items-center gap-2.5 rounded-2xl bg-muted/50 p-4 text-base font-medium text-foreground"
        >
          <Check aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          Listo. Ahora pasale el link al grupo.
        </p>
      )}

      <section
        aria-labelledby="rival-partido"
        className="reserva-receipt-card space-y-3 rounded-2xl p-5"
      >
        <p className="font-logo text-[12px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          RIVAL powered by TurnoGol
        </p>
        <h1
          id="rival-partido"
          className="break-words font-display text-2xl font-black italic leading-tight tracking-tight text-foreground"
        >
          {match.tenantName}
        </h1>
        <p className="text-base text-foreground">{whenLabel(match.startsAt, now)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <FactPill>{formatLabel(match.format)}</FactPill>
          <FactPill>{RIVAL_LEVEL_LABELS[match.level]}</FactPill>
          {match.hasStamp && <StampBadge />}
          {ended && <FactPill>Jugado</FactPill>}
        </div>
      </section>

      {canceled ? (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-xs">
          <p className="font-display text-2xl font-black italic text-foreground">
            Este partido se cayó.
          </p>
          <Link href="/rival/nuevo" className={RIVAL_CTA}>
            Armar otro
          </Link>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <ShirtGrid capacity={match.capacity} confirmed={match.confirmedCount} />
            {me && open && myStatusLine(me.status) && (
              <p className="mt-4 text-base text-foreground">{myStatusLine(me.status)}</p>
            )}
          </section>

          {signedIn && match.isOrganizer ? (
            <>
              <PeopleSection title="Confirmados" entries={confirmed} detail />
              <PeopleSection title="El banco" entries={bench} detail />
              <PeopleSection title="Pedidos" entries={requested} detail />
            </>
          ) : (
            signedIn && <PeopleSection title="Quiénes van" entries={confirmed} detail={false} />
          )}

          {open && match.isOrganizer && (
            <OrganizerActions matchId={match.id} shareUrl={shareUrl} cancelAction={cancelAction} />
          )}
        </>
      )}
    </div>
  )
}
