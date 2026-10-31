import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const insertValues = vi.fn()
const onConflictDoNothing = vi.fn()

vi.mock('@/shared/db/client', () => ({
  getWorkerDb: () => ({ insert: () => ({ values: insertValues }) }),
}))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.ingest', () => ({ ingestWhatsappEvents: vi.fn() }))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.queue', () => ({ enqueueWhatsappTurns: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// El primer import() transforma el grafo del route (segundos con la CPU cargada):
// hecho dentro de un `it` se come el testTimeout. Acá corre bajo el hookTimeout y
// deja el transform en caché; el resetModules de abajo solo re-evalúa.
beforeAll(async () => {
  await import('@/app/api/webhooks/whatsapp/route')
})

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('KAPSO_WEBHOOK_SECRET', 'secreto')
  insertValues.mockReset()
  onConflictDoNothing.mockReset().mockResolvedValue(undefined)
  insertValues.mockReturnValue({ onConflictDoNothing })
})

function post(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://turnogol.app/api/webhooks/whatsapp', {
    method: 'POST',
    body: '{}',
    headers: { 'x-webhook-signature': 'mala', ...headers },
  })
}

describe('webhook de WhatsApp: rechazo por firma', () => {
  it('el 401 de un evento de Kapso deja una clave por minuto para la alerta', async () => {
    const { POST } = await import('@/app/api/webhooks/whatsapp/route')
    const res = await POST(post({ 'x-webhook-event': 'whatsapp.message.received' }))
    expect(res.status).toBe(401)
    expect(insertValues).toHaveBeenCalledTimes(1)
    expect(insertValues.mock.calls[0]?.[0].key).toMatch(
      /^wa-firma-rej:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    )
  })

  it('un 401 sin x-webhook-event (un escáner) no cuenta', async () => {
    const { POST } = await import('@/app/api/webhooks/whatsapp/route')
    const res = await POST(post({}))
    expect(res.status).toBe(401)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('muchos 401 en el mismo minuto hacen una sola escritura', async () => {
    const { POST } = await import('@/app/api/webhooks/whatsapp/route')
    const h = { 'x-webhook-event': 'whatsapp.message.received' }
    await POST(post(h))
    await POST(post(h))
    await POST(post(h))
    expect(insertValues).toHaveBeenCalledTimes(1)
  })

  it('si la base falla igual contesta 401', async () => {
    onConflictDoNothing.mockRejectedValue(new Error('db caída'))
    const { POST } = await import('@/app/api/webhooks/whatsapp/route')
    const res = await POST(post({ 'x-webhook-event': 'whatsapp.message.received' }))
    expect(res.status).toBe(401)
  })
})
