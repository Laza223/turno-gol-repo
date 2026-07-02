/**
 * MP-WEBHOOK-001 — replay harness for MercadoPago webhooks against staging.
 *
 * Fires a POST at `${STAGING_BASE_URL}/api/webhooks/mercadopago`, signed
 * with MP_WEBHOOK_TEST_BYPASS_SECRET (the staging-only fallback key checked
 * by src/modules/payments/webhook-auth.ts — see that file for why it's a
 * separate secret from the real MP_WEBHOOK_SECRET, hard-gated to
 * NODE_ENV !== 'production'). NEVER touches production: it refuses to run at
 * all if NODE_ENV is 'production', or if the target URL/VERCEL_ENV looks
 * like the real prod deploy.
 *
 * Config is entirely env-driven (no CLI flags), same convention as
 * staging-check.ts / seed-staging.ts:
 *
 *   ENV_FILE=.env.staging                    # which dotenv file to load (default .env.staging)
 *   STAGING_BASE_URL=https://...              # required — target host
 *   MP_WEBHOOK_TEST_BYPASS_SECRET=...         # required — signing key (staging-only)
 *   WEBHOOK_HARNESS_TENANT_ALLOWLIST=uuid,uuid # required — tenants this harness may target
 *   MP_WEBHOOK_REPLAY_TENANT=uuid             # required — tenant claimed in ?tenant=, must be allowlisted
 *   MP_WEBHOOK_REPLAY_FIXTURE=payment-approved # default 'payment-approved'
 *   MP_WEBHOOK_REPLAY_DATA_ID=...             # optional override of data.id (see fixtures README)
 *   MP_WEBHOOK_REPLAY_CROSS_TENANT_OWNER=uuid # optional — tenant that actually owns the payment/booking
 *   MP_WEBHOOK_REPLAY_REPEAT=1                # optional — replay count (idempotency test), max 100
 *   MP_WEBHOOK_REPLAY_SCENARIO=normal         # 'normal' | 'invalid-signature'
 *   MP_WEBHOOK_REPLAY_VERIFY_DB=0             # '1' to query processed_webhooks/payments after sending
 *   MP_WEBHOOK_REPLAY_CONFIRM=0               # MUST be '1' to actually send — else dry-run only
 *
 * Usage:
 *   ENV_FILE=.env.staging MP_WEBHOOK_REPLAY_TENANT=<uuid> pnpm webhook:replay            # dry-run
 *   ENV_FILE=.env.staging MP_WEBHOOK_REPLAY_TENANT=<uuid> MP_WEBHOOK_REPLAY_CONFIRM=1 pnpm webhook:replay
 */
import { config } from 'dotenv'
config({ path: process.env.ENV_FILE ?? '.env.staging' })

import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The webhook route this harness targets is served from the app subdomain
// (app.turnogol.app), NOT the marketing/business domain (turnogol.app) that
// seed-staging.ts's PROD_APP_URL checks — a hostname-only guard against
// that single literal would miss STAGING_BASE_URL=https://app.turnogol.app.
// Checked against the URL's hostname below, not a literal string compare.
const PROD_HOSTNAMES = ['turnogol.app', 'app.turnogol.app']
const FIXTURES_DIR = join(__dirname, '..', 'tests', 'fixtures', 'mercadopago')
const MAX_REPEAT = 100

type WebhookPayload = {
  id: string
  type: string
  action?: string
  data: { id: string }
  [key: string]: unknown
}

/**
 * Hard, unconditional gate. Mirrors seed-staging.ts's own note: Vercel sets
 * NODE_ENV=production for EVERY deployed build including Preview/staging, so
 * this check alone only protects local/non-Vercel runs — same limitation
 * MP_MOCK_ENABLED already accepts (mock-mp.ts). Kept as the literal,
 * non-negotiable check requested for MP-WEBHOOK-001; the VERCEL_ENV +
 * known-prod-domain checks below are additional, independent guards on top
 * of it (never a substitute — none of them relax this one).
 */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NODE_ENV=production — refusing to run scripts/replay-mp-webhook.ts. ' +
        'This check is unconditional and cannot be overridden by any env var.',
    )
  }
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('VERCEL_ENV=production — refusing to run scripts/replay-mp-webhook.ts.')
  }
}

