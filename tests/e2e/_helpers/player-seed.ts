/**
 * Shared seed helpers for player-area E2E specs (F8).
 *
 * Uses the Supabase service-role client (same pattern as booking-flow.spec.ts
 * and grilla-realtime.spec.ts) so we bypass RLS without needing a DB URL.
 *
 * resetPlayer() is idempotent — safe to call in beforeEach and afterEach on
 * every spec, including player-delete-account which anonymizes the row.
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { bookingInstants } from './booking-instants'

// ─── Seed constants (mirror scripts/seed-e2e.ts) ────────────────────────────

export const E2E_PLAYER_ID = '00000000-0000-4000-8000-000000000020'
export const E2E_PLAYER_EMAIL = 'e2e-player@turnogol.test'
export const E2E_TENANT_ID = '00000000-0000-4000-8000-000000000001'
const E2E_DEPOSIT_TENANT_ID = '00000000-0000-4000-8000-000000000030'
export const E2E_COURT_ID = '00000000-0000-4000-8000-000000000010'

// ─── Service-role client factory ─────────────────────────────────────────────

export function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for player-seed helpers')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Date helper ─────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for tomorrow in ART (UTC-3). */
export function artTomorrowISO(): string {
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 3600_000)
  return tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

// ─── Player reset (idempotent) ────────────────────────────────────────────────

/**
 * Restores the E2E player to a known-good state.
 *
 * Safe to call after anonymizePlayer — the players row exists (just modified),
 * so we UPDATE it directly. PTR rows are deleted by anonymize, so we re-insert.
 *
 * Ordering:
 *   1. NULL OUT bookings.player_id for player's bookings (avoids FK conflict on player UPDATE)
 *      — actually not needed since we only UPDATE the existing row, not DELETE+INSERT.
 *   2. UPDATE players row: restore PII + status='active'.
 *   3. Delete any stale PTR rows then re-insert both tenant entries.
 */
export async function resetPlayer(supabase: ReturnType<typeof makeServiceClient>): Promise<void> {
  // Step 1: Restore players row (UPDATE handles both active and anonymized states)
  const { error: playerErr } = await supabase
    .from('players')
    .update({
      email: E2E_PLAYER_EMAIL,
      first_name: 'E2E',
      last_name: 'Player',
      phone: null,
      preferred_area: null,
      avatar_url: null,
      status: 'active',
      ban_reason: null,
      ban_until: null,
      agreed_to_terms_at: new Date().toISOString(),
      terms_version: 'v1',
    })
    .eq('id', E2E_PLAYER_ID)

  if (playerErr) {
    throw new Error(`resetPlayer UPDATE failed: ${playerErr.message}`)
  }

  // Step 2: Delete stale PTR rows (may or may not exist)
  await supabase
    .from('player_tenant_relationships')
    .delete()
    .eq('player_id', E2E_PLAYER_ID)

  // Step 3: Re-insert PTR rows for both tenants
  const { error: ptrDemoErr } = await supabase
    .from('player_tenant_relationships')
    .insert({ tenant_id: E2E_TENANT_ID, player_id: E2E_PLAYER_ID })

  if (ptrDemoErr && !/duplicate|unique/i.test(ptrDemoErr.message)) {
    throw new Error(`resetPlayer PTR demo insert failed: ${ptrDemoErr.message}`)
  }

  const { error: ptrDepositErr } = await supabase
    .from('player_tenant_relationships')
    .insert({ tenant_id: E2E_DEPOSIT_TENANT_ID, player_id: E2E_PLAYER_ID })

  if (ptrDepositErr && !/duplicate|unique/i.test(ptrDepositErr.message)) {
    throw new Error(`resetPlayer PTR deposit insert failed: ${ptrDepositErr.message}`)
  }
}

// ─── Booking helpers ─────────────────────────────────────────────────────────

type InsertPlayerBookingOpts = {
  date: string
  status?: string
  timeStart?: string
  timeEnd?: string
  /** Override tenant (default: E2E_TENANT_ID). */
  tenantId?: string
  /** Override court (default: E2E_COURT_ID). */
  courtId?: string
  /** deposit_status column (default: 'not_required'). */
  depositStatus?: string
  /** deposit_amount in centavos (default: 0). */
  depositAmount?: number
}

/**
 * Inserts a booking owned by the E2E player.
 * Returns the generated booking ID.
 *
 * Backwards-compatible: callers that only pass `{ date }` continue to work
 * because all new fields have defaults that match the previous hard-coded values.
 */
export async function insertPlayerBooking(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: InsertPlayerBookingOpts,
): Promise<string> {
  const bookingId = randomUUID()
  const timeStart = opts.timeStart ?? '14:00'
  const timeEnd = opts.timeEnd ?? '15:00'
  const status = opts.status ?? 'confirmed'
  const tenantId = opts.tenantId ?? E2E_TENANT_ID
  const courtId = opts.courtId ?? E2E_COURT_ID
  const depositStatus = opts.depositStatus ?? 'not_required'
  const depositAmount = opts.depositAmount ?? 0

  const { error } = await supabase.from('bookings').insert({
    id: bookingId,
    tenant_id: tenantId,
    court_id: courtId,
    player_id: E2E_PLAYER_ID,
    date: opts.date,
    time_start: `${timeStart}:00`,
    time_end: `${timeEnd}:00`,
    // NOT NULL desde el refactor de instantes físicos. Este insert va por el service
    // client, saltea la capa de servicios, y por eso hay que derivarlos a mano.
    ...bookingInstants({ date: opts.date, timeStart, timeEnd }),
    type: 'spontaneous',
    status,
    price_snapshot: 1500000,
    deposit_amount: depositAmount,
    deposit_status: depositStatus,
  })

  if (error) {
    throw new Error(`insertPlayerBooking failed: ${error.message}`)
  }

  return bookingId
}

/**
 * Deletes all bookings owned by the E2E player in the demo tenant.
 * Null-outs payment_id first to satisfy FK constraint.
 */
export async function cleanupPlayerBookings(
  supabase: ReturnType<typeof makeServiceClient>,
): Promise<void> {
  // Delete the player's payments FIRST: payments.booking_id → bookings.id is a
  // NO ACTION FK, so leftover payments (from a real webhook/checkout) block the
  // bookings DELETE below and leave orphan bookings occupying their slots.
  await supabase.from('payments').delete().eq('player_id', E2E_PLAYER_ID)

  // NULL out payment_id (FK to payments) before deleting
  await supabase
    .from('bookings')
    .update({ payment_id: null, payment_method: null })
    .eq('player_id', E2E_PLAYER_ID)

  await supabase
    .from('bookings')
    .delete()
    .eq('player_id', E2E_PLAYER_ID)
}
