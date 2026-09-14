/**
 * E2E — Admin crea reserva manual desde UI (doc7 Flujo 1)
 *
 * Rediseño 2026-09-14 (pages/grilla.md §3bis): el alta rápida se eliminó —
 * tocar una celda libre abre DIRECTO el modal único, con "Turno" ya elegido.
 *
 * Flujo cubierto: click cell libre en grilla → modal "Nueva reserva" (Turno) →
 * nombre + Enter → submit → booking visible en grilla + confirmado en DB.
 */

import { test, expect } from '../fixtures'
import { openCreateModal } from '../_helpers/grid'
import {
  tomorrowDateIsoArt,
  cleanupBookingsByIds,
  makeServiceClient,
  E2E_TENANT_ID,
  E2E_COURT_ID,
} from '../_helpers/booking-seed'

// ════════════════════════════════════════════════════════════════════════════
// TEST — Admin crea reserva manual vía modal de la grilla (guest path)
// ════════════════════════════════════════════════════════════════════════════

test.describe('admin create booking UI — flow 1 doc7', () => {
  test('admin creates booking via grilla modal — guest path → confirmed in DB + visible in grid @critical', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const tomorrow = tomorrowDateIsoArt()
    let bookingId: string | null = null

    const context = await browser.newContext()
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      // networkidle, no el 'load' por default: el <button> del slot ya existe en
      // el HTML del SSR y Playwright lo clickea apenas es visible, pero si React
      // todavia no hidrato el click es un no-op silencioso y el modal nunca abre.
      // Es el mismo waitUntil que usa el resto de los specs de admin.
      await page.goto(`/grilla?date=${tomorrow}`, { waitUntil: 'networkidle' })

      // Wait for the grid table to render.
      await expect(page.getByTestId('booking-grid')).toBeVisible({ timeout: 15_000 })

      // El click de una celda libre abre DIRECTO el modal, con "Turno" elegido.
      await openCreateModal(page, '16:00')

      // Fill guest details ("¿A nombre de quién?" es el campo de Turno).
      await page.getByLabel('¿A nombre de quién?').fill('E2E Admin Create')
      await page.getByLabel('Teléfono').fill('11 2345-6789')

      // Submit — botón "Reservar" (+ monto de la grilla).
      await page.getByRole('button', { name: /Reservar/ }).click()

      // Toast success.
      // exact:true — the aria-live announcement renders
      // "Notification Reserva creadaCancha E2E 1…" which substring-matches
      // and trips strict mode.
      await expect(page.getByText('Reserva creada', { exact: true })).toBeVisible({
        timeout: 10_000,
      })

      // Dialog closes after success.
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })

      // Booking visible in the grid — guest name rendered by BookingCard.
      // BookingCard truncates at 20 chars: 'E2E Admin Create' is 16 chars, fully visible.
      await expect(page.getByText(/E2E Admin Create/i)).toBeVisible({ timeout: 10_000 })

      // Verify DB row via service-role.
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('tenant_id', E2E_TENANT_ID)
        .eq('court_id', E2E_COURT_ID)
        .eq('date', tomorrow)
        .eq('time_start', '16:00:00')
        .maybeSingle()

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      expect(data?.status).toBe('confirmed')
      expect(data?.type).toBe('spontaneous')
      expect(data?.guest_name).toBe('E2E Admin Create')
      expect(data?.created_by_staff).not.toBeNull()

      bookingId = data?.id ?? null
    } finally {
      await context.close()
      if (bookingId) {
        await cleanupBookingsByIds(supabase, [bookingId])
      }
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TEST — Enter confirma sin tocar el botón (el caso común: tap → nombre → Enter)
  // ══════════════════════════════════════════════════════════════════════════
  test('admin creates booking pressing Enter — no cobra nada → confirmed in DB @critical', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const tomorrow = tomorrowDateIsoArt()
    let bookingId: string | null = null

    const context = await browser.newContext()
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()
      await page.goto(`/grilla?date=${tomorrow}`, { waitUntil: 'networkidle' })
      // 14:00: los otros specs de admin usan 16:00/20:00/21:00 en esta fecha.
      await openCreateModal(page, '14:00')
      const nombre = page.getByLabel('¿A nombre de quién?')

      // "No cobré" es el default: el nombre alcanza para confirmar.
      await nombre.fill('E2E Quick Enter')
      // Enter confirma — sin tocar el botón.
      await nombre.press('Enter')

      await expect(page.getByText('Reserva creada', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/E2E Quick Enter/i)).toBeVisible({ timeout: 10_000 })

      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('tenant_id', E2E_TENANT_ID)
        .eq('court_id', E2E_COURT_ID)
        .eq('date', tomorrow)
        .eq('time_start', '14:00:00')
        .maybeSingle()

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      expect(data?.status).toBe('confirmed')
      expect(data?.type).toBe('spontaneous')
      expect(data?.guest_name).toBe('E2E Quick Enter')
      // Sin contestar qué se cobró (default "No cobré"): el turno no arrastra deposit.
      expect(data?.deposit_status).toBe('not_required')

      bookingId = data?.id ?? null
    } finally {
      await context.close()
      if (bookingId) {
        await cleanupBookingsByIds(supabase, [bookingId])
      }
    }
  })
})
