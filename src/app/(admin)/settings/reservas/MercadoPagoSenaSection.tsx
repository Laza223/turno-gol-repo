import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Info } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { DisconnectMpSection } from '../facturacion/DisconnectMpSection'
import type { DisconnectMpResult } from '../facturacion/actions'

// Nunca mostrar el código crudo del callback OAuth: siempre qué pasó + qué
// hacer (pages/onboarding.md §6.7). Vivía en Facturación; se mudó con la
// conexión (2026-09-25) tal cual, no se reescribe.
const MP_UNAVAILABLE = new Set(['mp_not_configured', 'mp_config_missing'])

function mpErrorMessage(code: string, conflictTenant?: string | null): string {
  if (code === 'mp_already_connected') {
    const cual = conflictTenant ? `"${conflictTenant}"` : 'otro complejo'
    return `Esa cuenta de MercadoPago ya está cobrando para ${cual}. Cada complejo necesita su propia cuenta: entrá a MercadoPago con la cuenta de este complejo y volvé a intentar.`
  }
  if (MP_UNAVAILABLE.has(code)) {
    return 'La conexión con MercadoPago no está disponible en este momento. Probá de nuevo más tarde.'
  }
  return 'No pudimos conectar MercadoPago. Probá de nuevo en un momento.'
}

/**
 * La cuenta de MercadoPago del complejo (Checkout Pro, OAuth) — donde entra la
 * plata de las señas. Vivía en Facturación, mezclada con la cuota que se le
 * paga a TurnoGol, que es otra app de MercadoPago y otra cuenta; desde el
 * 2026-09-25 está acá, al lado de la seña que habilita, y "Desconectar" dejó
 * de estar escondido dentro de "Dar de baja".
 *
 * `/api/mp/oauth-start` y `/api/mp/callback` vuelven a
 * `/settings/reservas#mercado-pago` (con `?error=` si falló), así que el
 * `id` y el `scroll-mt-24` son el aterrizaje de ese viaje.
 */
export function MercadoPagoSenaSection({
  connected,
  nickname,
  requiresDeposit,
  error,
  conflictTenant,
  disconnectAction,
}: {
  connected: boolean
  nickname: string | null
  /** Hoy cobra seña: desconectar la apaga (lo dice el diálogo). */
  requiresDeposit: boolean
  /** `?error=` que deja el callback de OAuth. */
  error?: string
  /** `?complejo=`: el otro complejo que ya usa esa cuenta. */
  conflictTenant?: string | null
  disconnectAction: () => Promise<DisconnectMpResult>
}) {
  return (
    <section
      id="mercado-pago"
      aria-labelledby="mercado-pago-titulo"
      className="card-premium scroll-mt-24 rounded-lg p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="mercado-pago-titulo"
            className="flex items-center gap-2 text-base font-semibold text-foreground"
          >
            <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            MercadoPago para cobrar la seña
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Donde te entra la plata de las señas. No es la cuenta con la que le pagás a TurnoGol.
          </p>
        </div>
        {connected && (
          <StatusBadge
            className="shrink-0"
            visual={{ icon: CheckCircle2, label: 'Conectado', tone: 'success' }}
          />
        )}
      </div>

      {connected ? (
        <div className="mt-4 max-w-2xl space-y-2">
          {/* Decir CUÁL cuenta está conectada, no solo que hay una: MercadoPago
              no vuelve a pedir permiso si la app ya está autorizada, así que
              conectar la cuenta personal en vez de la del complejo era un clic
              sin ninguna pantalla de por medio — y las señas caían ahí sin que
              nada lo dijera. */}
          <p className="text-sm text-foreground">
            Cobrando en la cuenta <span className="font-semibold">{nickname ?? 'conectada'}</span>.
            Si no es la del complejo, desconectala y conectá la correcta.
          </p>
          {/* MercadoPago le pone 18 días de plazo a toda cuenta nueva por default
              (verificado en producción, 2026-08-19: la cuenta configurada libera
              antes, la default no). Es un ajuste DENTRO del panel de MercadoPago,
              no algo que TurnoGol pueda cambiar por el complejo — por eso el aviso
              recién aparece una vez conectado. */}
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Por defecto, MercadoPago tarda 18 días en acreditarte cada seña.{' '}
              <a
                href="https://youtu.be/pwUFOdZMxYs"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                Mirá cómo cobrarla al instante (2 min)
              </a>
              .
            </span>
          </p>
        </div>
      ) : (
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
          Conectá la cuenta de MercadoPago del complejo para cobrar la seña de las reservas por
          internet.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex max-w-2xl items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{mpErrorMessage(error, conflictTenant)}</p>
        </div>
      )}

      {connected ? (
        <DisconnectMpSection
          nickname={nickname}
          requiresDeposit={requiresDeposit}
          disconnectAction={disconnectAction}
        />
      ) : (
        <a
          href="/api/mp/oauth-start"
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:h-10"
        >
          Conectar MercadoPago <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      )}
    </section>
  )
}