function assertNotProdUrl(baseUrl: string): void {
  let hostname: string
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase()
  } catch {
    throw new Error(`STAGING_BASE_URL is not a valid URL: ${baseUrl}`)
  }
  if (PROD_HOSTNAMES.includes(hostname)) {
    throw new Error(
      `STAGING_BASE_URL (${baseUrl}) resolves to a known production hostname (${hostname}) — refusing to run.`,
    )
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required (see this script's header for the full env list)`)
  return v
}

function loadFixture(name: string): WebhookPayload {
  const path = join(FIXTURES_DIR, `${name}.json`)
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    throw new Error(`Fixture not found: ${path} (see tests/fixtures/mercadopago/README.md)`)
  }
  return JSON.parse(raw) as WebhookPayload
}

function sign(secret: string, dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex')
  return `ts=${ts},v1=${v1}`
}

function parseAllowlist(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function verifyProcessedWebhook(mpEventId: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log('  (DATABASE_URL not set — skipping DB verification)')
    return
  }
  const { getSql, closeSql } = await import('@/shared/db/client')
  const sql = getSql()
  try {
    const rows = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks WHERE mp_event_id = ${mpEventId}
    `
    const count = rows[0]?.c ?? 0
    console.log(
      `  processed_webhooks rows for mp_event_id=${mpEventId}: ${count} ` +
        `(${count === 1 ? 'OK — idempotent' : 'UNEXPECTED — expected exactly 1'})`,
    )
  } finally {
    await closeSql()
  }
}

async function verifyPaymentOwner(mpPaymentId: string, claimedTenant: string, ownerTenant: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log('  (DATABASE_URL not set — skipping DB verification)')
    return
  }
  const { getSql, closeSql } = await import('@/shared/db/client')
  const sql = getSql()
  try {
    const rows = await sql<{ tenant_id: string }[]>`
      SELECT tenant_id FROM payments WHERE mp_payment_id = ${mpPaymentId}
    `
    if (rows.length === 0) {
      console.log(
        `  no payments row for mp_payment_id=${mpPaymentId} — OK if the handler rejected the ` +
          'cross-tenant claim (check server logs for "webhook tenant mismatch")',
      )
      return
    }
    const tenantId = rows[0]!.tenant_id
    if (tenantId === claimedTenant && claimedTenant !== ownerTenant) {
      console.error(
        `  FAIL — payment ${mpPaymentId} was recorded under the CLAIMED tenant ${claimedTenant}, ` +
          `not the real owner ${ownerTenant}. Tenant cross-check did not hold.`,
      )
      return
    }
    console.log(`  payments.tenant_id=${tenantId} for mp_payment_id=${mpPaymentId} (owner=${ownerTenant})`)
  } finally {
    await closeSql()
  }
}

async function main(): Promise<void> {
  assertNotProduction()

  const baseUrl = requireEnv('STAGING_BASE_URL')
  assertNotProdUrl(baseUrl)

  const testSecret = requireEnv('MP_WEBHOOK_TEST_BYPASS_SECRET')
  const allowlist = parseAllowlist(requireEnv('WEBHOOK_HARNESS_TENANT_ALLOWLIST'))
  const tenant = requireEnv('MP_WEBHOOK_REPLAY_TENANT')
  if (!allowlist.includes(tenant)) {
    throw new Error(
      `MP_WEBHOOK_REPLAY_TENANT=${tenant} is not in WEBHOOK_HARNESS_TENANT_ALLOWLIST (${allowlist.join(', ')}). ` +
        'Add it explicitly — this harness refuses to target un-allowlisted tenants.',
    )
  }

  const fixtureName = process.env.MP_WEBHOOK_REPLAY_FIXTURE ?? 'payment-approved'
  const fixture = loadFixture(fixtureName)
  const dataId = process.env.MP_WEBHOOK_REPLAY_DATA_ID ?? fixture.data.id
  if (!process.env.MP_WEBHOOK_REPLAY_DATA_ID) {
    console.log(
      `  (using fixture's placeholder data.id="${dataId}" — see tests/fixtures/mercadopago/README.md ` +
        'to point this at a real mock/sandbox payment id)',
    )
  }
  const payload: WebhookPayload = { ...fixture, data: { ...fixture.data, id: dataId } }

  const repeatRaw = Number(process.env.MP_WEBHOOK_REPLAY_REPEAT ?? '1')
  const repeat = Number.isInteger(repeatRaw) && repeatRaw > 0 ? repeatRaw : 1
  if (repeat > MAX_REPEAT) {
    throw new Error(`MP_WEBHOOK_REPLAY_REPEAT=${repeat} exceeds the safety cap of ${MAX_REPEAT}`)
  }

  const scenario = process.env.MP_WEBHOOK_REPLAY_SCENARIO ?? 'normal'
  if (scenario !== 'normal' && scenario !== 'invalid-signature') {
    throw new Error(`MP_WEBHOOK_REPLAY_SCENARIO must be 'normal' or 'invalid-signature', got '${scenario}'`)
  }

  const confirmed = process.env.MP_WEBHOOK_REPLAY_CONFIRM === '1'
  const url = `${baseUrl.replace(/\/+$/, '')}/api/webhooks/mercadopago?tenant=${encodeURIComponent(tenant)}`

  console.log('MP-WEBHOOK-001 replay harness')
  console.log(`  target:    ${url}`)
  console.log(`  fixture:   ${fixtureName} (event id=${payload.id}, data.id=${dataId})`)
  console.log(`  scenario:  ${scenario}`)
  console.log(`  repeat:    ${repeat}`)
  console.log(`  mode:      ${confirmed ? 'EXECUTE' : 'DRY-RUN (set MP_WEBHOOK_REPLAY_CONFIRM=1 to send)'}`)

  if (!confirmed) {
    const requestId = 'dry-run-request-id'
    const ts = String(Math.floor(Date.now() / 1000))
    const secretUsed = scenario === 'invalid-signature' ? 'invalid-signature-for-negative-test' : testSecret
    const xSignature = sign(secretUsed, dataId, requestId, ts)
    console.log('  would POST with headers:')
    console.log(`    x-request-id: ${requestId}`)
    console.log(`    x-signature:  ${xSignature}`)
    console.log(`  would POST body: ${JSON.stringify(payload)}`)
    console.log('\nDry-run complete — no request sent, no DB touched.')
    return
  }

  const results: number[] = []
  for (let i = 0; i < repeat; i++) {
    const requestId = `replay-${Date.now()}-${i}`
    const ts = String(Math.floor(Date.now() / 1000))
    const secretUsed = scenario === 'invalid-signature' ? 'invalid-signature-for-negative-test' : testSecret
    const xSignature = sign(secretUsed, dataId, requestId, ts)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': requestId,
        'x-signature': xSignature,
      },
      body: JSON.stringify(payload),
    })
    results.push(res.status)
    const body = await res.text()
    console.log(`  attempt ${i + 1}/${repeat}: HTTP ${res.status} ${body}`)
  }

  if (scenario === 'invalid-signature') {
    const allRejected = results.every((s) => s === 401)
    console.log(allRejected ? '\nPASS — every attempt was rejected with 401.' : '\nFAIL — expected 401 on every attempt.')
    if (!allRejected) process.exitCode = 1
    return
  }

  if (process.env.MP_WEBHOOK_REPLAY_VERIFY_DB === '1') {
    console.log('\nVerifying DB state:')
    await verifyProcessedWebhook(payload.id)
    const crossTenantOwner = process.env.MP_WEBHOOK_REPLAY_CROSS_TENANT_OWNER
    if (crossTenantOwner) {
      await verifyPaymentOwner(dataId, tenant, crossTenantOwner)
    }
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(`\nreplay-mp-webhook failed: ${(err as Error).message}`)
  process.exit(1)
})
