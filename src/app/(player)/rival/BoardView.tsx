import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Users } from 'lucide-react'
import PlayerHeroBand from '@/components/site/PlayerHeroBand'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import {
  groupBoardByDay,
  matchTypeLabel,
  RIVAL_LEVEL_LABELS,
  whenLabel,
} from '@/modules/rival/rival-display'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import { FactPill, RIVAL_CTA, StampBadge } from './MatchBits'
import { RivalTabs } from './RivalTabs'

const CHIP =
  'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** Selector de complejo: "Todos" y los complejos que tienen publicaciones. Es navegación (`?complejo=`). */
function TenantFilter({
  tenants,
  selectedId,
}: {
  tenants: { id: string; name: string }[]
  selectedId: string | null
}) {
  const chip = (active: boolean) =>
    cn(
      CHIP,
      active
        ? 'border-foreground bg-foreground/5 font-semibold text-foreground'
        : 'border-border bg-card text-foreground hover:border-input',
    )
  return (
    <nav
      aria-label="Complejo"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]"
    >
      <Link
        href="/rival"
        aria-current={selectedId === null ? 'page' : undefined}
        className={chip(selectedId === null)}
      >
        Todos
      </Link>
      {tenants.map((t) => (
        <Link
          key={t.id}
          href={`/rival?complejo=${t.id}`}
          aria-current={selectedId === t.id ? 'page' : undefined}
          className={chip(selectedId === t.id)}
        >
          {t.name}
        </Link>
      ))}
    </nav>
  )
}

/** Nombre accesible de la tarjeta: el tipo, el complejo, cuándo y qué partido es. */
function cardLabel(item: RivalBoardItem, type: string, now: Date): string {
  const sello = item.hasStamp ? ', reservada en TurnoGol' : ''
  return `${type} en ${item.tenantName}, ${whenLabel(item.startsAt, now)}. ${formatLabel(item.format)}, ${RIVAL_LEVEL_LABELS[item.level]}${sello}`
}

/** Tarjeta del tablón: un link a `/rival/partido/<id>`. No lleva personas. */
function BoardCard({ item, now }: { item: RivalBoardItem; now: Date }) {
  const type = matchTypeLabel({
    seeking: item.seeking,
    seekingPosition: item.seekingPosition,
    capacity: item.capacity,
    confirmedCount: item.confirmedCount,
  })
  return (
    <li>
      <Link
        href={`/rival/partido/${item.id}`}
        aria-label={cardLabel(item, type, now)}
        className="block rounded-2xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-input focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <p className="font-display text-xl font-black italic leading-none tracking-tight text-foreground tabular-nums">
            {type}
          </p>
          {item.hasStamp && <StampBadge />}
        </div>
        <p className="mt-3 break-words text-base font-medium text-foreground">{item.tenantName}</p>
        <p className="text-sm text-muted-foreground">{whenLabel(item.startsAt, now)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <FactPill>{formatLabel(item.format)}</FactPill>
          <FactPill>{RIVAL_LEVEL_LABELS[item.level]}</FactPill>
        </div>
      </Link>
    </li>
  )
}

function EmptyBoard() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-6 py-14 text-center shadow-xs">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
        <Users className="h-8 w-8" aria-hidden />
      </div>
      <p className="max-w-xs text-base text-foreground">
        Hoy el tablón está tranquilo. Armá el primero y que se sume quien pueda.
      </p>
      <Link
        href="/rival/nuevo"
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'min-h-11 gap-2 rounded-full px-6 font-semibold',
        )}
      >
        <Plus className="size-4" aria-hidden />
        Armar un partido
      </Link>
    </div>
  )
}

export function BoardView({
  items,
  tenants,
  selectedTenantId,
  nextHref,
  now,
}: {
  items: RivalBoardItem[]
  /** Complejos con publicaciones (para el selector). */
  tenants: { id: string; name: string }[]
  selectedTenantId: string | null
  /** Link a la página siguiente (`?despues=`); `null` = no hay más. */
  nextHref: string | null
  now: Date
}) {
  const groups = groupBoardByDay(items, now)
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <PlayerHeroBand eyebrow="RIVAL powered by TurnoGol" title="Armá el" accent="partido" />

      <div className="space-y-3">
        <Link href="/rival/nuevo" className={cn(RIVAL_CTA, 'w-full')}>
          Armar un partido
        </Link>
        <RivalTabs current="tablon" />
      </div>

      {groups.length === 0 && selectedTenantId === null ? (
        <EmptyBoard />
      ) : (
        <>
          {tenants.length > 0 && <TenantFilter tenants={tenants} selectedId={selectedTenantId} />}
          {groups.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Este complejo no tiene publicaciones por ahora.
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.key} aria-labelledby={`grupo-${g.key}`} className="space-y-3">
                <h2
                  id={`grupo-${g.key}`}
                  className="font-display text-lg font-extrabold tracking-[-0.01em] text-foreground"
                >
                  {g.label}
                </h2>
                <ul className="space-y-3">
                  {g.items.map((item) => (
                    <BoardCard key={item.id} item={item} now={now} />
                  ))}
                </ul>
              </section>
            ))
          )}
          {nextHref && (
            <Link
              href={nextHref}
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'h-11 w-full text-sm font-medium',
              )}
            >
              Ver más partidos
            </Link>
          )}
        </>
      )}
    </div>
  )
}
