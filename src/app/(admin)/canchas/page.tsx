import { redirect } from 'next/navigation'
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
    <main className="max-w-4xl mx-auto px-4 py-8">
      <CourtList
        initialCourts={courts}
        openingHours={tenant.openingHours}
        isAdmin={role === 'admin'}
        tenantName={tenant.name}
      />
    </main>
  )
}
