import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  class KapsoPlatformError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  }
  return {
    KapsoPlatformError,
    platform: {
      findKapsoCustomer: vi.fn(),
      findOrCreateKapsoCustomer: vi.fn(),
      createKapsoSetupLink: vi.fn(),
      getKapsoPhoneNumber: vi.fn(),
      listKapsoPhoneNumbers: vi.fn(),
      ensureKapsoMessageWebhook: vi.fn(),
    },
    upserts: [] as unknown[],
    insertError: null as unknown,
    audits: [] as unknown[],
  }
})

vi.mock('@/lib/kapso/platform', () => ({ KapsoPlatformError: h.KapsoPlatformError, ...h.platform }))
vi.mock('@/shared/feature-flags', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/shared/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/shared/db/schema', () => ({ whatsappConnections: { tenantId: 'tenant_id' } }))
vi.mock('@/shared/db/audit', () => ({
  insertAuditLog: vi.fn(async (_tx: unknown, entry: unknown) => {
    h.audits.push(entry)
  }),
}))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      insert: () => ({
        values: (values: unknown) => ({
          onConflictDoUpdate: async (conflict: unknown) => {
            if (h.insertError) throw h.insertError
            h.upserts.push({ values, conflict })
          },
        }),
      }),
    }),
  ),
}))

import {
  findAndRegisterWhatsappConnection,
  registerWhatsappConnection,
  startWhatsappConnect,
} from '@/modules/whatsapp-bot/whatsapp-bot.connection'

const TENANT = { id: 'tenant-1', name: 'Complejo Uno' }
const NUMBER = {
  phoneNumberId: 'pn-1',
  businessAccountId: 'waba-1',
  customerId: 'cust-1',
  displayPhoneNumber: '+54 9 11 1234-5678',
  isCoexistence: true,
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test.local')
  vi.stubEnv('KAPSO_WEBHOOK_SECRET', 'secret-secret-secret')
  for (const fn of Object.values(h.platform)) fn.mockReset()
  h.upserts.length = 0
  h.insertError = null
  h.audits.length = 0
  h.platform.findKapsoCustomer.mockResolvedValue({ id: 'cust-1' })
  h.platform.getKapsoPhoneNumber.mockResolvedValue(NUMBER)
  h.platform.ensureKapsoMessageWebhook.mockResolvedValue(undefined)
  h.platform.listKapsoPhoneNumbers.mockResolvedValue([])
})

describe('startWhatsappConnect', () => {
  it('arma el link con las URLs de vuelta del propio dominio', async () => {
    h.platform.findOrCreateKapsoCustomer.mockResolvedValue({ id: 'cust-1' })
    h.platform.createKapsoSetupLink.mockResolvedValue({ url: 'https://app.kapso.ai/x' })
    expect(await startWhatsappConnect(TENANT)).toEqual({ ok: true, url: 'https://app.kapso.ai/x' })
    expect(h.platform.findOrCreateKapsoCustomer).toHaveBeenCalledWith({
      externalId: 'tenant-1',
      name: 'Complejo Uno',
    })
    expect(h.platform.createKapsoSetupLink).toHaveBeenCalledWith('cust-1', {
      successUrl: 'https://app.test.local/api/whatsapp/connect/callback',
      failureUrl: 'https://app.test.local/api/whatsapp/connect/callback?fallo=1',
    })
  })

  it('si Kapso ya tiene el número del complejo, el link lo reconecta', async () => {
    h.platform.findOrCreateKapsoCustomer.mockResolvedValue({ id: 'cust-1' })
    h.platform.listKapsoPhoneNumbers.mockResolvedValue([
      { ...NUMBER, phoneNumberId: 'pn-dedicado', isCoexistence: false },
      NUMBER,
    ])
    h.platform.createKapsoSetupLink.mockResolvedValue({ url: 'https://app.kapso.ai/x' })
    expect(await startWhatsappConnect(TENANT)).toEqual({ ok: true, url: 'https://app.kapso.ai/x' })
    expect(h.platform.listKapsoPhoneNumbers).toHaveBeenCalledWith('cust-1')
    expect(h.platform.createKapsoSetupLink).toHaveBeenCalledWith('cust-1', {
      successUrl: 'https://app.test.local/api/whatsapp/connect/callback',
      failureUrl: 'https://app.test.local/api/whatsapp/connect/callback?fallo=1',
      reconnectPhoneNumber: '+54 9 11 1234-5678',
    })
  })

  it('si Kapso falla devuelve kapso_no_disponible', async () => {
    h.platform.findOrCreateKapsoCustomer.mockRejectedValue(new h.KapsoPlatformError(500, 'boom'))
    expect(await startWhatsappConnect(TENANT)).toEqual({
      ok: false,
      error: 'kapso_no_disponible',
    })
  })
})

