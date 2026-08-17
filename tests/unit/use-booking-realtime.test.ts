// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import type { GridBooking } from '@/components/booking/BookingGrid'

// ---------------------------------------------------------------------------
// Hoisted mock refs — captured before vi.mock factory runs
// ---------------------------------------------------------------------------

// Bloque y no `disable-next-line`: al formatear, este objeto pasó de una línea a
// cinco, y la directiva de una sola línea dejó de cubrir los `as any` de abajo.
// Misma supresión que antes, con el alcance correcto.
/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => ({
  handler: undefined as any,
  subCb: undefined as any,
  removeChannel: vi.fn(),
}))
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch: any = {
      on: (_e: unknown, _f: unknown, fn: unknown) => {
        h.handler = fn
        return ch
      },
      subscribe: (cb: unknown) => {
        h.subCb = cb
        return ch
      },
    }
    return { channel: () => ch, removeChannel: h.removeChannel }
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBooking(overrides: Partial<GridBooking> = {}): GridBooking {
  return {
    id: 'booking-1',
    courtId: 'court-1',
    date: '2025-06-01',
    timeStart: '10:00',
    timeEnd: '11:00',
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: 'Juan',
    playerLastName: 'Pérez',
    priceSnapshot: 1000,
    ...overrides,
  }
}

/** Raw realtime payload row — no player join, Supabase format. */
function makeRawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'booking-1',
    court_id: 'court-1',
    date: '2025-06-01',
    time_start: '10:00:00',
    time_end: '11:00:00',
    status: 'confirmed',
    type: 'spontaneous',
    guest_name: null,
    price_snapshot: 1000,
    ...overrides,
  }
}

