import { LayoutDashboard } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { getDashboardData } from '@/modules/super-admin/dashboard.service'
import { SuperAdminDashboardView } from './_components/dashboard-view'

// Métricas en vivo — nunca servir un snapshot cacheado del build.
export const dynamic = 'force-dynamic'

export default async function SuperAdminDashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard global"
        subtitle="Métricas cross-tenant de la plataforma"
        icon={
          <LayoutDashboard
            className="h-6 w-6 text-violet-600 dark:text-violet-400"
            aria-hidden="true"
          />
        }
      />

      <SuperAdminDashboardView data={data} />
    </div>
  )
}
