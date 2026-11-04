import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import PlayerHeroBand from '@/components/site/PlayerHeroBand'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { buildMetadata } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import {
  getBoardPublishPrefill,
  getRepeatPrefill,
  getRivalWelcomeState,
  listEligibleTenants,
  listUpcomingConfirmedBookings,
} from '@/modules/rival/rival.service'
import {
  intentFromNecesito,
  resolveRepeatPrefill,
  resolveReservaPrefill,
} from '@/modules/rival/rival-form'
import { welcomeNeeds } from '@/modules/rival/rival-join-rule'
import { artNowParts } from '@/shared/dates/art'
import { acceptRivalWelcomeAction, createMatchAction } from '../actions'
import { NewMatchForm } from './NewMatchForm'
import { WelcomeCard } from '../WelcomeCard'
import { loadWelcomePhoto } from '../welcome-photo'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Armar un partido · RIVAL',
    description: 'Armá tu partido: decí qué necesitás y salí al tablón.',
    path: '/rival/nuevo',
    noIndex: true,
  })
}

/** A dónde vuelve el login: conserva la reserva, el partido a repetir o la intención ya elegida. */
function loginBackPath(q: { reserva?: string; desde?: string; necesito?: string }): string {
  const entry = (['reserva', 'desde', 'necesito'] as const).find((k) => q[k])
  const value = entry ? q[entry] : undefined
  return entry && value ? `/rival/nuevo?${entry}=${encodeURIComponent(value)}` : '/rival/nuevo'
}

export default async function NuevoPartidoPage(props: {
  searchParams: Promise<{ reserva?: string; desde?: string; necesito?: string }>
}) {
  if (!(await isRivalEnabled())) notFound()
  const [{ reserva, desde, necesito }, user] = await Promise.all([
    props.searchParams,
    extractAuthUser(),
  ])
  if (!user || user.type !== 'player') {
    // El `next` conserva la precarga: volver del login cae en la misma pantalla.
    redirect(`/ingresar?next=${encodeURIComponent(loginBackPath({ reserva, desde, necesito }))}`)
  }

  const welcome = await getRivalWelcomeState(user.playerId)
  if (!welcome) notFound()
  // Para armar alcanzan el nombre y las reglas: la posición y la zona se piden al sumarse.
  const needs = welcomeNeeds(welcome, 'armar')

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <PlayerHeroBand eyebrow="RIVAL powered by TurnoGol" title="Armá tu" accent="partido" />
      {needs ? (
        <WelcomeCard
          needs={needs}
          defaultName={welcome.firstName}
          defaultPosition={welcome.position}
          defaultZone={welcome.zone}
          action={acceptRivalWelcomeAction}
          photo={needs.identity ? await loadWelcomePhoto(user.playerId) : undefined}
          dismissHref="/rival"
        />
      ) : (
        <NewMatchSection
          playerId={user.playerId}
          reserva={reserva}
          desde={desde}
          necesito={necesito}
        />
      )}
    </div>
  )
}

async function NewMatchSection({
  playerId,
  reserva,
  desde,
  necesito,
}: {
  playerId: string
  reserva?: string
  desde?: string
  necesito?: string
}) {
  const [tenants, bookings, source, whatsapp] = await Promise.all([
    listEligibleTenants(),
    listUpcomingConfirmedBookings(playerId),
    // `?desde=` solo precarga un partido PROPIO (el service devuelve null si no lo es).
    desde ? getRepeatPrefill(playerId, desde) : null,
    getBoardPublishPrefill(playerId),
  ])
  const now = artNowParts()
  // La reserva se resuelve contra las del JUGADOR de la sesión: un id ajeno se ignora sin error.
  const prefill = resolveReservaPrefill(
    reserva,
    bookings,
    tenants.map((t) => t.id),
  )
  // La reserva (bloqueada) manda sobre la repetición (libre).
  const repeat = prefill
    ? null
    : resolveRepeatPrefill(
        source,
        tenants.map((t) => t.id),
        now.date,
      )
  return (
    <NewMatchForm
      tenants={tenants.map(({ openingHours, closedDates, closesNextDay, ...t }) => ({
        ...t,
        schedule: { openingHours, closedDates, closesNextDay },
      }))}
      bookings={bookings.map((b) => ({ tenantId: b.tenantId, startsAt: b.startsAt.toISOString() }))}
      prefill={prefill}
      repeat={repeat}
      today={now.date}
      nowTime={now.time}
      action={createMatchAction}
      initialIntent={intentFromNecesito(necesito)}
      whatsappPrefill={whatsapp.whatsapp}
    />
  )
}
