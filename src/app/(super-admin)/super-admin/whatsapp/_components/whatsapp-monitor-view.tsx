import { ExternalLink } from 'lucide-react'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { TONE_BADGE, TONE_TEXT, type StatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type {
  WhatsappMonitor,
  WhatsappTenantHealth,
} from '@/modules/super-admin/whatsapp-monitor.service'
import { formatDayStr, formatShortDateTime } from '../../_components/sa-format'
import { EmptyHint, PulsoSection } from '../../_components/pulso/pulso-section'

const PAUSE_LABEL: Record<string, string> = {
  owner_replied: 'contestó el dueño',
  handoff_weather: 'clima',
  handoff_complaint: 'reclamo',
  handoff_event: 'evento',
  handoff_other: 'otro motivo',
  bot_error: 'error del bot',
  manual: 'a mano',
}

const KAPSO_URL = 'https://app.kapso.ai'
const ANTHROPIC_BILLING_URL = 'https://platform.claude.com/settings/billing'

const numberFmt = new Intl.NumberFormat('es-AR')
const usdFmt = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
})

function usd(value: number): string {
  return `US$ ${usdFmt.format(value)}`
}

function kapsoTone(k: WhatsappMonitor['kapso']): 'success' | 'warning' | 'destructive' {
  if (k.pct >= 100) return 'destructive'
  if (k.pct >= 80 || k.projected > k.limit) return 'warning'
  return 'success'
}

const BAR_COLOR: Record<'success' | 'warning' | 'destructive', string> = {
  success: 'bg-primary',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
}

function ExternalLinkItem({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  )
}

function KapsoCard({ kapso, month }: { kapso: WhatsappMonitor['kapso']; month: string }) {
  const tone = kapsoTone(kapso)
  const barPct = Math.min(100, kapso.pct)
  const { byDirection } = kapso
  return (
    <PulsoSection
      title="Kapso este mes"
      action={<ExternalLinkItem href={KAPSO_URL}>Ver en Kapso</ExternalLinkItem>}
    >
      <p className={cn('text-3xl font-semibold tabular-nums', TONE_TEXT[tone])}>
        {numberFmt.format(kapso.total)}{' '}
        <span className="text-base font-normal text-muted-foreground">
          de {numberFmt.format(kapso.limit)} mensajes · {Math.floor(kapso.pct)}%
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="Mensajes del mes sobre el límite del plan"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(barPct)}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', BAR_COLOR[tone])}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-foreground">
        Al ritmo actual, el mes cierra en unos{' '}
        <strong className="tabular-nums">{numberFmt.format(Math.round(kapso.projected))}</strong>.
        {kapso.pct >= 100 ? (
          <span className={cn('ml-1 font-medium', TONE_TEXT[tone])}>
            Ya se pasó del límite del plan.
          </span>
        ) : (
          kapso.crossingDay !== null && (
            <span className={cn('ml-1 font-medium', TONE_TEXT[tone])}>
              Se pasaría del límite alrededor del{' '}
              {formatDayStr(`${month}-${String(kapso.crossingDay).padStart(2, '0')}`)}.
            </span>
          )
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        Recibidos {numberFmt.format(byDirection.inbound)} · enviados por el bot{' '}
        {numberFmt.format(byDirection.outbound)} · escritos por el dueño{' '}
        {numberFmt.format(byDirection.owner)}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Aproximado: Kapso no informa su contador, se cuenta con nuestros registros. Plan Free: 2.000
        por mes (Pro: 100.000).
      </p>
    </PulsoSection>
  )
}

function AnthropicCard({ anthropic }: { anthropic: WhatsappMonitor['anthropic'] }) {
  const { tokens } = anthropic
  return (
    <PulsoSection
      title="Anthropic este mes"
      action={<ExternalLinkItem href={ANTHROPIC_BILLING_URL}>Ver saldo</ExternalLinkItem>}
    >
      <p className="text-3xl font-semibold tabular-nums text-foreground">
        {usd(anthropic.costUsd)}
      </p>
      <p className="mt-3 text-sm text-foreground">
        Al ritmo actual, el mes cierra en unos{' '}
        <strong className="tabular-nums">{usd(anthropic.projectedUsd)}</strong>.
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        Entrada {numberFmt.format(tokens.input)} · caché {numberFmt.format(tokens.cached)} · salida{' '}
        {numberFmt.format(tokens.output)} tokens
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Estimado con los tokens guardados y el precio de Claude Haiku 5.5. Anthropic no informa el
        saldo: se mira en su consola.
      </p>
    </PulsoSection>
  )
}

function Pill({ tone, children }: { tone: StatusTone; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_BADGE[tone],
      )}
    >
      {children}
    </span>
  )
}

