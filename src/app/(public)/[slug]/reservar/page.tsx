import { notFound } from 'next/navigation'
import { getPublicAvailability, getPublicTenant } from '@/modules/tenants/public.service'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import ReservaShell from '@/components/booking/ReservaDarkShell'
import BookingSummary from './components/BookingSummary'
import LoginGate from './components/LoginGate'
import ConfirmBookingButton from './components/ConfirmBookingButton'
import type { PayMethod } from './components/PaymentMethodSelector'
import { createBookingAndCheckout, sendPlayerMagicLink } from './actions'
import { CheckoutErrorBanner, CheckoutInvalidState } from './CheckoutStates'

export const dynamic = 'force-dynamic'

const UNAVAILABLE = new Set(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ court?: string; date?: string; time?: string; dur?: string; error?: string; until?: string }>
}

function addMinsToHHMM(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h! * 60 + (m ?? 0)) + mins
  // El slot que termina en la medianoche calendario se guarda '24:00' (> '23:00'
  // → pasa chk_time_valid); las madrugadas vuelven a 01:00, 02:00…
  return endLabelFromMins(total)
}

export default async function ReservarPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) notFound()
  if (UNAVAILABLE.has(tenant.status) || !tenant.allowOnlineBooking) {
    return <CheckoutInvalidState slug={params.slug} message="Este complejo no acepta reservas online por el momento." />
  }

  const { court, date, time, dur } = searchParams
  const durNum = Number(dur)
  if (!court || !date || !time || !DATE_RE.test(date) || !TIME_RE.test(time) || durNum !== SLOT_DURATION_MINUTES) {
    return <CheckoutInvalidState slug={params.slug} message="Faltan datos del turno. Elegí un horario desde la grilla." />
  }

  const availability = await getPublicAvailability(tenant, date)
  const courtData = availability.courts.find((c) => c.id === court)
  const slot = courtData?.slots.find((s) => s.time === time)
  if (!courtData || !slot) {
    return <CheckoutInvalidState slug={params.slug} message="No encontramos ese turno. Puede que haya cambiado la disponibilidad." />
  }
  if (slot.status !== 'free') {
    return <CheckoutInvalidState slug={params.slug} message="Ese turno ya no está disponible. Elegí otro horario." />
  }

  const price = slot.price ?? 0
  const depositAmount = tenant.requiresDeposit && tenant.depositPercentage > 0
    ? Math.round((price * tenant.depositPercentage) / 100)
    : 0
  const timeEnd = addMinsToHHMM(time, durNum)

  // Con seña la única vía es MercadoPago (regla de negocio: la seña online es
  // obligatoria). Sin seña, métodos presenciales según config del complejo.
  const payMethods: PayMethod[] =
    depositAmount > 0
      ? ['mercadopago']
      : [
          ...(tenant.acceptsCash ? (['cash'] as const) : []),
          ...(tenant.acceptsTransfer ? (['transfer'] as const) : []),
        ]

  const user = await extractAuthUser()
  const isPlayer = user?.type === 'player'
  const nextUrl = `/${params.slug}/reservar?court=${court}&date=${date}&time=${time}&dur=${durNum}`

  return (
    <ReservaShell>
    <div className="mx-auto max-w-md space-y-5 px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-black italic tracking-tight text-foreground">Confirmá tu reserva</h1>

      <CheckoutErrorBanner error={searchParams.error} until={searchParams.until} />

      <BookingSummary
        data={{
          tenantName: tenant.name,
          city: tenant.city,
          courtName: courtData.name,
          date,
          timeStart: time,
          timeEnd,
          price,
          depositAmount,
        }}
      />

      {isPlayer ? (
        <ConfirmBookingButton
          slug={params.slug}
          court={court}
          date={date}
          time={time}
          dur={durNum}
          depositAmount={depositAmount}
          payMethods={payMethods}
          action={createBookingAndCheckout}
        />
      ) : (
        <LoginGate next={nextUrl} action={sendPlayerMagicLink} />
      )}
    </div>
    </ReservaShell>
  )
}
