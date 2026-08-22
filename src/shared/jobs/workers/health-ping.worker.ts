import type PgBoss from 'pg-boss'
import * as Sentry from '@sentry/nextjs'
// Excepción legítima a `turnogol/jobs-worker-pool`: la sonda mide el DSN DE LA
// APP, que es justo el que le importa al usuario final. `SELECT 1` no toca
// ninguna tabla, así que RLS no puede alterar el resultado — el riesgo que la
// regla persigue (ver cero filas en silencio) no existe acá.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import { CRON_WORK_OPTIONS, QUEUE_HEALTH_PING } from '../definitions'
import { logger } from '@/shared/lib/logger'

type PingStatus = 'ok' | 'down'
type PingResult = {
  name: string
  status: PingStatus
  latencyMs?: number
  error?: string
  note?: string
}

const FETCH_TIMEOUT_MS = 5000

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

async function pingDb(): Promise<PingResult> {
  const t0 = Date.now()
  try {
    await getSql()`SELECT 1`
    return { name: 'database', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'database', status: 'down', error: (err as Error).message }
  }
}

async function pingPgBoss(): Promise<PingResult> {
  const t0 = Date.now()
  try {
    const boss = await getBoss()
    try {
      await boss.getQueueSize('send-email')
    } catch (innerErr) {
      const msg = String((innerErr as Error).message ?? innerErr).toLowerCase()
      // Pool alive; role lacks introspection privilege — by design in prod.
      if (msg.includes('permission denied') || msg.includes('does not exist')) {
        return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
      }
      throw innerErr
    }
    return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'pg-boss', status: 'down', error: (err as Error).message }
  }
}

export async function pingSupabaseAuth(): Promise<PingResult> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base) return { name: 'supabase-auth', status: 'ok', note: 'not configured' }
  // Sin la anon key `/auth/v1/health` contesta 401 SIEMPRE: GoTrue exige el
  // header `apikey` en todos sus endpoints, incluido el de salud. La sonda
  // nació sin él, así que venía gritando "supabase-auth down" cada 5 minutos
  // desde el día uno, con el login funcionando perfecto — una alarma que no
  // podía apagarse nunca, que es la peor clase de alarma: entrena a ignorarlas.
  // Mismo criterio que `pingResend`, que sí manda su credencial.
  if (!anonKey) return { name: 'supabase-auth', status: 'ok', note: 'not configured' }
  const t0 = Date.now()
  try {
    const res = await timedFetch(`${base}/auth/v1/health`, { headers: { apikey: anonKey } })
    if (res.ok) return { name: 'supabase-auth', status: 'ok', latencyMs: Date.now() - t0 }
    return { name: 'supabase-auth', status: 'down', error: `HTTP ${res.status}` }
  } catch (err) {
    return { name: 'supabase-auth', status: 'down', error: (err as Error).message }
  }
}

async function pingResend(): Promise<PingResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { name: 'resend', status: 'ok', note: 'not configured' }
  const t0 = Date.now()
  try {
    // /domains is a cheap authenticated GET — never sends an email. A 401 means
    // the key is broken (a real, alert-worthy problem); 429 = rate-limited but up.
    const res = await timedFetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.ok || res.status === 429) {
      return { name: 'resend', status: 'ok', latencyMs: Date.now() - t0 }
    }
    return { name: 'resend', status: 'down', error: `HTTP ${res.status}` }
  } catch (err) {
    return { name: 'resend', status: 'down', error: (err as Error).message }
  }
}

async function pingMercadoPago(): Promise<PingResult> {
  const t0 = Date.now()
  try {
    // Reachability only: we hold per-tenant OAuth tokens, not a platform token,
    // so any HTTP response (even 401) proves the MP API is up. A network/timeout
    // error means it's unreachable. Per-token validity is covered by
    // refresh-mp-tokens.worker.
    await timedFetch('https://api.mercadopago.com/v1/payment_methods')
    return { name: 'mercadopago', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'mercadopago', status: 'down', error: (err as Error).message }
  }
}

/**
 * Periodic liveness probe of the critical dependencies (Fase 3 — Resiliencia).
 * Runs every 5 min in the worker process and alerts Sentry the moment a
 * dependency degrades, so ops learns before users do. Never throws: a degraded
 * dependency is reported, not raised — otherwise the job would land in the DLQ
 * and double-alert.
 */
async function runHealthPing(): Promise<PingResult[]> {
  const results = await Promise.all([
    pingDb(),
    pingPgBoss(),
    pingSupabaseAuth(),
    pingResend(),
    pingMercadoPago(),
  ])

  const down = results.filter((r) => r.status === 'down')
  if (down.length > 0) {
    const names = down.map((d) => d.name).join(', ')
    Sentry.captureMessage(`Health ping degraded: ${names}`, {
      level: 'warning',
      tags: { module: 'health-ping' },
      extra: { checks: results },
    })
    logger.error('health.ping.degraded', {
      module: 'health-ping',
      down: names,
      checks: results,
    })
  } else {
    logger.info('health.ping.ok', { module: 'health-ping' })
  }

  return results
}

export async function registerHealthPingWorker(boss: PgBoss): Promise<void> {
  // Every 5 minutes.
  await boss.schedule(QUEUE_HEALTH_PING, '*/5 * * * *', {})
  await boss.work(QUEUE_HEALTH_PING, CRON_WORK_OPTIONS, async () => {
    await runHealthPing()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_HEALTH_PING })
}
