import { notFound } from 'next/navigation'
import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { getWhatsappConnection } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { SettingsHeader } from '../SettingsHeader'
import { WhatsappBotToggle } from './WhatsappBotToggle'
import { setWhatsappBotEnabledAction } from './actions'

/**
 * Asistente de WhatsApp (extra pago). Solo existe para los complejos que lo
 * tienen: sin conexión o con el flag apagado, 404.
 */
export default async function WhatsappSettingsPage() {
  const { tenant } = await requireAdminStaff()
  const connection = await withTenantContext(tenant.id, (tx) =>
    getWhatsappConnection(tenant.id, tx),
  )
  if (!connection) notFound()

  return (
    <div className="space-y-6">
      <SettingsHeader title="Asistente de WhatsApp" />

      <div className="card-premium space-y-4 rounded-lg p-6">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Contesta los mensajes de {connection.displayPhoneNumber ?? 'tu WhatsApp'}, muestra los
            turnos libres y reserva por vos.
          </p>
          <p>
            Cuando contestás vos desde el celular, se calla 4 horas en ese chat. Lluvia, reclamos y
            eventos te los pasa a vos con una notificación.
          </p>
        </div>

        {connection.connected ? (
          <WhatsappBotToggle enabled={connection.enabled} action={setWhatsappBotEnabledAction} />
        ) : (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
            Tu número se desconectó. Escribinos y lo volvemos a conectar.
          </p>
        )}
      </div>
    </div>
  )
}
