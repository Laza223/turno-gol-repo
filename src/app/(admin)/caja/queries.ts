import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'

/**
 * Contexto compartido por las 4 pantallas de Caja y Cantina.
 *
 * B10 — antes hacía `extractAuthUser` + `getStaffTenant` a mano, igual que las 19
 * páginas que el barrido migró, y nunca leía el rol. No lo cazó el barrido porque
 * las páginas de `/caja` no nombran `extractAuthUser`: lo delegan acá. Un helper
 * compartido que autentica a mano es peor que una página que lo hace, porque
 * arrastra a las cuatro de una.
 *
 * Devuelve también `role` para que `caja/productos` —lo único solo-admin del
 * grupo— no tenga que pedir un `getStaffRole` propio sobre la misma fila.
 */
export async function requireCajaContext() {
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { user, tenant, role } = auth

  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const today = operatingDateOf(new Date(), cutoffMins)

  return { user, tenant, role, staffUserId: user.staffUserId, cutoffMins, today }
}
