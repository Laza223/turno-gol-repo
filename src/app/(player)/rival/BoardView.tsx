import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import PlayerHeroBand from '@/components/site/PlayerHeroBand'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import {
  artTimeOf,
  dayLabel,
  groupBoardByDay,
  matchTypeLabel,
  RIVAL_LEVEL_LABELS,
  whenLabel,
  type BoardGroupKey,
} from '@/modules/rival/rival-display'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import { artDateOf } from '@/shared/time/art-date'
import { AlertOptIn } from './AlertOptIn'
import type { RivalFormResult } from './actions'
import { MiniShirts, StampBadge } from './MatchBits'
import { RIVAL_CTA, RIVAL_GHOST } from './rival-classes'
import type { SendRivalMagicLink, StartGoogleLoginFromRival } from './p/[code]/login-actions'
import { RivalEntryGate } from './RivalEntryGate'
import { RivalTabs } from './RivalTabs'

// El nombre largo de un complejo se corta con "…" (el chip lo dice entero en `title`).
const CHIP =
  'inline-flex min-h-11 max-w-[80vw] shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:max-w-full'

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
    // En el celular es una fila que scrollea; con mouse (lg) se envuelve: la barra está oculta y el resto sería inalcanzable.
    <nav
      aria-label="Complejo"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
    >
      <Link
        href="/rival/tablon"
        aria-current={selectedId === null ? 'page' : undefined}
        className={chip(selectedId === null)}
      >
        Todos
      </Link>
      {tenants.map((t) => (
        <Link
          key={t.id}
          href={`/rival/tablon?complejo=${t.id}`}
          title={t.name}
          aria-current={selectedId === t.id ? 'page' : undefined}
          className={chip(selectedId === t.id)}
        >
          <span className="truncate">{t.name}</span>
        </Link>
      ))}
    </nav>
  )
}

/** Nombre accesible de la tarjeta: el tipo, el complejo, cuándo, qué partido es y el cupo (la tira de camisetas es decorativa). */
function cupoLabel(item: RivalBoardItem): string {
  return `${Math.min(item.confirmedCount, item.capacity)} de ${item.capacity} confirmados`
}

/**
 * Tarjeta del tablón: un link a `/rival/partido/<id>`. No lleva personas. La hora manda; el día
 * solo sale bajo "Próximos días" (en Hoy y Mañana ya lo dice el título del grupo).
 */
function BoardCard({
  item,
  groupKey,
  now,
}: {
  item: RivalBoardItem
  groupKey: BoardGroupKey
  now: Date
}) {
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
        className="block h-full rounded-2xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-input focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-3xl font-black italic leading-none tracking-tight text-foreground tabular-nums">
              {artTimeOf(item.startsAt)}
            </p>
            {groupKey === 'week' && (
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                {dayLabel(artDateOf(item.startsAt))}
              </p>
            )}
          </div>
          <p className="text-right font-display text-lg font-black italic leading-tight tracking-tight text-foreground">
            {type}
          </p>
        </div>
        <p className="mt-3 break-words text-base font-medium text-foreground">{item.tenantName}</p>
        <p className="text-sm text-muted-foreground">
          {formatLabel(item.format)} · {RIVAL_LEVEL_LABELS[item.level]}
        </p>
        {item.hasStamp && <StampBadge className="mt-2" />}
        <MiniShirts className="mt-3" capacity={item.capacity} confirmed={item.confirmedCount} />
        {/* Sin aria-label (WCAG 2.5.3): el nombre del link es lo visible más el cupo y el cuándo. */}
        <span className="sr-only">
          {cupoLabel(item)}, {whenLabel(item.startsAt, now)}
        </span>
      </Link>
    </li>
  )
}