/** Flush the dynamic import microtask inside useEffect so h.handler / h.subCb get set. */
async function flushImport(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  // Reset captured refs between tests
  h.handler = undefined
  h.subCb = undefined
  h.removeChannel.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBookingRealtime', () => {
  // 1. Catch-up on reconnect
  it('case 1: fires fetch on SUBSCRIBED after CHANNEL_ERROR (catch-up on reconnect)', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: [] }),
    )
    await flushImport()
    expect(h.subCb).toBeDefined()

    await act(async () => {
      h.subCb('CHANNEL_ERROR')
    })
    expect(result.current.status).toBe('OFFLINE')
    const callsAfterError = fetchMock.mock.calls.length

    await act(async () => {
      h.subCb('SUBSCRIBED')
    })
    expect(result.current.status).toBe('SUBSCRIBED')
    // Must have fetched at least once more for the catch-up
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterError)
    const catchUpUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string
    expect(catchUpUrl).toContain('/api/bookings')
    expect(catchUpUrl).toContain('2025-06-01')
  })

  // 2. El primer SUBSCRIBED NO re-pide el día: ya lo trajo el render de servidor
  it('case 2: no fetch on the first SUBSCRIBED (SSR already brought the day)', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: [] }),
    )
    await flushImport()

    expect(fetchMock.mock.calls.length).toBe(0)

    await act(async () => {
      h.subCb('SUBSCRIBED')
    })

    // Sin caída previa del canal no hay nada que recuperar: cargar la grilla
    // pedía los mismos turnos dos veces, uno por SSR y otro por acá.
    expect(fetchMock.mock.calls.length).toBe(0)
  })

  // 2b. Pero el reconcile periódico arranca igual en ese primer SUBSCRIBED: es
  // el que cubre los cobros (`cash_flows` no viaja por este canal) y, de paso,
  // la micro-ventana entre el snapshot del SSR y la suscripción.
  it('case 2b: the 30s reconcile still starts on the first SUBSCRIBED', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: [] }),
    )
    await flushImport()
    await act(async () => {
      h.subCb('SUBSCRIBED')
    })
    expect(fetchMock.mock.calls.length).toBe(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(fetchMock.mock.calls.length).toBe(1)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/bookings')
    expect(url).toContain('2025-06-01')
  })

  // 3. Live INSERT applies immediately + schedules reconcile after 400ms
  it('case 3: INSERT applies row immediately with null player names, reconcile after 400ms', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: [] }),
    )
    await flushImport()

    // SUBSCRIBED (clear catch-up call)
    await act(async () => {
      h.subCb('SUBSCRIBED')
    })
    fetchMock.mockClear()

    // Fire live INSERT
    await act(async () => {
      h.handler({
        eventType: 'INSERT',
        new: makeRawRow({ id: 'b-new', time_start: '10:00:00', time_end: '11:00:00' }),
        old: {},
      })
    })

    // Row present immediately
    expect(result.current.bookings.some((b: GridBooking) => b.id === 'b-new')).toBe(true)
    const inserted = result.current.bookings.find((b: GridBooking) => b.id === 'b-new')
    // Realtime payload has no player join — names must be null
    expect(inserted?.playerFirstName).toBeNull()
    expect(inserted?.playerLastName).toBeNull()

    // Reconcile debounce has NOT fired yet (< 400ms)
    expect(fetchMock.mock.calls.length).toBe(0)

    // Advance past debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(fetchMock.mock.calls.length).toBe(1)
  })

  // 4. UPDATE to canceled_refunded on an existing booking
  it('case 4: UPDATE replaces existing booking status', async () => {
    vi.useFakeTimers()

    const seedRow = {
      id: 'b1',
      court_id: 'court-1',
      date: '2025-06-01',
      time_start: '10:00',
      time_end: '11:00',
      status: 'confirmed',
      type: 'spontaneous',
      guest_name: null,
      player: null,
      price_snapshot: 1000,
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      // Return the seed row so SUBSCRIBED catch-up preserves it in state
      json: async () => ({ data: [seedRow] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const initial = [makeBooking({ id: 'b1', status: 'confirmed' })]
    const { result } = renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: initial }),
    )
    await flushImport()
    await act(async () => {
      h.subCb('SUBSCRIBED')
    })
    // Let the catch-up fetch promise settle so state is seeded
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      h.handler({
        eventType: 'UPDATE',
        new: makeRawRow({ id: 'b1', status: 'canceled_refunded' }),
        old: makeRawRow({ id: 'b1', status: 'confirmed' }),
      })
    })

    const updated = result.current.bookings.find((b: GridBooking) => b.id === 'b1')
    expect(updated?.status).toBe('canceled_refunded')
  })

  // 5. Date filter: INSERT with different date is ignored
  it('case 5: ignores INSERT whose date does not match opts.date', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: [] }),
    )
    await flushImport()
    await act(async () => {
      h.subCb('SUBSCRIBED')
    })

    await act(async () => {
      h.handler({
        eventType: 'INSERT',
        new: makeRawRow({ id: 'wrong-day', date: '2025-06-02' }),
        old: {},
      })
    })

    // No booking should have been added
    expect(result.current.bookings.find((b: GridBooking) => b.id === 'wrong-day')).toBeUndefined()
    // Bookings list stays empty (catch-up from SUBSCRIBED returned [])
    expect(result.current.bookings).toHaveLength(0)
  })

  // 6. Polling fallback after CHANNEL_ERROR
  it('case 6: polling fallback fires fetch every 30s after CHANNEL_ERROR', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: [] }),
    )
    await flushImport()

    await act(async () => {
      h.subCb('CHANNEL_ERROR')
    })
    const callsAfterError = fetchMock.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchMock.mock.calls.length).toBe(callsAfterError + 1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchMock.mock.calls.length).toBe(callsAfterError + 2)

    unmount()
  })

  // 8. B15: createdAt propagates on INSERT (realtime) and reconcile (API) so
  // the hold countdown can mount for a pending_payment booking.
  it('case 8: pending_payment INSERT and reconcile both carry createdAt', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'b-hold',
            court_id: 'court-1',
            date: '2025-06-01',
            time_start: '10:00:00',
            time_end: '11:00:00',
            status: 'pending_payment',
            type: 'spontaneous',
            guest_name: null,
            player: null,
            price_snapshot: 1000,
            payment_method: null,
            deposit_status: 'pending',
            deposit_amount: 300,
            total_paid: 0,
            pending: 300,
            created_at: '2025-06-01T10:00:00.000Z',
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, unmount } = renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: [] }),
    )
    await flushImport()

    await act(async () => {
      h.subCb('SUBSCRIBED')
    })
    fetchMock.mockClear()

    // Live INSERT — realtime payload replicates the full `bookings` row,
    // created_at included.
    await act(async () => {
      h.handler({
        eventType: 'INSERT',
        new: makeRawRow({
          id: 'b-hold',
          status: 'pending_payment',
          created_at: '2025-06-01T10:00:00.000Z',
        }),
        old: {},
      })
    })

    const inserted = result.current.bookings.find((b: GridBooking) => b.id === 'b-hold')
    expect(inserted?.createdAt).toBe('2025-06-01T10:00:00.000Z')

    // Reconcile fetch (400ms debounce) normalizes the API row — createdAt
    // must still be present after the authoritative refetch replaces state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    const reconciled = result.current.bookings.find((b: GridBooking) => b.id === 'b-hold')
    expect(reconciled?.createdAt).toBe('2025-06-01T10:00:00.000Z')

    unmount()
  })

  // 7. Cleanup: removeChannel called, timers cleared after unmount
  it('case 7: unmount calls removeChannel and stops all timers', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, unmount } = renderHook(() =>
      useBookingRealtime({ tenantId: 't1', date: '2025-06-01', initialBookings: [] }),
    )
    await flushImport()

    // Trigger an INSERT to arm the reconcile timeout
    await act(async () => {
      h.subCb('SUBSCRIBED')
    })
    fetchMock.mockClear()

    await act(async () => {
      h.handler({
        eventType: 'INSERT',
        new: makeRawRow({ id: 'b-cleanup' }),
        old: {},
      })
    })

    // Also trigger OFFLINE to arm the poll interval
    await act(async () => {
      h.subCb('CHANNEL_ERROR')
    })
    fetchMock.mockClear()

    // Unmount before any timer fires
    act(() => {
      unmount()
    })

    expect(h.removeChannel).toHaveBeenCalledTimes(1)

    // Advancing timers after unmount must NOT fire more fetches
    await vi.advanceTimersByTimeAsync(400)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock.mock.calls.length).toBe(0)

    // Status unchanged — hook is gone
    expect(result.current.status).toBe('OFFLINE')
  })
})
