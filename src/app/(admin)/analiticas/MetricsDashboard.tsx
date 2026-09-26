'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { TenantMetrics } from '@/modules/metrics/metrics.service'
import type { SystemStatus } from '@/app/api/admin/system-status/route'
import { rejectionMessage } from '@/shared/lib/rejection-message'
import { formatPct, relativeTimeEs } from '@/lib/format'
import { noShowTrend } from './dashboard-helpers'

const REFRESH_INTERVAL_MS = 60_000

const GENERIC_LOAD_ERROR = 'No pudimos cargar las métricas. Probá de nuevo en unos segundos.'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="card-premium p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

const pts = (n: number) => String(Math.abs(n)).replace('.', ',')

/**
 * Tasa de ausencias + tendencia contra los 30 días anteriores. Debajo de
 * MIN_FINISHED_FOR_TREND turnos terminados (en cualquiera de las dos ventanas)
 * la comparación se oculta — ver noShowTrend (H174).
 */
function NoShow({ metrics }: { metrics: TenantMetrics }) {
  if (metrics.noShow.finished === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay turnos terminados.</p>
  }
  const trend = noShowTrend(metrics.noShow, metrics.noShowPrev)
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        <span className="font-display text-xl font-bold tabular-nums text-foreground">
          {formatPct(Math.round(metrics.noShow.rate * 1000) / 10)}
        </span>{' '}
        · {metrics.noShow.noShow} de {metrics.noShow.finished} turnos terminados
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {trend.kind === 'no_prev' && 'Sin datos de los 30 días anteriores.'}
        {/* H174: muestra chica en cualquiera de las dos ventanas — el valor de
         * arriba sigue siendo real, pero comparar sobre pocas decenas de
         * turnos es ruido. Sin flecha ni color. */}
        {trend.kind === 'low_sample' && 'Todavía no hay datos suficientes para comparar.'}
        {trend.kind === 'flat' && 'Igual que los 30 días anteriores.'}
        {trend.kind === 'up' && (
          <span className="inline-flex items-center gap-0.5 font-medium text-red-700 dark:text-red-300">
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />+{pts(trend.deltaPts)} pts vs
            los 30 días anteriores
          </span>
        )}
        {trend.kind === 'down' && (
          <span className="inline-flex items-center gap-0.5 font-medium text-emerald-700 dark:text-emerald-400">
            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />−{pts(trend.deltaPts)} pts
            vs los 30 días anteriores
          </span>
        )}
      </p>
    </div>
  )
}

/** Los 5 horarios de inicio más pedidos, con la barra de "Lo que más salió". */
function TopSlots({ metrics }: { metrics: TenantMetrics }) {
  const max = Math.max(1, ...metrics.topSlots.map((s) => s.count))
  return (
    <ol className="space-y-3">
      {metrics.topSlots.map((slot) => (
        <li key={slot.time} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium tabular-nums text-foreground">{slot.time}</span>
            <span className="tabular-nums text-muted-foreground">
              {slot.count} {slot.count === 1 ? 'turno' : 'turnos'}
            </span>
          </div>
          <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max((slot.count / max) * 100, 1)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * Lo que solo existe en ventana corrida de 30 días: qué horarios se piden y
 * cuántos faltan. Con un complejo que todavía no jugó nada no se muestra: el
 * vacío del mes ya lo dice.
 */
function Recent({ metrics, staleError }: { metrics: TenantMetrics; staleError: string | null }) {
  if (metrics.topSlots.length === 0 && metrics.noShow.finished === 0) return null
  return (
    <section aria-labelledby="ultimos-30" className="card-premium space-y-4 p-4 sm:p-5">
      <h2 id="ultimos-30" className="text-sm font-semibold text-foreground">
        Últimos 30 días
      </h2>
      {staleError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {staleError} Estás viendo datos anteriores.
        </p>
      )}
      {metrics.topSlots.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Horarios más pedidos</h3>
          <TopSlots metrics={metrics} />
        </div>
      )}
      <div className={metrics.topSlots.length > 0 ? 'border-t border-border pt-4' : undefined}>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">Ausencias</h3>
        <NoShow metrics={metrics} />
      </div>
    </section>
  )
}

function RecentSkeleton() {
  return (
    <div className="card-premium space-y-4 p-4 sm:p-5" role="status" aria-label="Cargando métricas">
      <Skeleton className="h-4 w-28" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ))}
    </div>
  )
}

