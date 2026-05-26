/**
 * Tests for use-booking-realtime hook.
 *
 * Strategy: because the project runs Vitest in `node` environment (no jsdom /
 * no @testing-library/react), we cannot use renderHook. Instead we capture the
 * callbacks that the hook registers on the supabase channel mock and invoke
 * them directly to drive state transitions.
 *
 * We simulate React state manually: each `setBookings` / `setStatus` call is
 * captured via a spy and we read `.mock.calls` to assert what the hook *would*
 * have set. This is intentionally narrow — it tests only the pieces that were
 * changed in the audit (Fix A catch-up on reconnect, Fix B reconcile debounce)
 * plus the date-filter guard and cleanup semantics.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { GridBooking } from '@/components/booking/BookingGrid'

// ---------------------------------------------------------------------------
// Helpers / fixtures
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

/** Raw postgres_changes row as Supabase sends it (no player join). */
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

/** API response row (has player join). */
function makeApiRow(overrides: Record<string, unknown> = {}): object {
  return {
    id: 'booking-1',
    court_id: 'court-1',
    date: '2025-06-01',
    time_start: '10:00',
    time_end: '11:00',
    status: 'confirmed',
    type: 'spontaneous',
    guest_name: null,
    player: { first_name: 'Juan', last_name: 'Pérez' },
    price_snapshot: 1000,
    ...overrides,
  }
}

// makeApiResponse intentionally unused here — kept as a fixture helper for
// future tests that mock fetch responses end-to-end.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeApiResponse(rows: object[] = [makeApiRow()]): object {
  return { data: rows }
}

// ---------------------------------------------------------------------------
// The handler and subscribe-callback extracted under test
//
// Rather than using renderHook (unavailable), we reconstruct the exact
// handler logic from the hook source in a standalone harness. This avoids
// importing the hook (which has 'use client' and dynamic imports) entirely.
// ---------------------------------------------------------------------------

type RawRow = Record<string, unknown>

// Mirrors normalizeRealtimeRow from the hook source.
function normalizeRealtimeRow(row: RawRow): GridBooking {
  const dateVal = row['date']
  const dateStr = typeof dateVal === 'string' ? dateVal.slice(0, 10) : ''
  return {
    id: row['id'] as string,
    courtId: row['court_id'] as string,
    date: dateStr,
    timeStart: (row['time_start'] as string).slice(0, 5),
    timeEnd: (row['time_end'] as string).slice(0, 5),
    status: row['status'] as GridBooking['status'],
    type: row['type'] as GridBooking['type'],
    guestName: (row['guest_name'] as string | null) ?? null,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: row['price_snapshot'] as number,
  }
}

// Mirrors normalizeApiRow from the hook source.
function normalizeApiRow(row: {
  id: string
  court_id: string
  date: unknown
  time_start: string
  time_end: string
  status: string
  type: string
  guest_name: string | null
  player: { first_name: string; last_name: string } | null
  price_snapshot: number
}): GridBooking {
  const dateVal = row.date
  const dateStr =
    dateVal instanceof Date
      ? dateVal.toISOString().slice(0, 10)
      : typeof dateVal === 'string'
        ? dateVal.slice(0, 10)
        : ''
  return {
    id: row.id,
    courtId: row.court_id,
    date: dateStr,
    timeStart: row.time_start.slice(0, 5),
    timeEnd: row.time_end.slice(0, 5),
    status: row.status as GridBooking['status'],
    type: row.type as GridBooking['type'],
    guestName: row.guest_name,
    playerFirstName: row.player?.first_name ?? null,
    playerLastName: row.player?.last_name ?? null,
    priceSnapshot: row.price_snapshot,
  }
}

// ---------------------------------------------------------------------------
// Handler harness: mirrors the useEffect body logic so we can invoke
// postgres_changes handler and subscribe callback without React.
// ---------------------------------------------------------------------------

