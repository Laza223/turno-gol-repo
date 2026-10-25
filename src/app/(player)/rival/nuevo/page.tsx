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
import { resolveRepeatPrefill, resolveReservaPrefill } from '@/modules/rival/rival-form'
import { artNowParts } from '@/shared/dates/art'
import { acceptRivalWelcomeAction, createMatchAction } from '../actions'
import { NewMatchForm } from './NewMatchForm'
import { WelcomeCard } from '../WelcomeCard'
import { loadWelcomePhoto } from '../welcome-photo'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Armar un partido · RIVAL',
    description: 'Armá tu partido y pasale el link al grupo.',
    path: '/rival/nuevo',
    noIndex: true,
  })
}

export default async function NuevoPartidoPage(props: {
  searchParams: Promise<{ reserva?: string; desde?: string }>
}) {
  if (!(await isRivalEnabled())) notFound()
  const [{ reserva, desde }, user] = await Promise.all([props.searchParams, extractAuthUser()])
  if (!user || user.type !== 'player') {
    // El `next` conserva la reserva: volver del login cae en la misma pantalla precargada.
    const back = reserva
      ? `/rival/nuevo?reserva=${encodeURIComponent(reserva)}`
      : desde
        ? `/rival/nuevo?desde=${encodeURIComponent(desde)}`
        : '/rival/nuevo'
    redirect(`/ingresar?next=${encodeURIComponent(back)}`)
  }

  const welcome = await getRivalWelcomeState(user.playerId)
  if (!welcome) notFound()

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <PlayerHeroBand eyebrow="RIVAL powered by TurnoGol" title="Armá tu" accent="partido" />
      {welcome.welcomed ? (
        <NewMatchSection playerId={user.playerId} reserva={reserva} desde={desde} />
      ) : (
        <WelcomeCard
          defaultName={welcome.firstName}
          defaultPosition={welcome.position}
          defaultZone={welcome.zone}
          action={acceptRivalWelcomeAction}
          photo={await loadWelcomePhoto(user.playerId)}
        />
      )}
    </div>
  )
}

async function NewMatchSection({
  playerId,
  reserva,
  desde,
}: {
  playerId: string
  reserva?: string
  desde?: string
}) {
  const [tenants, bookings, source, boardPrefill] = await Promise.all([
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
      tenants={tenants}
      bookings={bookings.map((b) => ({ tenantId: b.tenantId, startsAt: b.startsAt.toISOString() }))}
      prefill={prefill}
      repeat={repeat}
      today={now.date}
      nowTime={now.time}
      whatsappPrefill={boardPrefill.whatsapp}
      action={createMatchAction}
    />
  )
}
