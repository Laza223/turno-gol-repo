'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { GridBooking } from '@/components/booking/BookingGrid'
import type { BookingStatus, BookingType } from '@/modules/bookings/booking.types'

export type RealtimeStatus = 'CONNECTING' | 'SUBSCRIBED' | 'OFFLINE'

type RawRow = Record<string, unknown>

type ApiResponse = {
  data: Array<{
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
  }>
}

function normalizeRealtimeRow(row: RawRow): GridBooking {
  const dateVal = row['date']
  const dateStr = typeof dateVal === 'string' ? dateVal.slice(0, 10) : ''
  return {
    id: row['id'] as string,
    courtId: row['court_id'] as string,
    date: dateStr,
    timeStart: (row['time_start'] as string).slice(0, 5),
    timeEnd: (row['time_end'] as string).slice(0, 5),
    status: row['status'] as BookingStatus,
    type: row['type'] as BookingType,
    guestName: (row['guest_name'] as string | null) ?? null,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: row['price_snapshot'] as number,
  }
}

function normalizeApiRow(row: ApiResponse['data'][number]): GridBooking {
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
    status: row.status as BookingStatus,
    type: row.type as BookingType,
    guestName: row.guest_name,
    playerFirstName: row.player?.first_name ?? null,
    playerLastName: row.player?.last_name ?? null,
    priceSnapshot: row.price_snapshot,
  }
}

export function useBookingRealtime(opts: {
  tenantId: string
  date: string
  initialBookings: GridBooking[]
}): { bookings: GridBooking[]; status: RealtimeStatus } {
  const [bookings, setBookings] = useState<GridBooking[]>(opts.initialBookings)
  const [status, setStatus] = useState<RealtimeStatus>('CONNECTING')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconcileRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchFromApi = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings?date=${opts.date}&limit=200`)
      if (!res.ok) return
      const json = (await res.json()) as ApiResponse
      setBookings(json.data.map(normalizeApiRow))
    } catch {
      // retry on next tick
    }
  }, [opts.date])

  // Debounced authoritative refetch: collapses rapid INSERT/UPDATE bursts into
  // one round-trip so player names (absent from the realtime payload) get backfilled.
  const scheduleReconcile = useCallback(() => {
    if (reconcileRef.current) clearTimeout(reconcileRef.current)
    reconcileRef.current = setTimeout(() => void fetchFromApi(), 400)
  }, [fetchFromApi])

  useEffect(() => {
    let cancelled = false
    let teardown: (() => void) | undefined

    void (async () => {
      const { createClient } = await import('@/lib/supabase/client')
      if (cancelled) return
      const supabase = createClient()
      const channel = supabase
        .channel(`bookings:${opts.tenantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings' },
          (payload: RealtimePostgresChangesPayload<RawRow>) => {
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
              // Names absent from realtime payload — backfill via authoritative fetch
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
              // Names absent from realtime payload — backfill via authoritative fetch
              scheduleReconcile()
            }
          },
        )
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') {
            setStatus('SUBSCRIBED')
            if (pollRef.current) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }
            // Catch up on any events missed while OFFLINE (Supabase does not
            // guarantee an event queue). Also covers the micro-window between
            // the SSR snapshot and the first post-hydration SUBSCRIBED.
            void fetchFromApi()
          } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
            setStatus('OFFLINE')
            if (!pollRef.current) {
              pollRef.current = setInterval(() => void fetchFromApi(), 30_000)
            }
          }
        })
      teardown = () => {
        void supabase.removeChannel(channel)
      }
    })()

    return () => {
      cancelled = true
      teardown?.()
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (reconcileRef.current) {
        clearTimeout(reconcileRef.current)
        reconcileRef.current = null
      }
    }
  }, [opts.tenantId, opts.date, fetchFromApi, scheduleReconcile])

  return { bookings, status }
}
