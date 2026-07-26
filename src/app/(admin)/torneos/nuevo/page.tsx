import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { createTournamentAction } from '../actions'
import { TorneoForm } from './TorneoForm'

export default async function NuevoTorneoPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const [enabled, role] = await Promise.all([
    isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id),
    getStaffRole(tenant.id, user.staffUserId),
  ])
  if (!enabled) notFound()
  // Crear un torneo es configuración: solo el dueño. La action lo re-chequea
  // con requireAdminStaffAction — esto es para no mostrar un form que va a fallar.
  if (role !== 'admin') redirect('/torneos')

  return (
    <div className="p-6 space-y-6">
      <Link
        href="/torneos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a Torneos
      </Link>

      <PageHeader
        title="Nuevo torneo"
        subtitle="Los horarios y los equipos se cargan después"
        icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
      />

      <div className="max-w-2xl">
        <TorneoForm action={createTournamentAction} />
      </div>
    </div>
  )
}
