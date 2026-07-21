'use server'

import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { getBookingCharges } from './queries'

export type GetBookingChargesResult =
  | { ok: true; chargesTotal: number }
  | { ok: false; error: string }

/**
 * Lectura de solo consulta: cobros de mostrador ya registrados para un
 * booking (cash_flows income vinculados, sin contar la seña). Archivo
 * separado de `./actions` a propósito — evita chocar con otro agente editando
 * ese archivo en paralelo.
 *
 * QuickActions (la lista) usaba `chargesTotal: 0` hardcodeado al abrir
 * CompleteBookingDialog, mientras el detalle (`reservas/[id]/page.tsx`) trae
 * el valor real vía `getBookingCharges` en el Server Component. Si el turno
 * tuvo cobros parciales previos, el diálogo abierto desde la lista pre-cargaba
 * un monto pendiente INFLADO (contaba de nuevo lo ya cobrado). Esta action le
 * da a QuickActions (Client Component) la misma fuente de verdad que ya usa
 * el detalle, sin necesidad de convertir la lista en un fetch server-side por
 * fila. Fail-open a `ok:false` ante cualquier error — el caller decae a 0 y el
 * server sigue siendo quien revalida el monto real al cobrar
 * (completeAndChargeBookingAction ya recalcula `pending` server-side).
 */
export async function getBookingChargesAction(
  bookingId: string,
): Promise<GetBookingChargesResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { ok: false, error: limited }

  try {
    const { chargesTotal } = await withTenantContext(tenant.id, (tx) =>
      getBookingCharges(tenant.id, bookingId, tx),
    )
    return { ok: true, chargesTotal }
  } catch {
    return { ok: false, error: 'No se pudieron cargar los cobros del turno.' }
  }
}
