import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PORTAL_LINK, PORTAL_TITLE } from '@/components/world/PortalAuthFrame'
import { buildMetadata } from '@/lib/seo/metadata'
import { buildFichaHref, parseFormato, parsePay, type PayMethod } from '@/lib/booking/reserve-url'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { cn } from '@/lib/utils'
import { getPublicAvailability, getPublicTenant } from '@/modules/tenants/public.service'
import { isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { getActiveBanReason } from '@/modules/bans/ban.service'
import BookingSummary from './components/BookingSummary'
import CheckoutFlow from './components/CheckoutFlow'
import {
  createBookingAndCheckout,
  sendPlayerMagicLink,
  startGoogleLoginFromReservar,
} from './actions'
import { CheckoutErrorBanner, CheckoutInvalidState, RESERVAR_COLUMN } from './CheckoutStates'
import { track } from '@/shared/observability'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'

export const dynamic = 'force-dynamic'

const TIME_RE = /^\d{2}:\d{2}$/

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    court?: string
    date?: string
    time?: string
    dur?: string
    /** Filtro de formato de la ficha: vuelve en "Volver" y sobrevive al ingreso. */
    formato?: string
    /** Cómo paga: `cash` | `transfer` | `mercadopago`. Inválido = el default del complejo. */
    pay?: string
    error?: string
    until?: string
  }>
}

function addMinsToHHMM(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h! * 60 + (m ?? 0) + mins
  // El slot que termina en la medianoche calendario se guarda '24:00' (> '23:00'
  // → pasa chk_time_valid); las madrugadas vuelven a 01:00, 02:00…
  return endLabelFromMins(total)
}