/** Lo que el estado vacío necesita para ofrecer el aviso "cuando haya partido". */
export type BoardAlertProps = {
  /** Complejos elegibles para la alerta. */
  alertTenants: { id: string; name: string }[]
  signedIn: boolean
  subscribed: { tenantId: string; onlyGoalkeeper: boolean }[]
  subscribeAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
  unsubscribeAction: (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
}

/** Las actions del ingreso de RIVAL: entran por prop (`login-actions` es `'use server'`, ver `RivalEntryGate`). */
export type BoardEntryProps = {
  sendMagicLink: SendRivalMagicLink
  startGoogle: StartGoogleLoginFromRival
  inAppBrowser?: boolean
}

function BoardAlert({
  alert,
  defaultTenantId,
}: {
  alert: BoardAlertProps
  defaultTenantId?: string
}) {
  return (
    <AlertOptIn
      tenants={alert.alertTenants}
      signedIn={alert.signedIn}
      subscribed={alert.subscribed}
      defaultTenantId={defaultTenantId}
      action={alert.subscribeAction}
      unsubscribeAction={alert.unsubscribeAction}
    />
  )
}

function EmptyBoard({ alert }: { alert: BoardAlertProps }) {
  return (
    <div className="rounded-3xl border border-border bg-card px-6 py-8 text-center shadow-xs lg:mx-auto lg:max-w-lg">
      <h2 className="font-display text-2xl font-black italic leading-tight tracking-tight text-foreground">
        Por ahora no hay partidos en el tablón.
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-base text-muted-foreground">
        Armá el tuyo y publicalo para que se sume quien busca jugar.
      </p>
      {alert.alertTenants.length > 0 && (
        <div className="mt-5 w-full border-t border-border pt-5">
          <BoardAlert alert={alert} />
        </div>
      )}
    </div>
  )
}

export function BoardView({
  items,
  tenants,
  selectedTenantId,
  nextHref,
  now,
  alert,
  entry,
}: {
  items: RivalBoardItem[]
  /** Complejos con publicaciones (para el selector). */
  tenants: { id: string; name: string }[]
  selectedTenantId: string | null
  /** Link a la página siguiente (`?despues=`); `null` = no hay más. */
  nextHref: string | null
  now: Date
  alert: BoardAlertProps
  /** Sin sesión, "Armar un partido" abre el ingreso de RIVAL (crea la cuenta y vuelve a armar). */
  entry: BoardEntryProps
}) {
  const groups = groupBoardByDay(items, now)
  const armar = cn(RIVAL_CTA, 'w-full lg:w-fit lg:self-start')
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6 lg:max-w-3xl">
      <PlayerHeroBand
        eyebrow="RIVAL powered by TurnoGol"
        title="Sumate a un"
        accent="partido"
        subtitle="O armá el tuyo, pasale el link al grupo y cada uno confirma con un toque."
      />

      <div className="flex flex-col gap-3">
        {alert.signedIn ? (
          <Link href="/rival/nuevo" className={armar}>
            Armar un partido
          </Link>
        ) : (
          <RivalEntryGate
            next="/rival/nuevo"
            label="Armar un partido"
            purpose="armar"
            sendMagicLink={entry.sendMagicLink}
            startGoogle={entry.startGoogle}
            inAppBrowser={entry.inAppBrowser}
            className={armar}
          />
        )}
        <RivalTabs current="tablon" />
      </div>

      {groups.length === 0 && selectedTenantId === null ? (
        <EmptyBoard alert={alert} />
      ) : (
        <>
          {tenants.length > 0 && <TenantFilter tenants={tenants} selectedId={selectedTenantId} />}
          {groups.length === 0 ? (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4 lg:mx-auto lg:max-w-lg">
              <p className="text-base text-foreground">
                Este complejo no tiene partidos publicados por ahora.
              </p>
              {selectedTenantId && alert.alertTenants.length > 0 && (
                <BoardAlert
                  key={selectedTenantId}
                  alert={alert}
                  defaultTenantId={selectedTenantId}
                />
              )}
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.key} aria-labelledby={`grupo-${g.key}`} className="space-y-3">
                <h2 id={`grupo-${g.key}`} className={PORTAL_SECTION_TITLE}>
                  {g.label}
                </h2>
                <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                  {g.items.map((item) => (
                    <BoardCard key={item.id} item={item} groupKey={g.key} now={now} />
                  ))}
                </ul>
              </section>
            ))
          )}
          {nextHref && (
            <Link
              href={nextHref}
              className={cn(buttonVariants({ variant: 'ghost' }), RIVAL_GHOST, 'w-full')}
            >
              Ver más partidos
            </Link>
          )}
        </>
      )}
    </div>
  )
}
