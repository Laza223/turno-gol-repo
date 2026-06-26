import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { PinGate } from '@/components/pin-gate'
import { CourtList } from './components/CourtList'

export default async function CanchasPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/onboarding')

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  const hasPin = !!tenant.settings.staff_pin_hash

  const content = (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <PageHeader
        title="Canchas"
        subtitle={`Gestioná las canchas de ${tenant.name}`}
        icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
      />

      <CourtList initialCourts={courts} openingHours={tenant.openingHours} />
    </main>
  )

  return <PinGate pinRequired={hasPin}>{content}</PinGate>
}
