import Link from 'next/link'
import type { CSSProperties } from 'react'
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
import { CupoBar, StampBadge } from './MatchBits'
import { RIVAL_ACTION, RIVAL_GHOST, RIVAL_SECONDARY } from './rival-classes'
import type { SendRivalMagicLink, StartGoogleLoginFromRival } from './p/[code]/login-actions'
import { RivalEntryGate } from './RivalEntryGate'
import { RivalScreen } from './RivalScreen'
import { RivalTabs } from './RivalTabs'
import './board.css'

const rise = (i: number) => ({ '--i': Math.min(i, 10) }) as CSSProperties

/** Selector de complejo: "Todos" y los complejos que tienen publicaciones. Es navegación (`?complejo=`). */
function TenantFilter({
  tenants,
  selectedId,
}: {
  tenants: { id: string; name: string }[]
  selectedId: string | null
}) {
  return (
    // En el celular es una fila que scrollea; con mouse (lg) se envuelve: la barra está oculta y el resto sería inalcanzable.
    <nav
      aria-label="Complejo"
      className="-mx-5 flex gap-2 overflow-x-auto px-5 py-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
    >
      <Link
        href="/rival"
        aria-current={selectedId === null ? 'page' : undefined}
        className="ri-chip"
      >
        Todos
      </Link>
      {tenants.map((t) => (
        <Link
          key={t.id}
          href={`/rival?complejo=${t.id}`}
          title={t.name}
          aria-current={selectedId === t.id ? 'page' : undefined}
          className="ri-chip max-w-[80vw] lg:max-w-full"
        >
          <span className="truncate">{t.name}</span>
        </Link>
      ))}
    </nav>
  )
}

/**
 * Tarjeta del tablón: un link a `/rival/partido/<id>`. No lleva personas. La hora manda; el día
 * solo sale bajo "Próximos días" (en Hoy y Mañana ya lo dice el título del grupo).
 */
function BoardCard({
  item,
  groupKey,
  now,
  index,
}: {
  item: RivalBoardItem
  groupKey: BoardGroupKey
  now: Date
  index: number
}) {
  const seeksRival = item.seeking === 'rival'
  const type = matchTypeLabel({
    seeking: item.seeking,
    seekingPosition: item.seekingPosition,
    capacity: item.capacity,
    confirmedCount: item.confirmedCount,
  })
  const filled = Math.min(item.confirmedCount, item.capacity)
  const time = artTimeOf(item.startsAt)
  return (
    <li>
      <Link
        transitionTypes={['nav-forward']}
        href={`/rival/partido/${item.id}`}
        className="ri-match glass-painted rv-rise h-full"
        style={rise(index)}
      >
        <div className="ri-match__k">
          <span className={cn('pa-tag', seeksRival && 'ri-tag--neutral')}>{type}</span>
          {item.hasStamp && <StampBadge />}
          <span className="ri-match__t">
            {formatLabel(item.format)} ·{' '}
            {groupKey === 'week' ? `${dayLabel(artDateOf(item.startsAt))} · ${time}` : time}
          </span>
        </div>
        <span className="ri-match__m">
          {item.tenantName} · {RIVAL_LEVEL_LABELS[item.level]} · ya son {filled} de {item.capacity}
        </span>
        <CupoBar filled={item.confirmedCount} capacity={item.capacity} className="ri-match__bar" />
        <span className="ri-match__cta">
          {seeksRival ? 'Anotar a mi equipo' : 'Quiero sumarme'}
        </span>
        {/* Sin aria-label (WCAG 2.5.3): el nombre del link es lo visible más el cuándo. */}
        <span className="sr-only">{whenLabel(item.startsAt, now)}</span>
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
    <>
      <section className="rv-empty glass-painted rv-rise lg:mx-auto lg:w-full lg:max-w-lg">
        <h2 className="rv-h2">Todavía no hay partidos publicados.</h2>
        <p className="rv-sub max-w-[36ch]">
          Cuando alguien publique uno, lo vas a ver acá. Mientras tanto, armá el tuyo.
        </p>
      </section>
      {alert.alertTenants.length > 0 && <BoardAlert alert={alert} />}
    </>
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
  /** Sin sesión, las entradas de intención abren el ingreso de RIVAL (crea la cuenta y vuelve a armar). */
  entry: BoardEntryProps
}) {
  const groups = groupBoardByDay(items, now)
  const primary = cn(RIVAL_ACTION, 'md:w-auto')
  const secondary = cn(RIVAL_SECONDARY, 'md:w-auto')
  // Las dos intenciones de armar. `?necesito=` lo leerá el form de `nuevo/` (PR2); hoy se ignora. Sin sesión, el ingreso vuelve ahí.
  const intents = [
    { label: 'Me faltan jugadores', next: '/rival/nuevo?necesito=jugadores', className: primary },
    { label: 'Busco rival', next: '/rival/nuevo?necesito=rival', className: secondary },
  ] as const
  return (
    <RivalScreen>
      <header className="ri-head rv-rise">
        <div>
          <h1 className="rv-h1">Partidos</h1>
          <p className="rv-sub">Armá tu partido o sumate a uno en los complejos de TurnoGol.</p>
        </div>
      </header>

      <div className="grid gap-3 md:flex md:flex-wrap rv-rise" style={rise(1)}>
        {intents.map((intent) =>
          alert.signedIn ? (
            <Link key={intent.label} href={intent.next} className={intent.className}>
              {intent.label}
            </Link>
          ) : (
            <RivalEntryGate
              key={intent.label}
              next={intent.next}
              label={intent.label}
              purpose="armar"
              sendMagicLink={entry.sendMagicLink}
              startGoogle={entry.startGoogle}
              inAppBrowser={entry.inAppBrowser}
              className={intent.className}
            />
          ),
        )}
      </div>
      <RivalTabs current="tablon" />

      {groups.length === 0 && selectedTenantId === null ? (
        <EmptyBoard alert={alert} />
      ) : (
        <>
          {tenants.length > 0 && <TenantFilter tenants={tenants} selectedId={selectedTenantId} />}
          {groups.length === 0 ? (
            <>
              <section className="rv-empty glass-painted rv-rise lg:mx-auto lg:w-full lg:max-w-lg">
                <h2 className="rv-h2">Este complejo no tiene partidos publicados por ahora.</h2>
              </section>
              {selectedTenantId && alert.alertTenants.length > 0 && (
                <BoardAlert
                  key={selectedTenantId}
                  alert={alert}
                  defaultTenantId={selectedTenantId}
                />
              )}
            </>
          ) : (
            groups.map((g) => (
              <section key={g.key} aria-labelledby={`grupo-${g.key}`}>
                <h2 id={`grupo-${g.key}`} className="ri-group">
                  {g.label}
                </h2>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {g.items.map((item, i) => (
                    <BoardCard key={item.id} item={item} groupKey={g.key} now={now} index={i} />
                  ))}
                </ul>
              </section>
            ))
          )}
          {nextHref && (
            <Link href={nextHref} className={cn(RIVAL_GHOST, 'w-full')}>
              Ver más partidos
            </Link>
          )}
        </>
      )}
    </RivalScreen>
  )
}
