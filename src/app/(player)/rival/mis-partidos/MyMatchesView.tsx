import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import PlayerHeroBand from '@/components/site/PlayerHeroBand'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { TONE_BADGE, type StatusTone } from '@/lib/status-tone'
import { matchTypeLabel, RIVAL_LEVEL_LABELS, whenLabel } from '@/modules/rival/rival-display'
import type { RivalMyMatch } from '@/modules/rival/rival.types'
import { RivalDeadEnd, StampBadge } from '../MatchBits'
import { RIVAL_CTA, RIVAL_GHOST } from '../rival-classes'
import { RivalTabs } from '../RivalTabs'

/**
 * Mi estado en el partido, con el tono de `status-tone`: confirmado en success, lo demás neutral.
 * Un partido ya jugado no lleva estado: "Ya pasaron" lo dice el título de la sección.
 */
function myState(
  m: RivalMyMatch,
  ended: boolean,
  hideOrganizer: boolean,
): { label: string; tone: StatusTone } | null {
  if (m.status === 'canceled') return { label: 'Se cayó', tone: 'neutral' }
  if (ended) return null
  // Si todas son tuyas, el rol no distingue nada: no se repite en cada tarjeta.
  if (m.isOrganizer) return hideOrganizer ? null : { label: 'Organizás vos', tone: 'neutral' }
  switch (m.myStatus) {
    case 'confirmed':
      return { label: 'Estás adentro', tone: 'success' }
    case 'bench':
      return { label: 'En el banco', tone: 'neutral' }
    case 'requested':
      return { label: 'Pedido enviado', tone: 'neutral' }
    case 'declined':
      return { label: 'Esta vez no hubo lugar', tone: 'neutral' }
    default:
      return { label: 'Jugás', tone: 'neutral' }
  }
}

/** Lo que dejó de ser "mío": me bajé o me sacaron. */
const isMine = (m: RivalMyMatch) =>
  m.isOrganizer || (m.myStatus !== 'left' && m.myStatus !== 'removed')

function MatchRow({
  m,
  now,
  hideOrganizer,
}: {
  m: RivalMyMatch
  now: Date
  hideOrganizer: boolean
}) {
  const ended = m.startsAt.getTime() <= now.getTime()
  const state = myState(m, ended, hideOrganizer)
  // El organizador entra por el código del link; el resto, por la vista del partido por id.
  const href = m.isOrganizer && m.inviteCode ? `/rival/p/${m.inviteCode}` : `/rival/partido/${m.id}`
  // El cupo solo cuenta si el partido sigue abierto y por jugarse.
  const cupo =
    !ended && m.status === 'open'
      ? matchTypeLabel({
          seeking: m.seeking,
          seekingPosition: m.seekingPosition,
          capacity: m.capacity,
          confirmedCount: m.confirmedCount,
        })
      : null
  return (
    <li className="relative rounded-2xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-input">
      <div>
        <div className="min-w-0">
          <Link
            href={href}
            aria-label={[m.tenantName, whenLabel(m.startsAt, now), state?.label]
              .filter(Boolean)
              .join(', ')}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background"
          >
            <span className="block whitespace-nowrap font-display text-2xl font-black italic leading-tight tracking-tight tabular-nums text-foreground">
              {whenLabel(m.startsAt, now)}
            </span>
          </Link>
          <p className="mt-1 break-words text-sm font-medium text-muted-foreground">
            {m.tenantName}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {cupo && (
          <>
            <span className="font-semibold tabular-nums text-foreground">{cupo}</span>
            {' · '}
          </>
        )}
        {formatLabel(m.format)} · {RIVAL_LEVEL_LABELS[m.level]}
      </p>
      {(state || m.hasStamp) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {state && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium',
                TONE_BADGE[state.tone],
              )}
            >
              {state.label}
            </span>
          )}
          {m.hasStamp && <StampBadge />}
        </div>
      )}
    </li>
  )
}

function Section({
  title,
  matches,
  now,
  hideOrganizer,
}: {
  title: string
  matches: RivalMyMatch[]
  now: Date
  hideOrganizer: boolean
}) {
  if (matches.length === 0) return null
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className={PORTAL_SECTION_TITLE}>{title}</h2>
      <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {matches.map((m) => (
          <MatchRow key={m.id} m={m} now={now} hideOrganizer={hideOrganizer} />
        ))}
      </ul>
    </section>
  )
}

export function MyMatchesView({ matches, now }: { matches: RivalMyMatch[]; now: Date }) {
  const mine = matches.filter(isMine)
  const isUpcoming = (m: RivalMyMatch) =>
    m.startsAt.getTime() > now.getTime() && m.status === 'open'
  const upcoming = mine.filter(isUpcoming)
  const past = mine.filter((m) => !isUpcoming(m))
  const hideOrganizer = mine.every((m) => m.isOrganizer)
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6 lg:max-w-3xl">
      <PlayerHeroBand eyebrow="RIVAL powered by TurnoGol" title="Mis" accent="partidos" />
      <RivalTabs current="mis-partidos" />

      {mine.length === 0 ? (
        <RivalDeadEnd
          icon={CalendarPlus}
          title="Todavía no tenés partidos"
          actions={
            <>
              <Link href="/rival/nuevo" className={cn(RIVAL_CTA, 'w-full')}>
                Armar un partido
              </Link>
              <Link
                href="/rival"
                className={cn(buttonVariants({ variant: 'ghost' }), RIVAL_GHOST, 'w-full')}
              >
                Ver el tablón
              </Link>
            </>
          }
        >
          <p>Acá van los partidos que armes y en los que te sumes.</p>
        </RivalDeadEnd>
      ) : (
        <>
          <Section title="Próximos" matches={upcoming} now={now} hideOrganizer={hideOrganizer} />
          <Section title="Ya pasaron" matches={past} now={now} hideOrganizer={hideOrganizer} />
        </>
      )}
    </div>
  )
}
