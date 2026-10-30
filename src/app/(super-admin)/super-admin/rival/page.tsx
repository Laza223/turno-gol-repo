import { Swords } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import {
  getRivalMonitor,
  listRivalReports,
  type RivalMonitor,
  type RivalReportedMatch,
} from '@/modules/super-admin/rival-monitor.service'
import { logger } from '@/shared/lib/logger'
import { withTimeout } from '@/shared/utils/async'
import { PulsoUnavailable } from '../_components/pulso/pulso-unavailable'
import { RivalMonitorView } from './_components/rival-monitor-view'
import { hideRivalMatchAction, removeRivalAvatarAction, restoreRivalMatchAction } from './actions'

// Datos en vivo — nunca servir un snapshot cacheado del build.
export const dynamic = 'force-dynamic'

// Mismo criterio que el Pulso: una lectura que no vuelve no deja la página colgada.
const READ_TIMEOUT_MS = 12_000

async function readAll(): Promise<{
  monitor: RivalMonitor
  reports: RivalReportedMatch[]
} | null> {
  try {
    const [monitor, reports] = await withTimeout(
      Promise.all([getRivalMonitor(), listRivalReports()]),
      READ_TIMEOUT_MS,
      'El panel de RIVAL tardó demasiado.',
    )
    return { monitor, reports }
  } catch (err) {
    logger.error('super-admin rival: panel no disponible', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export default async function SuperAdminRivalPage() {
  // El layout ya lo chequea, pero un pedido RSC puede traer solo el segmento de la page.
  await requireSystemAdmin()
  const data = await readAll()

  return (
    <div className="space-y-3 lg:space-y-6">
      <PageHeader
        title="RIVAL"
        subtitle="Cómo anda y qué hay que moderar."
        icon={
          <Swords className="h-6 w-6 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
        }
      />
      {data ? (
        <RivalMonitorView
          monitor={data.monitor}
          reports={data.reports}
          actions={{
            hide: hideRivalMatchAction,
            restore: restoreRivalMatchAction,
            removeAvatar: removeRivalAvatarAction,
          }}
        />
      ) : (
        <PulsoUnavailable />
      )}
    </div>
  )
}
