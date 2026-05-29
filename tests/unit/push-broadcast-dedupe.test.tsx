// @vitest-environment happy-dom
/**
 * Tests for PushNotificationManager multi-tab dedupe logic.
 *
 * BroadcastChannel is not implemented in happy-dom v14, so we provide a
 * MockBroadcastChannel that routes postMessage calls to all instances sharing
 * the same channel name (simulating cross-tab broadcast within the same test).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

// ─── Mock use-toast so it doesn't touch real state ───────────────────────────
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

// ─── MockBroadcastChannel ─────────────────────────────────────────────────────
type MessageListener = (event: { data: unknown }) => void

const channelRegistry = new Map<string, Set<MockBroadcastChannel>>()

class MockBroadcastChannel {
  name: string
  onmessage: MessageListener | null = null
  private _closed = false
  readonly sentMessages: unknown[] = []

  constructor(name: string) {
    this.name = name
    if (!channelRegistry.has(name)) {
      channelRegistry.set(name, new Set())
    }
    channelRegistry.get(name)!.add(this)
  }

  postMessage(data: unknown) {
    if (this._closed) return
    this.sentMessages.push(data)
    const peers = channelRegistry.get(this.name)
    if (!peers) return
    for (const peer of Array.from(peers)) {
      if (peer !== this && !peer._closed && peer.onmessage) {
        peer.onmessage({ data })
      }
    }
  }

  close() {
    this._closed = true
    channelRegistry.get(this.name)?.delete(this)
  }
}

// Install globally before any imports touch it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).BroadcastChannel = MockBroadcastChannel

// ─── Mock browser APIs absent from happy-dom ─────────────────────────────────
// Notification
Object.defineProperty(globalThis, 'Notification', {
  value: { permission: 'default', requestPermission: vi.fn() },
  writable: true,
  configurable: true,
})

// navigator.serviceWorker
Object.defineProperty(navigator, 'serviceWorker', {
  value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
})

// PushManager (just needs to exist for the feature-detection branch)
Object.defineProperty(globalThis, 'PushManager', {
  value: class PushManager {},
  writable: true,
  configurable: true,
})

// HTMLMediaElement.play/pause (happy-dom stubs don't resolve these)
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  value: vi.fn().mockResolvedValue(undefined),
  writable: true,
  configurable: true,
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  value: vi.fn(),
  writable: true,
  configurable: true,
})

// localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

// ─── Import the component AFTER globals are set up ────────────────────────────
import { PushNotificationManager } from '@/components/admin/PushNotificationManager'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the MockBroadcastChannel instance registered on 'notif-dedupe'
 * that was created by the component's useEffect. Waits up to 200ms.
 */
async function getComponentChannel(): Promise<MockBroadcastChannel> {
  const deadline = Date.now() + 200
  while (Date.now() < deadline) {
    const peers = channelRegistry.get('notif-dedupe')
    if (peers && peers.size > 0) return Array.from(peers)[0]
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('Component did not create a BroadcastChannel(notif-dedupe) within 200ms')
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  channelRegistry.clear()
  vi.clearAllMocks()
  localStorageMock.clear()
})

afterEach(() => {
  cleanup()
  channelRegistry.clear()
})

describe('PushNotificationManager — BroadcastChannel dedupe', () => {
  it('subscribes to notif-dedupe channel on mount', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    const peers = channelRegistry.get('notif-dedupe')
    expect(peers).toBeDefined()
    expect(peers!.size).toBe(1)
    const ch = Array.from(peers!)[0]
    expect(ch.onmessage).toBeTypeOf('function')
  })

  it('sends ack when it receives a push {id} broadcast', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    // Get the component's channel instance.
    const componentChannel = await getComponentChannel()

    // Create a separate "SW-side" channel to send the broadcast and capture acks.
    const swChannel = new MockBroadcastChannel('notif-dedupe')
    const receivedAcks: unknown[] = []
    swChannel.onmessage = (msg) => {
      const data = (msg.data || {}) as { ack?: boolean; id?: string }
      if (data.ack) receivedAcks.push(msg.data)
    }

    // Simulate SW broadcasting a push notification id.
    await act(async () => {
      swChannel.postMessage({ id: 'booking-abc' })
      // Give the async onmessage handler time to run.
      await new Promise((r) => setTimeout(r, 50))
    })

    // The component should have sent back an ack.
    expect(receivedAcks).toHaveLength(1)
    expect(receivedAcks[0]).toEqual({ id: 'booking-abc', ack: true })

    // Verify the component channel itself also recorded the outgoing ack.
    expect(componentChannel.sentMessages).toContainEqual({ id: 'booking-abc', ack: true })

    swChannel.close()
  })

  it('ignores a second broadcast with the same id (seen-set dedupe)', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    const swChannel = new MockBroadcastChannel('notif-dedupe')
    const receivedAcks: unknown[] = []
    swChannel.onmessage = (msg) => {
      const data = (msg.data || {}) as { ack?: boolean }
      if (data.ack) receivedAcks.push(msg.data)
    }

    // First broadcast — should be acked.
    await act(async () => {
      swChannel.postMessage({ id: 'booking-dup' })
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(receivedAcks).toHaveLength(1)

    // Second broadcast with same id — component's seen set should suppress it.
    await act(async () => {
      swChannel.postMessage({ id: 'booking-dup' })
      await new Promise((r) => setTimeout(r, 50))
    })
    // Still only one ack.
    expect(receivedAcks).toHaveLength(1)

    swChannel.close()
  })

  it('acks different ids independently', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    const swChannel = new MockBroadcastChannel('notif-dedupe')
    const receivedAcks: unknown[] = []
    swChannel.onmessage = (msg) => {
      const data = (msg.data || {}) as { ack?: boolean }
      if (data.ack) receivedAcks.push(msg.data)
    }

    await act(async () => {
      swChannel.postMessage({ id: 'booking-1' })
      await new Promise((r) => setTimeout(r, 50))
    })
    await act(async () => {
      swChannel.postMessage({ id: 'booking-2' })
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(receivedAcks).toHaveLength(2)
    expect(receivedAcks[0]).toEqual({ id: 'booking-1', ack: true })
    expect(receivedAcks[1]).toEqual({ id: 'booking-2', ack: true })

    swChannel.close()
  })

  it('does not ack messages that are themselves acks (ack:true flag)', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    const componentChannel = await getComponentChannel()
    const initialSentCount = componentChannel.sentMessages.length

    // Simulate receiving an ack from another tab — component must ignore it.
    await act(async () => {
      // Directly trigger onmessage on the component channel (as if it received
      // its own reflection or another tab's ack).
      componentChannel.onmessage?.({ data: { id: 'booking-xyz', ack: true } })
      await new Promise((r) => setTimeout(r, 50))
    })

    // No new messages should have been sent.
    expect(componentChannel.sentMessages.length).toBe(initialSentCount)
  })

  it('closes the BroadcastChannel on unmount', async () => {
    let unmount!: () => void
    await act(async () => {
      const result = render(<PushNotificationManager />)
      unmount = result.unmount
    })

    const peers = channelRegistry.get('notif-dedupe')
    expect(peers?.size).toBe(1)

    await act(async () => {
      unmount()
    })

    // After unmount the component closes the channel — registry entry is removed.
    expect(channelRegistry.get('notif-dedupe')?.size ?? 0).toBe(0)
  })
})
