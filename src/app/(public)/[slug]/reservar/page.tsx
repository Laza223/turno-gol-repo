import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getPublicAvailability, getPublicTenant } from '@/modules/tenants/public.service'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
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
    <BookingDarkShell>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-full text-amber-300"
          style={{ background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.35)' }}
        >
          <AlertTriangle className="h-8 w-8" aria-hidden />
        </div>
        <p className="text-sm text-slate-400">{message}</p>
        <Link
          href={`/${slug}`}
          className="mt-7 inline-flex h-12 items-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 motion-reduce:hover:translate-y-0"
        >
          Elegir otro turno
        </Link>
      </div>
    </BookingDarkShell>
  )
}

/** Fondo dark premium del flujo de reserva (glow esmeralda + grid), espeja el home. */
function BookingDarkShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[88vh] overflow-hidden" style={{ background: '#020617' }}>
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-12%] top-[-14%] h-[560px] w-[560px] rounded-full blur-[12px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.22), transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-18%] left-[-12%] h-[480px] w-[480px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(5,150,105,.12), transparent 72%)' }}
      />
      <div className="relative z-10">{children}</div>
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
    <BookingDarkShell>
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6 space-y-5">
      <h1 className="font-display text-2xl font-black italic tracking-tight text-white">Confirmá tu reserva</h1>

      {searchParams.error === 'slot_taken' && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-500/30">
          Ese turno acaba de ser tomado. Elegí otro horario.
        </p>
      )}
      {searchParams.error === 'banned' && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-500/30">
          No podés reservar en este complejo actualmente.
        </p>
      )}
      {searchParams.error === 'debt' && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-500/30">
          Tenés un saldo pendiente con este complejo. Regularizá tu deuda con el complejo para volver a reservar online.
        </p>
      )}
      {searchParams.error === 'rate_limited' && (
        <p role="alert" className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300 ring-1 ring-inset ring-amber-500/30">
          Estás yendo muy rápido. Esperá unos segundos e intentá de nuevo.
        </p>
      )}
      {searchParams.error === 'unavailable' && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-500/30">
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
    </BookingDarkShell>
  )
}