export default async function ReservarPage(props: Props) {
  const searchParams = await props.searchParams
  const params = await props.params
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) notFound()
  if (!isPublicPortalOpen(tenant.status, tenant.canceledPeriodEnd) || !tenant.allowOnlineBooking) {
    return <CheckoutInvalidState slug={params.slug} kind="no-online" />
  }

  const { court, date, time, dur } = searchParams
  const durNum = Number(dur)
  if (
    !court ||
    !date ||
    !time ||
    // Formato Y fecha real: '2099-13-45' pasaba el regex y llegaba crudo al
    // `${date}::date` de getPublicAvailability, que reventaba con un 22008 de
    // Postgres sin atrapar. Mismo helper que ya usa actions.ts de este directorio.
    !isValidCalendarDate(date) ||
    !TIME_RE.test(time) ||
    durNum !== SLOT_DURATION_MINUTES
  ) {
    return <CheckoutInvalidState slug={params.slug} kind="missing" />
  }

  // keepPrices: la seña se calcula con el precio real aunque el complejo los
  // oculte; con `hidePrices` el monto no se muestra (BookingSummary).
  const availability = await getPublicAvailability(tenant, date, { keepPrices: true })
  // Lo que eligió en la ficha vive en la URL; inválido = el default (sin filtro).
  const formato = parseFormato(searchParams.formato, [
    ...new Set(availability.courts.map((c) => c.format)),
  ])
  // La ficha con lo que había elegido: la salida del "Volver" y de cada "Elegir otro turno".
  const turnHref = buildFichaHref(params.slug, { date, hora: time, formato })
  const courtData = availability.courts.find((c) => c.id === court)
  const slot = courtData?.slots.find((s) => s.time === time)
  if (!courtData || !slot) {
    return <CheckoutInvalidState slug={params.slug} kind="not-found" turnHref={turnHref} />
  }
  if (slot.status !== 'free') {
    // Único mensaje para "el turno ya no está libre": el código `slot_taken` se
    // eliminó (decisión del dueño 2026-08-14) porque este guard se dispara siempre
    // antes que su banner. Este camino trae el CTA "Elegir otro turno".
    return <CheckoutInvalidState slug={params.slug} kind="taken" turnHref={turnHref} />
  }

  const price = slot.price ?? 0
  const depositAmount =
    tenant.requiresDeposit && tenant.depositPercentage > 0
      ? Math.round((price * tenant.depositPercentage) / 100)
      : 0
  const timeEnd = addMinsToHHMM(time, durNum)

  // El paso más caro del embudo: el jugador ya eligió cancha y horario y está
  // por pagar. Va DESPUÉS de los early-returns de arriba a propósito — un slot
  // ya tomado o inexistente no es un checkout visto, y contarlo inflaría el
  // denominador de la conversión con gente que nunca vio un precio.
  // `withDeposit` separa los dos flujos, que no son comparables entre sí: con
  // seña el jugador se va a MercadoPago, sin seña confirma en el momento.
  track.funnel('checkout.viewed', {
    tenantId: tenant.id,
    withDeposit: depositAmount > 0,
  })

  // Con seña la única vía es MercadoPago (regla de negocio: la seña online es
  // obligatoria). Sin seña, métodos presenciales según config del complejo.
  const payMethods: PayMethod[] =
    depositAmount > 0
      ? ['mercadopago']
      : [
          ...(tenant.acceptsCash ? (['cash'] as const) : []),
          ...(tenant.acceptsTransfer ? (['transfer'] as const) : []),
        ]
  // Cómo paga también vive en la URL; inválido = el primero que acepta el complejo.
  const pay = parsePay(searchParams.pay, payMethods) ?? payMethods[0] ?? null

  const user = await extractAuthUser()
  const isPlayer = user?.type === 'player'
  const inAppBrowser = isInAppBrowser((await headers()).get('user-agent'))

  // R3-5: el `reason` del ban NUNCA viaja por query string (fabricable por
  // URL + se filtra a logs/analytics/referrers) — se relee acá server-side.
  // `withPlayerContext` alcanza sin setear tenant context: tanto `players`
  // como `tenant_player_bans` tienen policy de RLS para que el jugador vea su
  // propia fila (player_own_bans_select / id = current_player_id), sin
  // importar el tenant — mismas policies que ya usa `checkPlayerBanned`.
  const banReason =
    searchParams.error === 'banned' && isPlayer
      ? await withPlayerContext(user!.playerId, (tx) =>
          getActiveBanReason(user!.playerId, tenant.id, tx),
        )
      : null

  return (
    // Con sesión, el botón de confirmar es una barra fija abajo en el celular: `PortalFrame` suma su
    // alto a su relleno inferior (ver `data-fixed-cta`), así que la columna no lleva nada extra.
    <div className={cn(RESERVAR_COLUMN, 'pb-12')}>
      <Link
        href={turnHref}
        className={cn(
          PORTAL_LINK,
          '-ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-base font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300',
        )}
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver
      </Link>
      <h1 className={cn(PORTAL_TITLE, 'mt-2')}>Confirmá tu reserva</h1>

      <div className="mt-6 space-y-8">
        <CheckoutErrorBanner
          turnHref={turnHref}
          error={searchParams.error}
          until={searchParams.until}
          reason={banReason ?? undefined}
        />

        <BookingSummary
          data={{
            tenantName: tenant.name,
            address: tenant.address,
            city: tenant.city,
            courtName: courtData.name,
            courtFormat: courtData.format,
            date,
            timeStart: time,
            timeEnd,
            price,
            depositAmount,
            hidePrices: tenant.hidePrices,
          }}
        />

        <CheckoutFlow
          slug={params.slug}
          court={court}
          date={date}
          time={time}
          dur={durNum}
          formato={formato}
          methods={payMethods}
          initialPay={pay}
          withDeposit={depositAmount > 0}
          hidePrices={tenant.hidePrices}
          cancellationHours={tenant.cancellationHoursBefore}
          isPlayer={isPlayer}
          inAppBrowser={inAppBrowser}
          createAction={createBookingAndCheckout}
          sendLinkAction={sendPlayerMagicLink}
          googleAction={startGoogleLoginFromReservar}
        />
      </div>
    </div>
  )
}

/**
 * F-014 (QA de producción 2026-08-17): el paso de pago servía `TurnoGol` a secas
 * como título del documento, contra `Complejo elite padel · TurnoGol` en el
 * perfil. Con varias pestañas abiertas —el caso normal al comparar complejos—
 * la del checkout no decía ni dónde ni cuándo.
 *
 * `noIndex` a propósito: es una pantalla con parámetros de una reserva puntual,
 * no una página que tenga sentido en un buscador.
 */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams])
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) return {}

  const cuando =
    searchParams.date && TIME_RE.test(searchParams.time ?? '')
      ? ` · ${searchParams.date} ${searchParams.time}`
      : ''

  return buildMetadata({
    title: `Reservar en ${tenant.name}${cuando}`,
    description: `Confirmá tu turno en ${tenant.name}, ${tenant.city}.`,
    path: `/${tenant.slug}/reservar`,
    noIndex: true,
  })
}
