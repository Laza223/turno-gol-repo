import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getPublicAvailability, getPublicTenant } from '@/modules/tenants/public.service'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import BookingSummary from './components/BookingSummary'
import LoginGate from './components/LoginGate'
import ConfirmBookingButton from './components/ConfirmBookingButton'

export const dynamic = 'force-dynamic'

const UNAVAILABLE = new Set(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

type Props = {
  params: { slug: string }
  searchParams: { court?: string; date?: string; time?: string; dur?: string; error?: string }
}

function addMinsToHHMM(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h! * 60 + (m ?? 0)) + mins
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function InvalidState({ slug, message }: { slug: string; message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
      <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
      <p className="text-sm text-slate-600">{message}</p>
      <Link href={`/${slug}`} className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        Elegir otro turno
      </Link>
    </div>
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
  if (!court || !date || !time || !DATE_RE.test(date) || !TIME_RE.test(time) || !tenant.bookingDurationMinutes.includes(durNum)) {
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

  const user = await extractAuthUser()
  const isPlayer = user?.type === 'player'
  const nextUrl = `/${params.slug}/reservar?court=${court}&date=${date}&time=${time}&dur=${durNum}`

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:px-6 space-y-5">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Confirmá tu reserva</h1>

      {searchParams.error === 'slot_taken' && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
          Ese turno acaba de ser tomado. Elegí otro horario.
        </p>
      )}
      {searchParams.error === 'banned' && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
          No podés reservar en este complejo actualmente.
        </p>
      )}
      {searchParams.error === 'debt' && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
          Tenés un saldo pendiente con este complejo. Regularizá tu deuda con el complejo para volver a reservar online.
        </p>
      )}
      {searchParams.error === 'rate_limited' && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
          Estás yendo muy rápido. Esperá unos segundos e intentá de nuevo.
        </p>
      )}
      {searchParams.error === 'unavailable' && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
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
        />
      ) : (
        <LoginGate next={nextUrl} />
      )}
    </div>
  )
}
