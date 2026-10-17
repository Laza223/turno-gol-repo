import { Suspense } from 'react'
import { Activity } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import {
  getPlatformActivity,
  isActivityWindow,
  type PlatformActivity,
} from '@/modules/super-admin/activity.service'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { getDashboardData, type DashboardData } from '@/modules/super-admin/dashboard.service'
import { logger } from '@/shared/lib/logger'
import { withTimeout } from '@/shared/utils/async'
import { SuperAdminDashboardView } from './_components/dashboard-view'
import { PulsoAttention } from './_components/pulso/pulso-attention'
import { PulsoFeed } from './_components/pulso/pulso-feed'
import { PulsoSeries } from './_components/pulso/pulso-series'
import {
  ActivityTopSkeleton,
  FeedSkeleton,
  RestSkeleton,
} from './_components/pulso/pulso-skeletons'
import { PulsoStats } from './_components/pulso/pulso-stats'
import { PulsoUnavailable } from './_components/pulso/pulso-unavailable'
import { WindowSwitch } from './_components/pulso/window-switch'

// Métricas en vivo — nunca servir un snapshot cacheado del build.
export const dynamic = 'force-dynamic'

// Tope por sección: sin él, una lectura que no vuelve deja la página colgada
// hasta los 300 s de Vercel. Con tope, esa sección dice "no se pudo leer" y el
// resto de la página sigue andando.
const SECTION_TIMEOUT_MS = 12_000

/** Resuelve a `null` (y loguea) si la lectura falla o vence: nunca tira la página. */
async function settle<T>(promise: Promise<T>, section: string): Promise<T | null> {
  try {
    return await withTimeout(promise, SECTION_TIMEOUT_MS, `El Pulso (${section}) tardó demasiado.`)
  } catch (err) {
    logger.error('super-admin pulso: sección no disponible', {
      section,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

type ActivityRead = Promise<PlatformActivity | null>
type DashboardRead = Promise<DashboardData | null>

// Cada bloque es un server component async propio con su Suspense. La actividad
// y el resto leen en paralelo (dos promesas) y uno puede fallar sin llevarse al
// otro. Se reparten en cuatro bloques solo para mantener el orden de lectura.
async function ActivityTop({ activity }: { activity: ActivityRead }) {
  const data = await activity
  if (!data) return <PulsoUnavailable />
  return (
    <div className="space-y-6">
      <PulsoStats activity={data} />
      <PulsoSeries series={data.series} />
    </div>
  )
}

async function Attention({ dashboard }: { dashboard: DashboardRead }) {
  const data = await dashboard
  // El aviso de "no se pudo leer" ya lo da `Rest`.
  if (!data) return null
  return <PulsoAttention data={data} />
}

async function Feed({ activity }: { activity: ActivityRead }) {
  const data = await activity
  // El aviso de "no se pudo leer" ya lo da `ActivityTop`.
  if (!data) return null
  return <PulsoFeed activity={data} />
}

async function Rest({ dashboard }: { dashboard: DashboardRead }) {
  const data = await dashboard
  if (!data) return <PulsoUnavailable />
  return <SuperAdminDashboardView data={data} />
}

export default async function SuperAdminPulsoPage({
  searchParams,
}: {
  searchParams: Promise<{ ventana?: string }>
}) {
  // El layout ya lo chequea, pero un pedido RSC puede traer solo el segmento
  // de la page, y esta muestra nombres de jugadores leídos con el rol worker.
  await requireSystemAdmin()
  const { ventana } = await searchParams
  const window = isActivityWindow(ventana) ? ventana : 'hoy'

  // Las dos lecturas arrancan acá, en paralelo, antes de pintar nada.
  const activity = settle(getPlatformActivity(window), 'actividad')
  const dashboard = settle(getDashboardData(), 'resto')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pulso"
        subtitle="Cómo viene la plataforma hoy y esta semana."
        icon={
          <Activity className="h-6 w-6 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
        }
        actions={<WindowSwitch current={window} />}
      />

      <Suspense fallback={<ActivityTopSkeleton />}>
        <ActivityTop activity={activity} />
      </Suspense>

      <Suspense fallback={null}>
        <Attention dashboard={dashboard} />
      </Suspense>

      <Suspense fallback={<FeedSkeleton />}>
        <Feed activity={activity} />
      </Suspense>

      <Suspense fallback={<RestSkeleton />}>
        <Rest dashboard={dashboard} />
      </Suspense>
    </div>
  )
}
