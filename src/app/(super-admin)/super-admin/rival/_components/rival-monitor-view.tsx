'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { RIVAL_LEVEL_LABELS, RIVAL_REPORT_REASON_LABELS } from '@/modules/rival/rival-display'
import type { RivalLevel } from '@/modules/rival/rival.types'
import type {
  RivalMonitor,
  RivalReportedMatch,
  RivalWeek,
} from '@/modules/super-admin/rival-monitor.service'
import type { ActionResult } from '@/shared/types/action-result'
import { formatDayStr, formatShortDateTime } from '../../_components/sa-format'
import { EmptyHint, PulsoSection } from '../../_components/pulso/pulso-section'

type RivalModerationActions = {
  hide: (input: { matchId: string }) => Promise<ActionResult>
  restore: (input: { matchId: string }) => Promise<ActionResult>
  removeAvatar: (input: { playerId: string; matchId: string }) => Promise<ActionResult>
}

type Props = {
  monitor: RivalMonitor
  reports: RivalReportedMatch[]
  actions: RivalModerationActions
}

type Pending =
  | { kind: 'hide'; matchId: string }
  | { kind: 'restore'; matchId: string }
  | { kind: 'avatar'; matchId: string; playerId: string; name: string }

const numberFmt = new Intl.NumberFormat('es-AR')

function levelLabel(level: string): string {
  return RIVAL_LEVEL_LABELS[level as RivalLevel] ?? level
}

function Pill({
  tone,
  children,
}: {
  tone: 'destructive' | 'warning' | 'neutral'
  children: string
}) {
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

function ReportedMatchCard({
  match,
  onAction,
}: {
  match: RivalReportedMatch
  onAction: (p: Pending) => void
}) {
  const hidden = match.hiddenAt !== null
  return (
    <li className="space-y-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {match.tenantName} · Fútbol {match.format} · {levelLabel(match.level)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatShortDateTime(match.startsAt)}
            {match.canceled ? ' · cancelado' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hidden && <Pill tone="destructive">Oculto</Pill>}
          {match.openReports > 0 && (
            <Pill tone="warning">
              {match.openReports === 1
                ? '1 denuncia abierta'
                : `${match.openReports} denuncias abiertas`}
            </Pill>
          )}
          <Pill tone="neutral">{`${match.countingReporters} de 3 que cuentan`}</Pill>
        </div>
      </div>

      <ul className="space-y-1.5 text-sm">
        {match.reports.map((r, i) => (
          <li
            key={i}
            className={cn(
              'flex flex-wrap items-center justify-between gap-2',
              !r.open && 'text-muted-foreground',
            )}
          >
            <span>
              <strong className="font-medium">{RIVAL_REPORT_REASON_LABELS[r.reason]}</strong>
              {' · '}
              {r.reportedName ? `a ${r.reportedName}` : 'al partido'}
              {' · de '}
              {r.reporterName}
              {!r.countsForAutohide && ' (no cuenta para ocultar)'}
              {!r.open && ' (ya revisada)'}
            </span>
            {r.reportedPlayerId && r.reportedHasAvatar && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() =>
                  onAction({
                    kind: 'avatar',
                    matchId: match.matchId,
                    playerId: r.reportedPlayerId as string,
                    name: r.reportedName ?? 'esta persona',
                  })
                }
              >
                Quitar foto de {r.reportedName}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <div>
        {hidden ? (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => onAction({ kind: 'restore', matchId: match.matchId })}
          >
            Restaurar partido
          </Button>
        ) : (
          <Button
            variant="destructive"
            className="min-h-11"
            onClick={() => onAction({ kind: 'hide', matchId: match.matchId })}
          >
            Ocultar partido
          </Button>
        )}
      </div>
    </li>
  )
}

function ReportsSection({
  reports,
  actions,
}: {
  reports: RivalReportedMatch[]
  actions: RivalModerationActions
}) {
  const router = useRouter()
  const [pending, setPending] = useState<Pending | null>(null)

  async function confirm(): Promise<ActionResult> {
    if (!pending) return { success: true }
    const res =
      pending.kind === 'hide'
        ? await actions.hide({ matchId: pending.matchId })
        : pending.kind === 'restore'
          ? await actions.restore({ matchId: pending.matchId })
          : await actions.removeAvatar({ playerId: pending.playerId, matchId: pending.matchId })
    if (res.success) router.refresh()
    return res
  }

  const copy =
    pending &&
    {
      hide: {
        title: 'Ocultar este partido',
        description: 'Deja de verse en el tablón y por link, salvo para quien lo organizó.',
        label: 'Ocultar',
      },
      restore: {
        title: 'Restaurar este partido',
        description:
          'Vuelve a verse. Ojo: la próxima denuncia que cuente lo vuelve a ocultar, porque se suman todas las anteriores.',
        label: 'Restaurar',
      },
      avatar: {
        title: pending.kind === 'avatar' ? `Quitar la foto de ${pending.name}` : '',
        description: 'La persona queda sin foto y puede subir otra.',
        label: 'Quitar foto',
      },
    }[pending.kind]

  return (
    <PulsoSection title="Denuncias">
      {reports.length === 0 ? (
        <EmptyHint text="No hay partidos denunciados." />
      ) : (
        <ul className="-mx-4 divide-y divide-border sm:-mx-6">
          {reports.map((m) => (
            <ReportedMatchCard key={m.matchId} match={m} onAction={setPending} />
          ))}
        </ul>
      )}
      {copy && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null)
          }}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.label}
          variant={pending.kind === 'restore' ? 'default' : 'destructive'}
          onConfirm={async () => {
            const res = await confirm()
            if (res.success) setPending(null)
            return res
          }}
        />
      )}
    </PulsoSection>
  )
}

