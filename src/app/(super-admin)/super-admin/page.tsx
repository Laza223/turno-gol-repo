import { LayoutDashboard } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { getDashboardData } from '@/modules/super-admin/dashboard.service'
import { withTimeout } from '@/shared/utils/async'
import { SuperAdminDashboardView } from './_components/dashboard-view'

// Métricas en vivo — nunca servir un snapshot cacheado del build.
export const dynamic = 'force-dynamic'

// Normalmente ~1 s. Sin tope, una lectura que no vuelve deja el spinner del
// navegador hasta el timeout de 300 s de Vercel; con tope cae al `error.tsx`
// del panel, que queda dentro del shell con la navegación a mano.
const DASHBOARD_TIMEOUT_MS = 15_000

export default async function SuperAdminDashboardPage() {
  const data = await withTimeout(
    getDashboardData(),
    DASHBOARD_TIMEOUT_MS,
    'El dashboard tardó demasiado en cargar.',
  )

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
