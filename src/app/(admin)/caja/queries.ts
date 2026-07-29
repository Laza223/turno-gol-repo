import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'

export async function requireCajaContext() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const today = operatingDateOf(new Date(), cutoffMins)

  return { user, tenant, staffUserId: user.staffUserId, cutoffMins, today }
}