const WEEK_COLUMNS: Array<{ label: string; value: (w: RivalWeek) => string }> = [
  { label: 'Partidos creados', value: (w) => String(w.matchesCreated) },
  { label: 'En el tablón', value: (w) => String(w.matchesOnBoard) },
  { label: 'Personas sumadas', value: (w) => String(w.peopleJoined) },
  { label: 'Completos', value: (w) => String(w.matchesFilled) },
  {
    label: 'Mediana hasta completar',
    value: (w) =>
      w.medianMinutesToFill === null ? '—' : `${numberFmt.format(w.medianMinutesToFill)} min`,
  },
  { label: 'Pedidos aceptados', value: (w) => String(w.requestsAccepted) },
  { label: 'Pedidos rechazados', value: (w) => String(w.requestsDeclined) },
  { label: 'Pedidos sin respuesta', value: (w) => String(w.requestsUnanswered) },
  { label: 'Cuentas nuevas', value: (w) => String(w.newAccounts) },
  { label: 'Alertas enviadas', value: (w) => String(w.alertsSent) },
  { label: 'Denuncias', value: (w) => String(w.reports) },
  { label: 'Partidos ocultos', value: (w) => String(w.matchesHidden) },
]

function WeeksSection({ monitor }: { monitor: RivalMonitor }) {
  return (
    <PulsoSection title="Últimas 8 semanas">
      <div
        role="region"
        aria-label="Métricas por semana"
        tabIndex={0}
        className="-mx-4 overflow-x-auto sm:-mx-6"
      >
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium sm:px-6">Semana del</th>
              {WEEK_COLUMNS.map((c) => (
                <th key={c.label} className="py-2 pr-4 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {monitor.weeks.map((w) => (
              <tr key={w.week}>
                <td className="whitespace-nowrap px-4 py-2 sm:px-6">{formatDayStr(w.week)}</td>
                {WEEK_COLUMNS.map((c) => (
                  <td key={c.label} className="py-2 pr-4 text-right tabular-nums">
                    {c.value(w)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-foreground">
        Suscripciones activas a alertas:{' '}
        <strong className="tabular-nums">{monitor.activeAlertSubscriptions}</strong>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        No se muestran el origen por link (?ref=) ni las bajas de alertas: hoy no se guardan. Bajas
        y entradas desde el banco: no se miden todavía (falta guardar cuándo pasan). Los pedidos
        aceptados y rechazados se cuentan por la fecha del pedido. Personas sumadas cuenta cada
        persona una sola vez por semana.
      </p>
    </PulsoSection>
  )
}

function TenantsSection({ tenants }: { tenants: RivalMonitor['tenants'] }) {
  return (
    <PulsoSection title="Por complejo (8 semanas)">
      {tenants.length === 0 ? (
        <EmptyHint text="Todavía no hay partidos de RIVAL." />
      ) : (
        <div
          role="region"
          aria-label="Métricas por complejo"
          tabIndex={0}
          className="-mx-4 overflow-x-auto sm:-mx-6"
        >
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium sm:px-6">Complejo</th>
                <th className="py-2 pr-4 text-right font-medium">Creados</th>
                <th className="py-2 pr-4 text-right font-medium">En el tablón</th>
                <th className="py-2 pr-4 text-right font-medium">Personas</th>
                <th className="py-2 pr-4 text-right font-medium">Completos</th>
                <th className="py-2 pr-4 text-right font-medium">Denuncias</th>
                <th className="py-2 pr-4 text-right font-medium sm:pr-6">Ocultos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((t) => (
                <tr key={t.tenantId}>
                  <td className="px-4 py-2 font-medium sm:px-6">{t.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{t.matchesCreated}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{t.matchesOnBoard}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{t.peopleJoined}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{t.matchesFilled}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{t.reports}</td>
                  <td className="py-2 pr-4 text-right tabular-nums sm:pr-6">{t.matchesHidden}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PulsoSection>
  )
}

export function RivalMonitorView({ monitor, reports, actions }: Props) {
  return (
    <div className="space-y-3 lg:space-y-6">
      <ReportsSection reports={reports} actions={actions} />
      <WeeksSection monitor={monitor} />
      <TenantsSection tenants={monitor.tenants} />
    </div>
  )
}
