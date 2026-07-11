import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getPublicAvailability, getPublicTenant } from '@/modules/tenants/public.service'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import ReservaShell from '@/components/booking/ReservaDarkShell'
import BookingSummary from './components/BookingSummary'
import LoginGate from './components/LoginGate'
import ConfirmBookingButton from './components/ConfirmBookingButton'
import type { PayMethod } from './components/PaymentMethodSelector'

export const dynamic = 'force-dynamic'

const UNAVAILABLE = new Set(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

type Props = {
  params: { slug: string }
  searchParams: { court?: string; date?: string; time?: string; dur?: string; error?: string; until?: string }
}

function formatBannedUntilArt(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function addMinsToHHMM(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h! * 60 + (m ?? 0)) + mins
  // El slot que termina en la medianoche calendario se guarda '24:00' (> '23:00'
  // → pasa chk_time_valid); las madrugadas vuelven a 01:00, 02:00…
  return endLabelFromMins(total)
}

// Banners de error del checkout — badge dual §6.5 (tinte + texto legible en
// ambos temas), severidad destructive o warning según el caso.
const alertDestructive =
  'rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/25 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30'
const alertWarning =
  'rounded-xl bg-warning/10 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-warning/30 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30'

function InvalidState({ slug, message }: { slug: string; message: string }) {
  return (
    <ReservaShell>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 text-amber-700 ring-1 ring-inset ring-warning/35 dark:bg-amber-500/[.12] dark:text-amber-300 dark:ring-amber-500/35">
          <AlertTriangle className="h-8 w-8" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link
          href={`/${slug}`}
          className="mt-7 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
        >
          Elegir otro turno
        </Link>
      </div>
    </ReservaShell>
  )
}

export default async function ReservarPage({ params, searchParams }: Props) {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) notFound()
  if (UNAVAILABLE.has(tenant.status) || !tenant.allowOnlineBooking) {
    return <InvalidState slug={params.slug} message="Este complejo no acepta reservas online por el momento." />
  }

  const { court, date, time, dur } = searchParams
  const durNum = Number(dur)
  if (!court || !date || !time || !DATE_RE.test(date) || !TIME_RE.test(time) || durNum !== SLOT_DURATION_MINUTES) {
    return <InvalidState slug={params.slug} message="Faltan datos del turno. Elegí un horario desde la grilla." />
  }

  const availability = await getPublicAvailability(tenant, date)
  const courtData = availability.courts.find((c) => c.id === court)
  const slot = courtData?.slots.find((s) => s.time === time)
  if (!courtData || !slot) {
    return <InvalidState slug={params.slug} message="No encontramos ese turno. Puede que haya cambiado la disponibilidad." />
  }
  if (slot.status !== 'free') {
    return <InvalidState slug={params.slug} message="Ese turno ya no está disponible. Elegí otro horario." />
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

      {searchParams.error === 'slot_taken' && (
        <p role="alert" className={alertDestructive}>
          Ese turno acaba de ser tomado. Elegí otro horario.
        </p>
      )}
      {searchParams.error === 'banned' && (
        <p role="alert" className={alertDestructive}>
          {(() => {
            const until = searchParams.until ? formatBannedUntilArt(searchParams.until) : null
            return until
              ? `Te bloqueamos temporalmente por ausencias. Volvés a poder reservar el ${until}.`
              : 'No podés reservar en este complejo actualmente.'
          })()}
        </p>
      )}
      {searchParams.error === 'too_many_holds' && (
        <p role="alert" className={alertWarning}>
          Ya tenés reservas pendientes de pago en este complejo. Completá o esperá a que venzan antes de reservar otra.
        </p>
      )}
      {searchParams.error === 'rate_limited' && (
        <p role="alert" className={alertWarning}>
          Estás yendo muy rápido. Esperá unos segundos e intentá de nuevo.
        </p>
      )}
      {searchParams.error === 'unavailable' && (
        <p role="alert" className={alertDestructive}>
          No pudimos procesar la reserva: la cancha no está disponible o no tiene precio configurado para ese horario.
        </p>
      )}

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
        />
      ) : (
        <LoginGate next={nextUrl} />
      )}
    </div>
    </ReservaShell>
  )
}
