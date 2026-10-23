import { notFound } from 'next/navigation'
import { PlusBadge } from '@/components/ui/plus-badge'
import { requireAdminStaff } from '@/modules/staff/guards'
import { getWhatsappPlusState } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { SettingsHeader } from '../SettingsHeader'
import { ConnectWhatsappButtons } from './ConnectWhatsappButton'
import { WhatsappBotToggle } from './WhatsappBotToggle'
import { CONNECT_ERROR_MESSAGE } from './connect-messages'
import {
  checkWhatsappConnectionAction,
  setWhatsappBotEnabledAction,
  startWhatsappConnectAction,
} from './actions'

const KEEP_ALIVE_TIP =
  'Para que no se desconecte, mandá al menos un mensaje desde la app de WhatsApp Business cada 14 días.'

function errorMessage(code: string | undefined): string | null {
  return code && Object.hasOwn(CONNECT_ERROR_MESSAGE, code)
    ? CONNECT_ERROR_MESSAGE[code as keyof typeof CONNECT_ERROR_MESSAGE]
    : null
}

/**
 * Asistente de WhatsApp (extra pago). Solo existe para los complejos que lo
 * tienen: con el flag apagado, 404. Con el flag prendido el dueño lo conecta
 * él mismo desde acá.
 */
export default async function WhatsappSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; error?: string }>
}) {
  const { tenant } = await requireAdminStaff({ allowReadOnly: true })
  const state = await getWhatsappPlusState(tenant.id)
  if (!state) notFound()
  const { connection } = state
  const { conectado, error } = await searchParams
  const errorText = errorMessage(error)

  return (
    <div className="space-y-6">
      <SettingsHeader title="Asistente de WhatsApp" />

      <div className="card-premium card-plus space-y-4 rounded-lg p-6">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">TurnoGol Plus</h2>
          <PlusBadge />
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Contesta los mensajes de {connection?.displayPhoneNumber ?? 'tu WhatsApp'}, muestra los
            turnos libres y reserva por vos.
          </p>
          <p>
            Cuando contestás vos desde el celular, se calla 6 horas en ese chat. Lluvia, reclamos y
            eventos te los pasa a vos con una notificación.
          </p>
        </div>

        {conectado === '1' && connection?.connected && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            ¡Listo! Tu WhatsApp quedó conectado. Prendé el asistente cuando quieras.
          </p>
        )}
        {errorText && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errorText}
          </p>
        )}

        {connection?.connected ? (
          <>
            <WhatsappBotToggle enabled={connection.enabled} action={setWhatsappBotEnabledAction} />
            <p className="text-sm text-muted-foreground">{KEEP_ALIVE_TIP}</p>
          </>
        ) : (
          <div className="space-y-4">
            {connection ? (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                Tu número se desconectó. Volvé a conectarlo para que el asistente siga contestando.
              </p>
            ) : (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Necesitás la app WhatsApp Business actualizada en tu celular y tu cuenta de
                  Facebook. Tarda 1 minuto.
                </p>
                <p>
                  Cuando Meta te pregunte, elegí tu número, no &quot;usar un nombre con número
                  virtual&quot;.
                </p>
                <p>{KEEP_ALIVE_TIP}</p>
              </div>
            )}
            <ConnectWhatsappButtons
              connectLabel={connection ? 'Volver a conectar' : 'Conectar mi WhatsApp'}
              startAction={startWhatsappConnectAction}
              checkAction={checkWhatsappConnectionAction}
            />
          </div>
        )}
      </div>
    </div>
  )
}
