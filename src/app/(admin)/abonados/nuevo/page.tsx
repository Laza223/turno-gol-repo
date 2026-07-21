import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import AbonadoForm from './AbonadoForm'
import { submitNewAbonado, previewAbonadoSlotsAction } from './actions'

export default async function NuevoAbonadoPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  const courtOptions = courts.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/abonados"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Volver a Turnos Fijos
        </Link>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Nuevo Turno Fijo</h1>
        <p className="text-xs text-muted-foreground">
          Configurá la reserva fija semanal y los datos del cliente regular.
        </p>
      </div>
      <AbonadoForm
        courts={courtOptions}
        submitAction={submitNewAbonado}
        previewAction={previewAbonadoSlotsAction}
      />
    </div>
  )
}
