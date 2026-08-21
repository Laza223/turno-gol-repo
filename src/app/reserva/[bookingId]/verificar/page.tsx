import type { Metadata } from 'next'
import { sql } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import { isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import { VerificationCard, VerificationNotFound } from './VerificationCard'

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
  tenantStatus: string
  /**
   * `tenant_subscriptions.current_period_end`, sólo relevante cuando el
   * complejo está en baja voluntaria: hasta ahí sigue operando el turno que ya
   * vendió. LEFT JOIN — un complejo sin fila de suscripción da `null`, que es
   * lo que `isPublicPortalOpen` espera para cerrar.
   */
  canceledPeriodEnd: Date | null
}

// Lectura cross-tenant sin SET LOCAL, capability-token style (UUID no
// enumerable). El caveat BK-01 que este comentario documentaba ("bajo FORCE
// RLS + rol sin bypass devuelve 0 filas") dejó de ser hipotético con PR #30:
// `getDb()` es ahora el pool restringido `turnogol_app` (sin BYPASSRLS), así
// que ESTA página quedaba fail-closed para TODA reserva, no solo para probes
// maliciosos — rompía la verificación por QR en producción. Se mueve al pool
// worker (bypass-capable), mismo patrón que getStaffTenant/resolveStaffTenants.
async function loadVerification(bookingId: string): Promise<VerifyRow | null> {
  const db = getWorkerDb()
  const rows = (await db.execute(sql`
    SELECT b.status,
           b.date::text AS "date",
           b.time_start::text AS "timeStart",
           b.time_end::text AS "timeEnd",
           c.name AS "courtName",
           t.name AS "tenantName",
           t.city AS "city",
           t.status AS "tenantStatus",
           ts.current_period_end AS "canceledPeriodEnd"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `)) as unknown as VerifyRow[]

  const row = rows[0]
  if (!row) return null
  // Cruce #4 (auditoría junio): un tenant suspendido/bloqueado está oculto de
  // TODA superficie pública — esta página no es la excepción. Fail-closed con
  // el mismo mensaje genérico que un código inexistente, sin filtrar el motivo
  // ni el estado del complejo.
  //
  // `isPublicPortalOpen`, NO el viejo gate por status pelado: en la baja
  // voluntaria el complejo sigue operando hasta el fin del período que pagó
  // (doc4 §2), y estas reservas son justo las que ya vendió y todavía tiene que
  // dejar entrar. Cerrarle el QR le rompe el turno a un jugador que ya pagó.
  if (!isPublicPortalOpen(row.tenantStatus, row.canceledPeriodEnd)) return null
  return row
}

export default async function VerificarReservaPage(props: {
  params: Promise<{ bookingId: string }>
}) {
  const params = await props.params
  const booking = UUID_RE.test(params.bookingId)
    ? await loadVerification(params.bookingId).catch(() => null)
    : null

  if (!booking) {
    return <VerificationNotFound />
  }

  return <VerificationCard status={booking.status} booking={booking} bookingId={params.bookingId} />
}
