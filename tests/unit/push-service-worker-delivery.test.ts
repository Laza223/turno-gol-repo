import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync('public/sw.js', 'utf8')

function worker(withBroadcast = true) {
  const handlers: Record<string, (event: unknown) => void> = {}
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const openWindow = vi.fn().mockResolvedValue(undefined)
  const fetch = vi.fn().mockRejectedValue(new Error('offline'))
  class BroadcastChannel {
    onmessage?: (event: { data: unknown }) => void
    postMessage(data: { id: string }) {
      this.onmessage?.({ data: { id: data.id, ack: true } })
    }
    close() {}
  }
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers[name] = handler
      },
      location: { origin: 'https://turnogol.test' },
      registration: { showNotification },
      clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow },
    },
    ...(withBroadcast ? { BroadcastChannel } : {}),
    URL,
    Date,
    fetch,
    setTimeout,
    clearTimeout,
  })
  async function push(payload: Record<string, unknown>) {
    let work: Promise<unknown> | undefined
    handlers.push!({
      data: { json: () => payload },
      waitUntil: (p: Promise<unknown>) => (work = p),
    })
    await work
  }
  return { push, showNotification, openWindow, fetch, handlers }
}

describe('Web Push — entrega nativa', () => {
  it('muestra nativa aunque una pestaña confirme el aviso', async () => {
    const w = worker()
    await w.push({ type: 'booking.confirmed_online', eventId: 'booking:1', title: 'Nueva reserva' })
    expect(w.showNotification).toHaveBeenCalledOnce()
    expect(w.showNotification.mock.calls[0]?.[1]).toMatchObject({ tag: 'booking:1' })
  })

  it('muestra nativa sin BroadcastChannel', async () => {
    const w = worker(false)
    await w.push({ type: 'test', title: 'Prueba' })
    expect(w.showNotification).toHaveBeenCalledOnce()
  })

  it('un recibo fallido no impide mostrar el aviso y no filtra el token a otro origen', async () => {
    const w = worker(false)
    await w.push({
      title: 'Prueba',
      deliveryId: 'delivery-1',
      receiptToken: 'signed',
      receiptUrl: 'https://evil.test/receipt',
    })
    expect(w.showNotification).toHaveBeenCalledOnce()
    expect(w.fetch).not.toHaveBeenCalled()
  })

  it('un aviso vencido no anuncia una reserva vieja ni incumple userVisibleOnly', async () => {
    const w = worker(false)
    await w.push({
      title: 'Hoy empezás a las 18:00',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    expect(w.showNotification).toHaveBeenCalledOnce()
    expect(w.showNotification.mock.calls[0]?.[0]).toBe('TurnoGol actualizado')
  })
})