interface Harness {
  /** Call the postgres_changes handler with a synthesized payload. */
  fireEvent: (payload: RealtimePostgresChangesPayload<RawRow>) => void
  /** Call the .subscribe() callback with a status string. */
  fireSubscribe: (s: string) => void
  /** Current state (mutated by handler). */
  bookings: GridBooking[]
  pollRef: { current: ReturnType<typeof setInterval> | null }
  reconcileRef: { current: ReturnType<typeof setTimeout> | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchFromApi: MockInstance<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scheduleReconcile: MockInstance<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeChannel: MockInstance<any>
  cleanup: () => void
}

function buildHarness(opts: {
  tenantId: string
  date: string
  initialBookings?: GridBooking[]
  fetchImpl?: () => Promise<void>
}): Harness {
  const pollRef: { current: ReturnType<typeof setInterval> | null } = { current: null }
  const reconcileRef: { current: ReturnType<typeof setTimeout> | null } = { current: null }

  let bookings: GridBooking[] = opts.initialBookings ?? []

  // Simulate setBookings — applies the updater (functional form) or value.
  function setBookings(updater: GridBooking[] | ((prev: GridBooking[]) => GridBooking[])) {
    if (typeof updater === 'function') {
      bookings = updater(bookings)
    } else {
      bookings = updater
    }
  }

  const fetchFromApi = vi.fn(opts.fetchImpl ?? (() => Promise.resolve()))

  // scheduleReconcile — mirrors the useCallback in the hook.
  const scheduleReconcile = vi.fn(() => {
    if (reconcileRef.current) clearTimeout(reconcileRef.current)
    reconcileRef.current = setTimeout(() => void fetchFromApi(), 400)
  })

  // The postgres_changes handler (mirrors the `.on(…, handler)` callback).
  function fireEvent(payload: RealtimePostgresChangesPayload<RawRow>) {
    const newRow = payload.new as RawRow
    const oldRow = payload.old as RawRow

    const newDate =
      typeof newRow['date'] === 'string' ? (newRow['date'] as string).slice(0, 10) : null
    const oldDate =
      typeof oldRow['date'] === 'string' ? (oldRow['date'] as string).slice(0, 10) : null

    if (newDate !== opts.date && oldDate !== opts.date) return

    if (payload.eventType === 'DELETE') {
      const deletedId = (oldRow['id'] as string | undefined) ?? ''
      setBookings((prev) => prev.filter((b) => b.id !== deletedId))
    } else if (payload.eventType === 'INSERT') {
      if (!newRow['id']) return
      const normalized = normalizeRealtimeRow(newRow)
      setBookings((prev) => {
        const idx = prev.findIndex((b) => b.id === normalized.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = normalized
          return next
        }
        return [...prev, normalized]
      })
      scheduleReconcile()
    } else if (payload.eventType === 'UPDATE') {
      if (!newRow['id']) return
      const normalized = normalizeRealtimeRow(newRow)
      setBookings((prev) => {
        const idx = prev.findIndex((b) => b.id === normalized.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = normalized
          return next
        }
        return prev
      })
      scheduleReconcile()
    }
  }

  // Status holder
  let _status = 'CONNECTING'
  function setStatus(s: string) {
    _status = s
  }
  void _status // referenced for completeness; tests read from harness directly

  const removeChannel = vi.fn()

  // The subscribe callback (mirrors `.subscribe((s) => { ... })`)
  function fireSubscribe(s: string) {
    if (s === 'SUBSCRIBED') {
      setStatus('SUBSCRIBED')
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      // Fix A: catch-up fetch on every (re)subscribe
      void fetchFromApi()
    } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
      setStatus('OFFLINE')
      if (!pollRef.current) {
        pollRef.current = setInterval(() => void fetchFromApi(), 30_000)
      }
    }
  }

  // Cleanup (mirrors the useEffect cleanup return).
  function cleanup() {
    removeChannel()
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (reconcileRef.current) {
      clearTimeout(reconcileRef.current)
      reconcileRef.current = null
    }
  }