function stateOf(t: WhatsappTenantHealth): { tone: StatusTone; label: string } {
  if (t.status === 'disconnected') return { tone: 'destructive', label: 'Desconectado' }
  if (!t.enabled) return { tone: 'neutral', label: 'Apagado' }
  if (t.backlog > 0) return { tone: 'warning', label: 'Mensajes sin contestar' }
  if (t.silent) return { tone: 'warning', label: 'Sin mensajes hace horas' }
  return { tone: 'success', label: 'Andando' }
}

function pausedText(paused: Record<string, number>): string {
  const parts = Object.entries(paused).map(([reason, n]) => `${n} ${PAUSE_LABEL[reason] ?? reason}`)
  return parts.length === 0 ? '—' : parts.join(', ')
}

function TenantsTable({ tenants }: { tenants: WhatsappTenantHealth[] }) {
  return (
    <PulsoSection title="Complejos conectados">
      {tenants.length === 0 ? (
        <EmptyHint text="Todavía no hay ningún complejo con el bot conectado." />
      ) : (
        <ResponsiveList
          flat
          className="-mx-4 sm:-mx-6"
          cards={<TenantCards tenants={tenants} />}
          table={
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium sm:px-6">Complejo</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 pr-4 font-medium">Último recibido</th>
                  <th className="py-2 pr-4 font-medium">Último enviado</th>
                  <th className="py-2 pr-4 text-right font-medium">Sin contestar</th>
                  <th className="py-2 pr-4 font-medium">Pausados</th>
                  <th className="py-2 pr-4 text-right font-medium">Mensajes</th>
                  <th className="py-2 pr-4 text-right font-medium">Gasto</th>
                  <th className="py-2 pr-4 text-right font-medium sm:pr-6">Reservas del bot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tenants.map((t) => {
                  const state = stateOf(t)
                  return (
                    <tr key={t.tenantId}>
                      <td className="px-4 py-2 sm:px-6">
                        <div className="font-medium text-foreground">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.slug}
                          {t.displayPhoneNumber ? ` · ${t.displayPhoneNumber}` : ''}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <Pill tone={state.tone}>{state.label}</Pill>
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                        {formatShortDateTime(t.lastInboundAt)}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                        {formatShortDateTime(t.lastOutboundAt)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{t.backlog}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {pausedText(t.pausedByReason)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {numberFmt.format(t.monthMessages)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{usd(t.monthUsd)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums sm:pr-6">
                        {t.botBookings}
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          ({t.botBookingsDepositPaid} con seña paga)
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          }
        />
      )}
    </PulsoSection>
  )
}

function TenantCards({ tenants }: { tenants: WhatsappTenantHealth[] }) {
  return (
    <ul className="divide-y divide-border">
      {tenants.map((t) => {
        const state = stateOf(t)
        return (
          <li key={t.tenantId} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{t.name}</div>
                {t.displayPhoneNumber && (
                  <div className="text-xs text-muted-foreground">{t.displayPhoneNumber}</div>
                )}
              </div>
              <Pill tone={state.tone}>{state.label}</Pill>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
              <dt className="text-muted-foreground">Sin contestar</dt>
              <dd className="text-right">{t.backlog}</dd>
              <dt className="text-muted-foreground">Mensajes</dt>
              <dd className="text-right">{numberFmt.format(t.monthMessages)}</dd>
              <dt className="text-muted-foreground">Gasto</dt>
              <dd className="text-right">{usd(t.monthUsd)}</dd>
              <dt className="text-muted-foreground">Reservas del bot</dt>
              <dd className="text-right">
                {t.botBookings} ({t.botBookingsDepositPaid} con seña)
              </dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              Pausados: {pausedText(t.pausedByReason)} · último recibido{' '}
              {formatShortDateTime(t.lastInboundAt)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

/** Cuerpo de `/super-admin/whatsapp`: consumo de Kapso y Anthropic, y salud por complejo. */
export function WhatsappMonitorView({ data }: { data: WhatsappMonitor }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <KapsoCard kapso={data.kapso} month={data.month} />
        <AnthropicCard anthropic={data.anthropic} />
      </div>
      <TenantsTable tenants={data.tenants} />
    </div>
  )
}