describe('registerWhatsappConnection', () => {
  it('registra: webhook primero, fila después, con el asistente apagado', async () => {
    expect(await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).toEqual({ ok: true })
    expect(h.platform.ensureKapsoMessageWebhook).toHaveBeenCalledWith({
      phoneNumberId: 'pn-1',
      url: 'https://app.test.local/api/webhooks/whatsapp',
      secret: 'secret-secret-secret',
    })
    expect(h.upserts).toHaveLength(1)
    const { values, conflict } = h.upserts[0] as {
      values: Record<string, unknown>
      conflict: { set: Record<string, unknown> }
    }
    expect(values).toMatchObject({
      tenantId: 'tenant-1',
      provider: 'kapso',
      phoneNumberId: 'pn-1',
      wabaId: 'waba-1',
      status: 'connected',
      enabled: false,
    })
    // El update de la reconexión no toca `enabled`.
    expect(conflict.set).not.toHaveProperty('enabled')
  })

  it('deja el audit whatsapp.connected a nombre de quien conectó', async () => {
    await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')
    expect(h.audits).toEqual([
      {
        tenantId: 'tenant-1',
        actorId: 'staff-1',
        actorType: 'staff',
        action: 'whatsapp.connected',
        resourceType: 'tenant',
        resourceId: 'tenant-1',
        metadata: { phoneNumberId: 'pn-1' },
      },
    ])
  })

  it('rechaza un número que es de otro cliente de Kapso', async () => {
    h.platform.getKapsoPhoneNumber.mockResolvedValue({ ...NUMBER, customerId: 'otro' })
    expect(await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).toEqual({
      ok: false,
      error: 'conexion_incompleta',
    })
    expect(h.platform.ensureKapsoMessageWebhook).not.toHaveBeenCalled()
    expect(h.upserts).toHaveLength(0)
  })

  it('rechaza un número que no es de coexistencia', async () => {
    h.platform.getKapsoPhoneNumber.mockResolvedValue({ ...NUMBER, isCoexistence: false })
    expect(await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).toEqual({
      ok: false,
      error: 'conexion_incompleta',
    })
    expect(h.upserts).toHaveLength(0)
  })

  it('sin cliente en Kapso o con número desconocido es conexion_incompleta', async () => {
    h.platform.findKapsoCustomer.mockResolvedValue(null)
    expect(await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).toMatchObject({
      error: 'conexion_incompleta',
    })
    h.platform.findKapsoCustomer.mockResolvedValue({ id: 'cust-1' })
    h.platform.getKapsoPhoneNumber.mockResolvedValue(null)
    expect(await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).toMatchObject({
      error: 'conexion_incompleta',
    })
  })

  it('NO guarda la fila si el webhook no se pudo crear', async () => {
    h.platform.ensureKapsoMessageWebhook.mockRejectedValue(new h.KapsoPlatformError(422, 'x'))
    expect(await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).toEqual({
      ok: false,
      error: 'kapso_no_disponible',
    })
    expect(h.upserts).toHaveLength(0)
    expect(h.audits).toHaveLength(0)
  })

  it('sin KAPSO_WEBHOOK_SECRET es kapso_no_disponible y no llama a Kapso', async () => {
    vi.stubEnv('KAPSO_WEBHOOK_SECRET', '')
    expect(await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).toEqual({
      ok: false,
      error: 'kapso_no_disponible',
    })
    expect(h.platform.findKapsoCustomer).not.toHaveBeenCalled()
  })

  it('un 23505 sobre phone_number_id es numero_de_otro_complejo', async () => {
    h.insertError = Object.assign(new Error('dup'), {
      code: '23505',
      constraint_name: 'whatsapp_connections_phone_number_id_key',
    })
    expect(await registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).toEqual({
      ok: false,
      error: 'numero_de_otro_complejo',
    })
    expect(h.audits).toHaveLength(0)
  })

  it('otro error de la base se propaga', async () => {
    h.insertError = new Error('conexión caída')
    await expect(registerWhatsappConnection(TENANT, 'pn-1', 'staff-1')).rejects.toThrow(
      'conexión caída',
    )
  })
})

describe('findAndRegisterWhatsappConnection', () => {
  it('toma el primer número de coexistencia del cliente', async () => {
    h.platform.listKapsoPhoneNumbers.mockResolvedValue([
      { ...NUMBER, phoneNumberId: 'sandbox', isCoexistence: false },
      NUMBER,
    ])
    expect(await findAndRegisterWhatsappConnection(TENANT, 'staff-1')).toEqual({ ok: true })
    expect(h.platform.getKapsoPhoneNumber).toHaveBeenCalledWith('pn-1')
    // "Ya lo conecté" deja el mismo audit que el callback.
    expect(h.audits).toMatchObject([{ action: 'whatsapp.connected', actorId: 'staff-1' }])
  })

  it('sin números de coexistencia es conexion_incompleta', async () => {
    h.platform.listKapsoPhoneNumbers.mockResolvedValue([{ ...NUMBER, isCoexistence: false }])
    expect(await findAndRegisterWhatsappConnection(TENANT, 'staff-1')).toEqual({
      ok: false,
      error: 'conexion_incompleta',
    })
  })
})