/** Panel de observabilidad: DB, colas pg-boss y último health ping. */
function SystemPanel({ status, nowMs }: { status: SystemStatus | null; nowMs: number }) {
  const totalDepth = status
    ? status.pgboss.queues.reduce<number | null>(
        (acc, q) => (acc === null || q.depth === null ? null : acc + q.depth),
        0,
      )
    : null

  return (
    <Card title="Estado del sistema">
      {!status ? (
        <p className="text-sm text-muted-foreground">No se pudo consultar el estado del sistema.</p>
      ) : (
        <>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Base de datos</dt>
              <dd>
                {status.db.status === 'ok' ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    Operativa{status.db.latencyMs !== null ? ` · ${status.db.latencyMs} ms` : ''}
                  </span>
                ) : (
                  <span className="font-medium text-red-600 dark:text-red-400">Caída</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Trabajos en cola</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {totalDepth === null ? '—' : totalDepth}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Último chequeo de salud</dt>
              <dd className="font-medium text-foreground">
                {status.lastHealthPing ? relativeTimeEs(status.lastHealthPing, nowMs) : '—'}
              </dd>
            </div>
          </dl>
          {/* axe (definition-list): <details> no es un hijo válido de <dl>, tiene que ir afuera. */}
          <details className="pt-1 text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Detalle por cola
            </summary>
            <ul className="mt-2 space-y-1">
              {status.pgboss.queues.map((q) => (
                <li key={q.queue} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{q.queue}</span>
                  <span className="tabular-nums text-foreground">
                    {q.depth === null ? '—' : q.depth}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Card>
  )
}

/**
 * La parte de Métricas que vive en el cliente y se refresca cada minuto: los
 * últimos 30 días (horarios y ausencias) y, solo para el superadmin de la
 * plataforma, el estado del sistema.
 *
 * `showRecent` es falso en los meses cerrados: los 30 días corridos son de
 * "ahora" y al lado de agosto no dicen nada (eran la mitad de las "dos páginas
 * pegadas"). Ahí ni se piden.
 */
export default function MetricsDashboard({
  canSeeSystem,
  showRecent,
}: {
  canSeeSystem: boolean
  showRecent: boolean
}) {
  const [metrics, setMetrics] = useState<TenantMetrics | null>(null)
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const load = useCallback(async () => {
    if (showRecent) {
      try {
        const res = await fetch('/api/admin/metrics', { cache: 'no-store' })
        if (!res.ok) throw new Error(await rejectionMessage(res, GENERIC_LOAD_ERROR))
        const json = (await res.json()) as { data: TenantMetrics }
        setMetrics(json.data)
        setError(null)
      } catch (err) {
        // Conservamos los últimos datos buenos; el aviso dice que son viejos.
        setError(err instanceof Error ? err.message : GENERIC_LOAD_ERROR)
      }
    }
    if (canSeeSystem) {
      try {
        const res = await fetch('/api/admin/system-status', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: SystemStatus }
        setSystem(json.data)
      } catch {
        setSystem(null)
      }
    }
    // Sello de "cuándo se cargaron estos números", que la UI muestra como
    // "actualizado hace X": el instante del fetch, no el del render.
    setNowMs(Date.now())
  }, [canSeeSystem, showRecent])

  useEffect(() => {
    // `load` es asincrónica y escribe estado recién después de sus `await`
    // (métricas, estado del sistema, sello de hora). El linter no puede
    // distinguir eso de un setState sincrónico, así que ve la llamada como si
    // encadenara un render. No lo hace: el efecto solo depende de `load`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const id = setInterval(() => void load(), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [load])

  let recent: React.ReactNode = null
  if (showRecent) {
    if (metrics) {
      recent = <Recent metrics={metrics} staleError={error} />
    } else if (error) {
      recent = (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )
    } else {
      recent = <RecentSkeleton />
    }
  }

  return (
    <>
      {recent}
      {canSeeSystem && <SystemPanel status={system} nowMs={nowMs} />}
    </>
  )
}
