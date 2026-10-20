import { parseArgs } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { computeSubscriptionAmount } from '@/modules/billing/pricing'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'

const date = z.iso.datetime().nullable()
const localSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    tenantStatus: z.string(),
    status: z.string(),
    planId: z.uuid(),
    planSlug: z.string(),
    billingCycle: z.enum(['monthly', 'annual']),
    billedCourts: z.number().int().positive(),
    mpSubscriptionId: z.string().min(1).nullable(),
    currentPeriodStart: date,
    currentPeriodEnd: date,
    trialEndsAt: date,
    updatedAt: z.iso.datetime(),
    pendingBilledCourts: z.number().int().positive().nullable(),
    pendingChangeAt: date,
    priceLockedUntil: date,
  })
  .strict()
const remoteSchema = z
  .object({
    preapprovalId: z.string(),
    status: z.string(),
    externalReference: z.string().nullable(),
    amountCents: z.number().int().nonnegative().nullable(),
    frequency: z.number().nullable(),
    frequencyType: z.string().nullable(),
    startDate: date,
    nextPaymentDate: date,
    chargedQuantity: z.number().int().nonnegative(),
    lastChargedDate: date,
    lastChargedAmountCents: z.number().int().nonnegative().nullable(),
  })
  .strict()
const manifestSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(
      z
        .object({
          local: localSchema,
          remote: remoteSchema.nullable(),
          targetCents: z.number().int().positive(),
          skipped: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict()
type Local = z.infer<typeof localSchema>
type Remote = z.infer<typeof remoteSchema>
type Manifest = z.infer<typeof manifestSchema>
type Gateway = Pick<PaymentGateway, 'getSubscriptionState' | 'updatePreapprovalAmount'>
type Dependencies = {
  gateway: Gateway
  readLocal: (tenantId: string) => Promise<Local | null>
  recordAudit: (entry: Manifest['entries'][number]) => Promise<void>
}
function target(local: Local): number {
  return computeSubscriptionAmount({
    ...local,
    cycle: local.billingCycle,
    priceFirstCourtCents: 3_000_000,
    priceExtraCourtCents: 3_000_000,
    annualDiscountBps: 1000,
  })
}
function skipped(local: Local): string | null {
  if (
    ['canceled', 'churned', 'deleted'].includes(local.status) ||
    ['canceled', 'churned', 'deleted'].includes(local.tenantStatus)
  )
    return 'terminal local'
  return local.mpSubscriptionId ? null : 'sin id MP'
}
function snapshot(state: GatewaySubscriptionState | null): Remote | null {
  if (!state) return null
  return remoteSchema.parse({
    preapprovalId: state.preapprovalId,
    status: state.status,
    externalReference: state.externalReference,
    amountCents: state.amountCents ?? null,
    frequency: state.frequency ?? null,
    frequencyType: state.frequencyType ?? null,
    startDate: state.startDate?.toISOString() ?? null,
    nextPaymentDate: state.nextPaymentDate?.toISOString() ?? null,
    chargedQuantity: state.chargedQuantity,
    lastChargedDate: state.lastChargedDate?.toISOString() ?? null,
    lastChargedAmountCents: state.lastChargedAmountCents,
  })
}
function requireCompatible(local: Local, remote: Remote | null): asserts remote is Remote {
  if (
    local.planSlug !== 'turnogol' ||
    !['trialing', 'active', 'past_due'].includes(local.status) ||
    !['trialing', 'active', 'past_due'].includes(local.tenantStatus) ||
    (local.priceLockedUntil && Date.parse(local.priceLockedUntil) > Date.now()) ||
    !remote ||
    remote.preapprovalId !== local.mpSubscriptionId ||
    remote.externalReference !== local.tenantId ||
    !['pending', 'authorized'].includes(remote.status) ||
    remote.amountCents === null ||
    remote.amountCents < target(local) ||
    (local.trialEndsAt &&
      Date.parse(local.trialEndsAt) > Date.now() &&
      (!remote.startDate || Date.parse(remote.startDate) < Date.parse(local.trialEndsAt))) ||
    remote.frequency !== (local.billingCycle === 'annual' ? 12 : 1) ||
    remote.frequencyType !== 'months'
  )
    throw new Error(`Caso requiere revisión: ${local.tenantId}`)
}
function requireEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Snapshot cambió; lote detenido')
}
export async function buildManifest(rows: Local[], gateway: Gateway): Promise<Manifest> {
  const entries: Manifest['entries'] = []
  for (const row of rows) {
    const local = localSchema.parse(row)
    const skip = skipped(local)
    const remote = skip
      ? null
      : snapshot(await gateway.getSubscriptionState(local.mpSubscriptionId!))
    entries.push({ local, remote, targetCents: target(local), skipped: skip })
  }
  return { version: 1, entries }
}
export async function applyManifest(input: unknown, deps: Dependencies): Promise<void> {
  const manifest = manifestSchema.parse(input)
  // Validar el lote completo antes del primer efecto externo; no confiar en el JSON editado.
  const ids = new Set<string>()
  for (const entry of manifest.entries) {
    if (ids.has(entry.local.tenantId)) throw new Error('Tenant duplicado')
    ids.add(entry.local.tenantId)
    requireEqual(entry.targetCents, target(entry.local))
    requireEqual(entry.skipped, skipped(entry.local))
    if (!entry.skipped) requireCompatible(entry.local, entry.remote)
  }
  for (const entry of manifest.entries) {
    requireEqual(await deps.readLocal(entry.local.tenantId), entry.local)
    if (entry.skipped) continue
    const id = entry.local.mpSubscriptionId!
    const remote = snapshot(await deps.gateway.getSubscriptionState(id))
    requireCompatible(entry.local, remote)
    requireEqual({ ...remote, amountCents: entry.remote!.amountCents }, entry.remote)
    if (remote.amountCents !== entry.targetCents) {
      requireEqual(remote.amountCents, entry.remote!.amountCents)
      await deps.gateway.updatePreapprovalAmount(id, entry.targetCents)
    }
    requireEqual(await deps.readLocal(entry.local.tenantId), entry.local)
    requireEqual(snapshot(await deps.gateway.getSubscriptionState(id)), {
      ...entry.remote,
      amountCents: entry.targetCents,
    })
    await deps.recordAudit(entry)
  }
}
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean' },
      manifest: { type: 'string' },
      output: { type: 'string' },
      'billing-paused': { type: 'boolean' },
      'env-file': { type: 'string' },
    },
  })
  if (values.apply ? !values.manifest || !values['billing-paused'] : !values.output)
    throw new Error(
      'Uso: --output archivo | --apply --manifest archivo --billing-paused [--env-file archivo]',
    )
  if (values['env-file']) {
    const { config } = await import('dotenv')
    const loaded = config({ path: values['env-file'] })
    if (loaded.error) throw new Error('No se pudo cargar --env-file')
  }
  const { getWorkerDb, withTenantContext, closeSql } = await import('@/shared/db/client')
  try {
    const { tenantSubscriptions: s, tenants: t, plans: p } = await import('@/shared/db/schema')
    const { eq, sql } = await import('drizzle-orm')
    const { getBillingGateway } = await import('@/modules/billing/billing.gateway')
    const { insertSystemAuditLog } = await import('@/shared/db/audit')
    const columns = {
      id: s.id,
      tenantId: s.tenantId,
      tenantStatus: t.status,
      status: s.status,
      planId: s.planId,
      planSlug: p.slug,
      billingCycle: s.billingCycle,
      billedCourts: s.billedCourts,
      mpSubscriptionId: s.mpSubscriptionId,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      trialEndsAt: t.trialEndsAt,
      updatedAt: sql<string>`to_char(${s.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      pendingBilledCourts: s.pendingBilledCourts,
      pendingChangeAt: s.pendingChangeAt,
      priceLockedUntil: s.priceLockedUntil,
    }
    const query = () =>
      getWorkerDb()
        .select(columns)
        .from(s)
        .innerJoin(t, eq(t.id, s.tenantId))
        .innerJoin(p, eq(p.id, s.planId))
    const normalize = (row: unknown) => localSchema.parse(JSON.parse(JSON.stringify(row)))
    const gateway = getBillingGateway()
    if (!values.apply) {
      const manifest = await buildManifest(
        (await query().orderBy(s.tenantId)).map(normalize),
        gateway,
      )
      await writeFile(values.output!, JSON.stringify(manifest, null, 2), {
        flag: 'wx',
        mode: 0o600,
      })
      console.log(
        `Inventario: ${manifest.entries.length}; omitidos: ${manifest.entries.filter((e) => e.skipped).length}`,
      )
      return
    }
    await applyManifest(JSON.parse(await readFile(values.manifest!, 'utf8')), {
      gateway,
      readLocal: async (tenantId) => {
        const [row] = await query().where(eq(s.tenantId, tenantId))
        return row ? normalize(row) : null
      },
      recordAudit: async (entry) => {
        console.log(
          `Verificado MP: ${entry.local.tenantId} ${entry.targetCents} centavos; registrando auditoría`,
        )
        await withTenantContext(entry.local.tenantId, (tx) =>
          insertSystemAuditLog(tx, {
            tenantId: entry.local.tenantId,
            action: 'subscription.price_repriced',
            resourceType: 'tenant_subscription',
            resourceId: entry.local.id,
            metadata: {
              previousCents: entry.remote!.amountCents,
              amountCents: entry.targetCents,
              localUpdatedAt: entry.local.updatedAt,
              mpSubscriptionId: entry.local.mpSubscriptionId,
              billingCycle: entry.local.billingCycle,
              billedCourts: entry.local.billedCourts,
            },
          }),
        )
      },
    })
  } finally {
    await closeSql()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error(
      'Lote detenido. Releer inventario y MP antes de retomar; no se revirtió ningún importe.',
    )
    process.exitCode = 1
  })
}
