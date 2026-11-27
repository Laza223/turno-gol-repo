import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'
import type { CSSProperties } from 'react'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { matchTypeLabel, RIVAL_LEVEL_LABELS, whenLabel } from '@/modules/rival/rival-display'
import type { RivalMyMatch } from '@/modules/rival/rival.types'
import { CupoBar, RivalDeadEnd, StampBadge } from '../MatchBits'
import { RIVAL_ACTION, RIVAL_GHOST } from '../rival-classes'
import { RivalScreen } from '../RivalScreen'
import { RivalTabs } from '../RivalTabs'
import '../board.css'

/**
 * La etiqueta de estado (`.pa-tag`): los tonos de siempre. Verde solo "Estás adentro"; el resto
 * apagado, "Se cayó" incluido (al jugador no se le grita).
 */
const TAG = {
  ok: 'pa-tag',
  off: 'pa-tag pa-tag--off',
} as const

/**
 * Mi estado en el partido. Un partido ya jugado no lleva estado: "Ya pasaron" lo dice el título de
 * la sección.
 */
function myState(
  m: RivalMyMatch,
  ended: boolean,
  hideOrganizer: boolean,
): { label: string; tag: string } | null {
  if (m.status === 'canceled') return { label: 'Se cayó', tag: TAG.off }
  if (ended) return null
  // Si todas son tuyas, el rol no distingue nada: no se repite en cada tarjeta.
  if (m.isOrganizer) return hideOrganizer ? null : { label: 'Organizás vos', tag: TAG.off }
  switch (m.myStatus) {
    case 'confirmed':
      return { label: 'Estás adentro', tag: TAG.ok }
    case 'bench':
      return { label: 'En el banco', tag: TAG.off }
    case 'requested':
      return { label: 'Pedido enviado', tag: TAG.off }
    case 'declined':
      return { label: 'Esta vez no hubo lugar', tag: TAG.off }
    default:
      return { label: 'Jugás', tag: TAG.off }
  }
}

/** Lo que dejó de ser "mío": me bajé o me sacaron. */
const isMine = (m: RivalMyMatch) =>
  m.isOrganizer || (m.myStatus !== 'left' && m.myStatus !== 'removed')

function MatchRow({
  m,
  now,
  hideOrganizer,
  index,
}: {
  m: RivalMyMatch
  now: Date
  hideOrganizer: boolean
  index: number
}) {
  const ended = m.startsAt.getTime() <= now.getTime()
  const state = myState(m, ended, hideOrganizer)
  // El organizador entra por el código del link; el resto, por la vista del partido por id.
  const href = m.isOrganizer && m.inviteCode ? `/rival/p/${m.inviteCode}` : `/rival/partido/${m.id}`
  // El cupo solo cuenta si el partido sigue abierto y por jugarse.
  const open = !ended && m.status === 'open'
  const cupo = open
    ? matchTypeLabel({
        seeking: m.seeking,
        seekingPosition: m.seekingPosition,
        capacity: m.capacity,
        confirmedCount: m.confirmedCount,
      })
    : null
  return (
    <li
      className={cn('ri-match glass-painted rv-rise', (ended || m.status !== 'open') && 'rb-past')}
      style={{ '--i': Math.min(index, 10) } as CSSProperties}
    >
      <div className="ri-match__k">
        {state && <span className={state.tag}>{state.label}</span>}
        {m.hasStamp && <StampBadge />}
      </div>
      <p className="ri-match__t col-span-full">
        <Link
          transitionTypes={['nav-forward']}
          href={href}
          aria-label={[m.tenantName, whenLabel(m.startsAt, now), state?.label]
            .filter(Boolean)
            .join(', ')}
          className="rb-stretch"
        >
          {whenLabel(m.startsAt, now)}
        </Link>
      </p>
      <p className="ri-match__m">
        {cupo && (
          <>
            <span className="font-semibold tabular-nums text-portal-ink">{cupo}</span>
            {' · '}
          </>
        )}
        {m.tenantName} · {formatLabel(m.format)} · {RIVAL_LEVEL_LABELS[m.level]}
      </p>
      {open && <CupoBar filled={m.confirmedCount} capacity={m.capacity} />}
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
    <section aria-label={title}>
      <h2 className="ri-group">{title}</h2>
      <ul className="grid gap-3">
        {matches.map((m, i) => (
          <MatchRow key={m.id} m={m} now={now} hideOrganizer={hideOrganizer} index={i} />
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
    <RivalScreen>
      <header className="rv-rise">
        <p className="pa-eyebrow">RIVAL powered by TurnoGol</p>
        <h1 className="rv-h1">Mis partidos</h1>
      </header>
      <RivalTabs current="mis-partidos" />

      {mine.length === 0 ? (
        <RivalDeadEnd
          icon={CalendarPlus}
          title="Todavía no tenés partidos"
          actions={
            <>
              <Link href="/rival/nuevo" className={RIVAL_ACTION}>
                Armar un partido
              </Link>
              <Link href="/rival" className={cn(RIVAL_GHOST, 'w-full')}>
                Ver partidos abiertos
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
    </RivalScreen>
  )
}
