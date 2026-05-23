import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type CheckStatus = 'ok' | 'degraded' | 'down'

type Check = {
  name: string
  status: CheckStatus
  latencyMs?: number
  error?: string
}

async function checkDb(): Promise<Check> {
  const t0 = Date.now()
  try {
    const sql = getSql()
    await sql`SELECT 1`
    return { name: 'database', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'database', status: 'down', error: (err as Error).message }
  }
}

async function checkPgBoss(): Promise<Check> {
  const t0 = Date.now()
  try {
    const boss = await getBoss()
    try {
      await boss.getQueueSize('send-email')
    } catch (innerErr) {
      const msg = String((innerErr as Error).message ?? innerErr).toLowerCase()
      if (msg.includes('permission denied') || msg.includes('does not exist')) {
        // Pool alive; role lacks introspection privilege — that's by design in prod.
        return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
      }
      throw innerErr
    }
    return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'pg-boss', status: 'down', error: (err as Error).message }
  }
}

function checkConfigured(): Check[] {
  const envs: Record<string, boolean> = {
    mercadopago: !!process.env.MP_CLIENT_ID && !!process.env.MP_CLIENT_SECRET,
    email: !!process.env.RESEND_API_KEY,
    sentry: !!process.env.SENTRY_DSN,
  }
  return Object.entries(envs).map(([name, ok]) => ({
    name,
    status: ok ? ('ok' as const) : ('down' as const),
  }))
}

function overallFrom(checks: Check[]): CheckStatus {
  if (checks.every((c) => c.status === 'ok')) return 'ok'
  if (checks.some((c) => c.status === 'down')) return 'down'
  return 'degraded'
}

export async function GET(): Promise<Response> {
  const [db, pgboss] = await Promise.all([checkDb(), checkPgBoss()])
  const checks: Check[] = [db, pgboss, ...checkConfigured()]
  const status = overallFrom(checks)
  const httpStatus = status === 'ok' ? 200 : 503
  return Response.json(
    { status, checks, timestamp: new Date().toISOString() },
    { status: httpStatus },
  )
}
