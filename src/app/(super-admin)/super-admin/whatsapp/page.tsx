import { MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import {
  getWhatsappMonitor,
  type WhatsappMonitor,
} from '@/modules/super-admin/whatsapp-monitor.service'
import { logger } from '@/shared/lib/logger'
import { withTimeout } from '@/shared/utils/async'
import { PulsoUnavailable } from '../_components/pulso/pulso-unavailable'
import { WhatsappMonitorView } from './_components/whatsapp-monitor-view'

// Consumo en vivo — nunca servir un snapshot cacheado del build.
export const dynamic = 'force-dynamic'

// Mismo criterio que el Pulso: una lectura que no vuelve no deja la página colgada.
const READ_TIMEOUT_MS = 12_000

async function readMonitor(): Promise<WhatsappMonitor | null> {
  try {
    return await withTimeout(
      getWhatsappMonitor(),
      READ_TIMEOUT_MS,
      'El monitor del bot tardó demasiado.',
    )
  } catch (err) {
    logger.error('super-admin whatsapp: monitor no disponible', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export default async function SuperAdminWhatsappPage() {
  // El layout ya lo chequea, pero un pedido RSC puede traer solo el segmento de la page.
  await requireSystemAdmin()
  const data = await readMonitor()

  return (
    <div className="space-y-3 lg:space-y-6">
      <PageHeader
        title="Bot de WhatsApp"
        subtitle="Cuánto consume y cómo anda en cada complejo."
        icon={
          <MessageCircle
            className="h-6 w-6 text-violet-700 dark:text-violet-300"
            aria-hidden="true"
          />
        }
      />
      {data ? <WhatsappMonitorView data={data} /> : <PulsoUnavailable />}
    </div>
  )
}