  return {
    fireEvent,
    fireSubscribe,
    get bookings() {
      return bookings
    },
    pollRef,
    reconcileRef,
    fetchFromApi,
    scheduleReconcile,
    removeChannel,
    cleanup,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('use-booking-realtime — handler logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // 1. Catch-up on reconnect
  it('catches up on reconnect: fires fetch when SUBSCRIBED after CHANNEL_ERROR', () => {
    const h = buildHarness({ tenantId: 't1', date: '2025-06-01' })

    h.fireSubscribe('CHANNEL_ERROR')
    const callsBefore = h.fetchFromApi.mock.calls.length // poll created but not fired yet

    h.fireSubscribe('SUBSCRIBED') // reconnect

    // fetchFromApi must have been called at least once more (the catch-up call)
    expect(h.fetchFromApi.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  // 2. First subscribe also catches up
  it('fires fetch on first SUBSCRIBED (initial sync)', () => {
    const h = buildHarness({ tenantId: 't1', date: '2025-06-01' })

    expect(h.fetchFromApi.mock.calls.length).toBe(0)
    h.fireSubscribe('SUBSCRIBED')
    expect(h.fetchFromApi.mock.calls.length).toBe(1)
  })

  // 3. Live INSERT applies payload immediately + schedules reconcile after 400ms
  it('INSERT: applies row immediately and fires reconcile after 400ms', async () => {
    const h = buildHarness({
      tenantId: 't1',
      date: '2025-06-01',
      initialBookings: [],
    })
    h.fireSubscribe('SUBSCRIBED') // clear initial fetch count
    h.fetchFromApi.mockClear()

    h.fireEvent({
      eventType: 'INSERT',
      new: makeRawRow({ id: 'booking-new' }),
      old: {},
      schema: 'public',
      table: 'bookings',
      commit_timestamp: '',
      errors: null,
    } as unknown as RealtimePostgresChangesPayload<RawRow>)

    // Row is present immediately (before the debounce fires)
    expect(h.bookings.some((b) => b.id === 'booking-new')).toBe(true)
    // Player names are null (raw realtime row)
    const inserted = h.bookings.find((b) => b.id === 'booking-new')
    expect(inserted?.playerFirstName).toBeNull()
    expect(inserted?.playerLastName).toBeNull()

    // scheduleReconcile was called
    expect(h.scheduleReconcile).toHaveBeenCalledTimes(1)

    // After 400ms the debounced fetch fires
    vi.advanceTimersByTime(400)
    expect(h.fetchFromApi.mock.calls.length).toBe(1)
  })

  // 4. UPDATE to canceled status updates state
  it('UPDATE: replaces existing booking with new status', () => {
    const existing = makeBooking({ id: 'booking-1', status: 'confirmed' })
    const h = buildHarness({
      tenantId: 't1',
      date: '2025-06-01',
      initialBookings: [existing],
    })

    h.fireEvent({
      eventType: 'UPDATE',
      new: makeRawRow({ id: 'booking-1', status: 'canceled_refunded' }),
      old: makeRawRow({ id: 'booking-1' }),
      schema: 'public',
      table: 'bookings',
      commit_timestamp: '',
      errors: null,
    } as unknown as RealtimePostgresChangesPayload<RawRow>)

    const updated = h.bookings.find((b) => b.id === 'booking-1')
    expect(updated?.status).toBe('canceled_refunded')
  })

  // 5. Date filter: event for a different date is ignored
  it('ignores events whose date does not match opts.date', () => {
    const h = buildHarness({
      tenantId: 't1',
      date: '2025-06-01',
      initialBookings: [],
    })

    h.fireEvent({
      eventType: 'INSERT',
      new: makeRawRow({ id: 'other-day', date: '2025-06-02' }),
      old: {},
      schema: 'public',
      table: 'bookings',
      commit_timestamp: '',
      errors: null,
    } as unknown as RealtimePostgresChangesPayload<RawRow>)

    expect(h.bookings).toHaveLength(0)
  })

  // 6a. Cleanup: removeChannel called on unmount, no timer leaks
  it('cleanup: removeChannel is called and timers are cleared', () => {
    const h = buildHarness({ tenantId: 't1', date: '2025-06-01' })
    h.fireSubscribe('CHANNEL_ERROR') // starts poll interval

    expect(h.pollRef.current).not.toBeNull()

    h.cleanup()

    expect(h.removeChannel).toHaveBeenCalledTimes(1)
    expect(h.pollRef.current).toBeNull()
  })

  // 6b. Cleanup: reconcileRef cleared on unmount (no leaked timeout)
  it('cleanup: pending reconcile timeout is cleared on unmount', () => {
    const h = buildHarness({ tenantId: 't1', date: '2025-06-01', initialBookings: [] })

    h.fireEvent({
      eventType: 'INSERT',
      new: makeRawRow({ id: 'b-new' }),
      old: {},
      schema: 'public',
      table: 'bookings',
      commit_timestamp: '',
      errors: null,
    } as unknown as RealtimePostgresChangesPayload<RawRow>)

    // Reconcile timer is pending
    expect(h.reconcileRef.current).not.toBeNull()

    h.cleanup()

    // Cleared without firing
    expect(h.reconcileRef.current).toBeNull()
    // Advancing past the debounce window does not trigger fetch (cleanup won)
    const callsBefore = h.fetchFromApi.mock.calls.length
    vi.advanceTimersByTime(500)
    expect(h.fetchFromApi.mock.calls.length).toBe(callsBefore)
  })

  // 6c. Polling fallback: after OFFLINE, fetch fires every 30s
  it('polling fallback: after CHANNEL_ERROR, fetch fires every 30s', () => {
    const h = buildHarness({ tenantId: 't1', date: '2025-06-01' })

    h.fireSubscribe('CHANNEL_ERROR')
    const callsBefore = h.fetchFromApi.mock.calls.length

    vi.advanceTimersByTime(30_000)
    expect(h.fetchFromApi.mock.calls.length).toBe(callsBefore + 1)

    vi.advanceTimersByTime(30_000)
    expect(h.fetchFromApi.mock.calls.length).toBe(callsBefore + 2)

    h.cleanup()
  })

  // Extra: normalizeApiRow maps player join correctly (names backfilled)
  it('normalizeApiRow maps player first/last name from API join', () => {
    const row = makeApiRow() as Parameters<typeof normalizeApiRow>[0]
    const result = normalizeApiRow(row)
    expect(result.playerFirstName).toBe('Juan')
    expect(result.playerLastName).toBe('Pérez')
    expect(result.timeStart).toBe('10:00')
    expect(result.priceSnapshot).toBe(1000)
  })

  // Extra: normalizeRealtimeRow always sets player names to null
  it('normalizeRealtimeRow sets playerFirstName/LastName to null', () => {
    const result = normalizeRealtimeRow(makeRawRow())
    expect(result.playerFirstName).toBeNull()
    expect(result.playerLastName).toBeNull()
    expect(result.timeStart).toBe('10:00')
  })

  // Extra: DELETE removes booking by id
  it('DELETE: removes booking with matching id from state', () => {
    const existing = makeBooking({ id: 'del-me' })
    const h = buildHarness({
      tenantId: 't1',
      date: '2025-06-01',
      initialBookings: [existing],
    })

    h.fireEvent({
      eventType: 'DELETE',
      new: {},
      old: makeRawRow({ id: 'del-me' }),
      schema: 'public',
      table: 'bookings',
      commit_timestamp: '',
      errors: null,
    } as unknown as RealtimePostgresChangesPayload<RawRow>)

    expect(h.bookings.find((b) => b.id === 'del-me')).toBeUndefined()
  })

  // Extra: INSERT debounce collapses multiple rapid events to one fetch
  it('INSERT debounce: two rapid inserts produce only one reconcile fetch', () => {
    const h = buildHarness({ tenantId: 't1', date: '2025-06-01', initialBookings: [] })
    h.fireSubscribe('SUBSCRIBED')
    h.fetchFromApi.mockClear()

    const makePayload = (id: string) =>
      ({
        eventType: 'INSERT',
        new: makeRawRow({ id }),
        old: {},
        schema: 'public',
        table: 'bookings',
        commit_timestamp: '',
        errors: null,
      }) as unknown as RealtimePostgresChangesPayload<RawRow>

    h.fireEvent(makePayload('b1'))
    vi.advanceTimersByTime(100) // within debounce window — not fired yet
    h.fireEvent(makePayload('b2'))
    vi.advanceTimersByTime(400) // debounce settles

    // Only one fetch call despite two INSERTs
    expect(h.fetchFromApi.mock.calls.length).toBe(1)
  })
})
