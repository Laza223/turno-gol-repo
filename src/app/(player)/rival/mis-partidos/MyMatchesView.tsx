import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import PlayerHeroBand from '@/components/site/PlayerHeroBand'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { TONE_BADGE, type StatusTone } from '@/lib/status-tone'
import { matchTypeLabel, RIVAL_LEVEL_LABELS, whenLabel } from '@/modules/rival/rival-display'
import type { RivalMyMatch } from '@/modules/rival/rival.types'
import { FactPill, RIVAL_CTA, StampBadge } from '../MatchBits'
import { RivalTabs } from '../RivalTabs'

/** Mi estado en el partido, con el tono de `status-tone`: confirmado en success, lo demás neutral. */
function myState(m: RivalMyMatch, ended: boolean): { label: string; tone: StatusTone } {
  if (m.status === 'canceled') return { label: 'Se cayó', tone: 'neutral' }
  if (ended) return { label: 'Jugado', tone: 'neutral' }
  if (m.isOrganizer) return { label: 'Organizás vos', tone: 'neutral' }
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

function MatchRow({ m, now }: { m: RivalMyMatch; now: Date }) {
  const ended = m.startsAt.getTime() <= now.getTime()
  const state = myState(m, ended)
  // El organizador entra por el código del link; el resto, por la vista del partido por id.
  const href = m.isOrganizer && m.inviteCode ? `/rival/p/${m.inviteCode}` : `/rival/partido/${m.id}`
  const title = (
    <span className="break-words font-display text-lg font-black italic leading-tight tracking-tight text-foreground">
      {m.tenantName}
    </span>
  )
  return (
    <li className="relative rounded-2xl border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <Link
            href={href}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {title}
          </Link>
          <p className="text-sm text-muted-foreground">{whenLabel(m.startsAt, now)}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium',
            TONE_BADGE[state.tone],
          )}
        >
          {state.label}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!ended && m.status === 'open' && (
          <FactPill>
            {matchTypeLabel({
              seeking: m.seeking,
              seekingPosition: m.seekingPosition,
              capacity: m.capacity,
              confirmedCount: m.confirmedCount,
            })}
          </FactPill>
        )}
        <FactPill>{formatLabel(m.format)}</FactPill>
        <FactPill>{RIVAL_LEVEL_LABELS[m.level]}</FactPill>
        {m.hasStamp && <StampBadge />}
      </div>
    </li>
  )
}

function Section({ title, matches, now }: { title: string; matches: RivalMyMatch[]; now: Date }) {
  if (matches.length === 0) return null
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="font-display text-lg font-extrabold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      <ul className="space-y-3">
        {matches.map((m) => (
          <MatchRow key={m.id} m={m} now={now} />
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
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <PlayerHeroBand eyebrow="RIVAL powered by TurnoGol" title="Mis" accent="partidos" />
      <RivalTabs current="mis-partidos" />

      {mine.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-6 py-14 text-center shadow-xs">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            <Users className="h-8 w-8" aria-hidden />
          </div>
          <p className="max-w-xs text-base text-foreground">
            Todavía no tenés partidos. Armá uno y pasale el link al grupo.
          </p>
          <Link href="/rival/nuevo" className={RIVAL_CTA}>
            <Plus className="size-4" aria-hidden />
            Armar un partido
          </Link>
        </div>
      ) : (
        <>
          <Section title="Próximos" matches={upcoming} now={now} />
          <Section title="Ya pasaron" matches={past} now={now} />
        </>
      )}
    </div>
  )
}
