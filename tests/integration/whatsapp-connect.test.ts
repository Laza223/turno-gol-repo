import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { faker } from '@faker-js/faker'
import { closeSql } from '@/shared/db/client'
import { clearFeatureFlagCache } from '@/shared/feature-flags'
import {
  BOT_FEATURE_FLAG,
  getWhatsappPlusState,
  registerWhatsappConnection,
  setWhatsappBotEnabled,
} from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { withTenantContext } from '@/shared/db/client'
import { adminSql } from '../helpers/admin-db'
import { createTestTenant, ensureRoles, type TestTenant } from '../helpers/tenant'

/**
 * Conexión del número desde Ajustes contra Postgres real (RLS, uniques, upsert).
 * Se mockea SOLO `@/lib/kapso/platform`: es el borde externo.
 */

const h = vi.hoisted(() => ({
  numbers: new Map<
    string,
    { customerId: string; displayPhoneNumber: string; businessAccountId: string }
  >(),
}))

vi.mock('@/lib/kapso/platform', () => ({
  KapsoPlatformError: class KapsoPlatformError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
  // El id del cliente de Kapso es derivado del tenant: así cada complejo "es dueño" de lo suyo.
  findKapsoCustomer: vi.fn(async (externalId: string) => ({ id: `cust-${externalId}` })),
  getKapsoPhoneNumber: vi.fn(async (phoneNumberId: string) => {
    const n = h.numbers.get(phoneNumberId)
    return n
      ? {
          phoneNumberId,
          businessAccountId: n.businessAccountId,
          customerId: n.customerId,
          displayPhoneNumber: n.displayPhoneNumber,
          isCoexistence: true,
        }
      : null
  }),
  ensureKapsoMessageWebhook: vi.fn(async () => undefined),
  findOrCreateKapsoCustomer: vi.fn(),
  createKapsoSetupLink: vi.fn(),
  listKapsoPhoneNumbers: vi.fn(),
}))

type Row = { phone_number_id: string; display_phone_number: string | null; enabled: boolean }

async function connectionOf(tenantId: string): Promise<Row | undefined> {
  const [row] = await adminSql()<Row[]>`
    SELECT phone_number_id, display_phone_number, enabled
    FROM whatsapp_connections WHERE tenant_id = ${tenantId}
  `
  return row
}

/** Alta del número en el "Kapso" de mentira, a nombre del complejo. */
function kapsoNumber(tenant: TestTenant, display = '+54 9 11 1111-1111'): string {
  const id = `pn-${faker.string.alphanumeric(12)}`
  h.numbers.set(id, {
    customerId: `cust-${tenant.id}`,
    displayPhoneNumber: display,
    businessAccountId: 'waba-1',
  })
  return id
}

beforeAll(async () => {
  await ensureRoles(adminSql())
}, 30_000)

afterAll(async () => {
  await closeSql()
})

beforeEach(() => {
  // CI corre integración solo con DATABASE_URL; `unstubEnvs` las limpia después de cada test.
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  vi.stubEnv('KAPSO_WEBHOOK_SECRET', 'test-webhook-secret')
  h.numbers.clear()
  clearFeatureFlagCache()
})

describe('registerWhatsappConnection (Postgres real)', () => {
  it('crea la fila con el asistente apagado', async () => {
    const tenant = await createTestTenant(adminSql())
    const pn = kapsoNumber(tenant)

    expect(await registerWhatsappConnection(tenant, pn)).toEqual({ ok: true })
    expect(await connectionOf(tenant.id)).toEqual({
      phone_number_id: pn,
      display_phone_number: '+54 9 11 1111-1111',
      enabled: false,
    })
  })

  it('volver a conectar es idempotente, actualiza el número y respeta enabled', async () => {
    const tenant = await createTestTenant(adminSql())
    const first = kapsoNumber(tenant)
    await registerWhatsappConnection(tenant, first)
    await withTenantContext(tenant.id, (tx) => setWhatsappBotEnabled(tenant.id, true, tx))

    expect(await registerWhatsappConnection(tenant, first)).toEqual({ ok: true })
    const second = kapsoNumber(tenant, '+54 9 11 2222-2222')
    expect(await registerWhatsappConnection(tenant, second)).toEqual({ ok: true })

    const [{ count }] = await adminSql()<{ count: string }[]>`
      SELECT count(*)::text AS count FROM whatsapp_connections WHERE tenant_id = ${tenant.id}
    `
    expect(count).toBe('1')
    expect(await connectionOf(tenant.id)).toEqual({
      phone_number_id: second,
      display_phone_number: '+54 9 11 2222-2222',
      enabled: true,
    })
  })

  it('el mismo número en otro complejo es numero_de_otro_complejo', async () => {
    const a = await createTestTenant(adminSql())
    const b = await createTestTenant(adminSql())
    const pn = kapsoNumber(a)
    await registerWhatsappConnection(a, pn)
    // Kapso lo muestra también a nombre de B (caso de datos cruzados): la base es la red.
    h.numbers.set(pn, { ...h.numbers.get(pn)!, customerId: `cust-${b.id}` })

    expect(await registerWhatsappConnection(b, pn)).toEqual({
      ok: false,
      error: 'numero_de_otro_complejo',
    })
    expect(await connectionOf(b.id)).toBeUndefined()
  })
})

describe('getWhatsappPlusState (Postgres real)', () => {
  it('distingue flag apagado, flag prendido sin conexión y con conexión', async () => {
    const tenant = await createTestTenant(adminSql())

    expect(await getWhatsappPlusState(tenant.id)).toBeNull()

    await adminSql()`
      INSERT INTO feature_flags (key, value, tenant_id)
      VALUES (${BOT_FEATURE_FLAG}, true, ${tenant.id})
    `
    clearFeatureFlagCache()
    expect(await getWhatsappPlusState(tenant.id)).toEqual({ connection: null })

    await registerWhatsappConnection(tenant, kapsoNumber(tenant))
    expect(await getWhatsappPlusState(tenant.id)).toEqual({
      connection: { displayPhoneNumber: '+54 9 11 1111-1111', connected: true, enabled: false },
    })
  })
})
