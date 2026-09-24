import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { PageHeader } from '@/components/admin/PageHeader'
import { BackLink } from '@/components/admin/BackLink'
import AbonadoForm from './AbonadoForm'
import { submitNewAbonado, previewAbonadoSlotsAction } from './actions'
import { searchAbonadoPlayersAction } from '../actions'

export default async function NuevoAbonadoPage() {
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant } = auth

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  const courtOptions = courts.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="space-y-6">
      <PageHeader
        variant="plain"
        title="Nuevo turno fijo"
        subtitle="Configurá la reserva fija semanal y los datos del cliente regular."
        back={<BackLink href="/abonados">Volver a Turnos fijos</BackLink>}
      />
      <AbonadoForm
        courts={courtOptions}
        submitAction={submitNewAbonado}
        previewAction={previewAbonadoSlotsAction}
        searchPlayersAction={searchAbonadoPlayersAction}
      />
    </div>
  )
}
