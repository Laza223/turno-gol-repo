import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import AbonadoForm from './AbonadoForm'

export default async function NuevoAbonadoPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  const courtOptions = courts.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/abonados" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Abonados
      </Link>
      <h1 className="text-2xl font-semibold text-foreground">Nuevo abonado</h1>
      <AbonadoForm courts={courtOptions} />
    </div>
  )
}
