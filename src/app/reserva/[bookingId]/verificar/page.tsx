import type { Metadata } from 'next'
import { sql } from 'drizzle-orm'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { getDb } from '@/shared/db/client'

// Página PÚBLICA de verificación: la abre el complejo al escanear el QR del
// comprobante del jugador. Sin auth — el UUID de la reserva actúa como
// capability token (no enumerable). Por Ley 25.326 no expone ningún dato del
// jugador: solo estado del turno + complejo/cancha/horario, que el club ya
// conoce. noindex: no tiene sentido en buscadores.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Verificación de reserva — TurnoGol',
  robots: { index: false, follow: false },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type VerifyRow = {
  status: string
  date: string
  timeStart: string
  timeEnd: string
  courtName: string
  tenantName: string
  city: string
}

// Lectura cross-tenant sin SET LOCAL (caveat BK-01, mismo patrón documentado
// en getCourtPhotosByTenant): hoy la conexión es dueña de las tablas y RLS no
// aplica; bajo FORCE RLS + rol sin bypass devuelve 0 filas → fail-closed
// ("no pudimos verificar"), nunca un leak.
async function loadVerification(bookingId: string): Promise<VerifyRow | null> {
  const db = getDb()
  const rows = (await db.execute(sql`
    SELECT b.status,
           b.date::text AS "date",
           b.time_start::text AS "timeStart",
           b.time_end::text AS "timeEnd",
           c.name AS "courtName",
           t.name AS "tenantName",
           t.city AS "city"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `)) as unknown as VerifyRow[]
  return rows[0] ?? null
}

type Verdict = {
  tone: 'ok' | 'warn' | 'bad'
  title: string
  detail: string
}

function verdictFor(status: string): Verdict {
  switch (status) {
    case 'confirmed':
      return { tone: 'ok', title: 'Reserva confirmada', detail: 'El turno está vigente.' }
    case 'completed':
      return { tone: 'ok', title: 'Reserva completada', detail: 'El turno ya fue jugado.' }
    case 'pending_payment':
      return { tone: 'warn', title: 'Seña pendiente de pago', detail: 'La reserva todavía no está confirmada.' }
    case 'canceled_refunded':
    case 'canceled_no_refund':
      return { tone: 'bad', title: 'Reserva cancelada', detail: 'Este turno fue cancelado.' }
    case 'expired':
      return { tone: 'bad', title: 'Reserva expirada', detail: 'La seña no se pagó a tiempo.' }
    case 'no_show':
      return { tone: 'bad', title: 'Ausencia registrada', detail: 'El jugador no se presentó al turno.' }
    default:
      return { tone: 'warn', title: 'Estado desconocido', detail: 'Consultá el panel del complejo.' }
  }
}

const TONE_STYLES: Record<Verdict['tone'], { ring: string; badge: string; icon: typeof CheckCircle2 }> = {
  ok: { ring: 'bg-emerald-100 ring-emerald-50', badge: 'text-emerald-700', icon: CheckCircle2 },
  warn: { ring: 'bg-amber-100 ring-amber-50', badge: 'text-amber-600', icon: Clock3 },
  bad: { ring: 'bg-red-100 ring-red-50', badge: 'text-red-600', icon: XCircle },
}

export default async function VerificarReservaPage({ params }: { params: { bookingId: string } }) {
  const booking = UUID_RE.test(params.bookingId)
    ? await loadVerification(params.bookingId).catch(() => null)
    : null

  if (!booking) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <XCircle className="h-10 w-10 text-slate-300" aria-hidden />
        <h1 className="mt-4 text-lg font-bold text-slate-900">No pudimos verificar esta reserva</h1>
        <p className="mt-2 text-sm text-slate-600">El código no corresponde a una reserva válida.</p>
      </div>
    )
  }

  const verdict = verdictFor(booking.status)
  const tone = TONE_STYLES[verdict.tone]
  const Icon = tone.icon

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full ring-8 ${tone.ring}`}>
        <Icon className={`h-8 w-8 ${tone.badge}`} aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{verdict.title}</h1>
      <p className="mt-2 text-sm text-slate-600">{verdict.detail}</p>

      <dl className="mt-6 w-full space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm shadow-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Complejo</dt>
          <dd className="font-medium text-slate-900">{booking.tenantName} · {booking.city}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Cancha</dt>
          <dd className="font-medium text-slate-900">{booking.courtName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Fecha</dt>
          <dd className="font-medium text-slate-900 tabular-nums">{booking.date.split('-').reverse().join('/')}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Horario</dt>
          <dd className="font-medium text-slate-900 tabular-nums">
            {booking.timeStart.slice(0, 5)}–{booking.timeEnd.slice(0, 5)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-slate-400">
        Verificado por TurnoGol · código {params.bookingId.slice(0, 8).toUpperCase()}
      </p>
    </div>
  )
}
