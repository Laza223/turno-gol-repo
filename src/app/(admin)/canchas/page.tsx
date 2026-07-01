import { Trophy } from 'lucide-react'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { CourtList } from './components/CourtList'

// Ver canchas + activar/desactivar es operativo (admin+manager); crear/editar
// (precio, nombre, formato) sigue admin-only (audit_report.md 3-18, decisión
// revisada 2026-07-01: el manager necesita poder apagar una cancha por lluvia
// o mantenimiento sin depender del admin).
export default async function CanchasPage() {
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant, role } = auth

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <PageHeader
        title="Canchas"
        subtitle={`Gestioná las canchas de ${tenant.name}`}
        icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
      />

      <CourtList
        initialCourts={courts}
        openingHours={tenant.openingHours}
        isAdmin={role === 'admin'}
      />
    </main>
  )
}
