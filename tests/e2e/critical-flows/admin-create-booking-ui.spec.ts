/**
 * E2E — Admin crea reserva manual desde UI (doc7 Flujo 1)
 *
 * DIVERGENCIA con el plan original (fase F14 T2):
 *   El plan decía "1 test parametrizado por método de pago (cash/transfer/mercadopago)".
 *   Al revisar BookingFormModal.tsx, el modal NO tiene selector de método de pago.
 *   Sus campos son: Duración (60/120), Nombre invitado, Teléfono, Notas internas.
 *   El método de pago se asigna después en el módulo /caja al momento del cobro,
 *   que ya está cubierto por caja-crud.spec.ts.
 *   Por lo tanto T2 implementa 1 test único (no 3 parametrizados).
 *
 * Flujo cubierto: click cell libre en grilla → modal "Nueva reserva" → submit →
 *   booking visible en grilla + confirmado en DB.
 */

import { test, expect } from '../fixtures'
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
  test(
    'admin creates booking via grilla modal — guest path → confirmed in DB + visible in grid @critical',
    async ({ browser, adminStorageState }) => {
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

        // Click a free slot at 16:00 in the seeded court.
        // BookingCard renders free cells with aria-label `Reservar turno ${timeStart}`.
        await page.getByRole('button', { name: /Reservar turno 16:00/i }).first().click()

        // The BookingFormModal should open (Radix Dialog).
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('Nueva reserva')).toBeVisible()

        // Duration is fixed at 60 min for guest bookings (cambio #14 eliminated the
        // picker — SLOT_DURATION_MINUTES). It only renders for internal blocks.

        // Fill guest details (guestName requires guestPhone per modal validation).
        await page.fill('#guestName', 'E2E Admin Create')
        await page.fill('#guestPhone', '+5491100000099')

        // Submit the form.
        await page.getByRole('button', { name: 'Confirmar' }).click()

        // Toast success.
        // exact:true — the aria-live announcement renders
        // "Notification Reserva creadaCancha E2E 1…" which substring-matches
        // and trips strict mode.
        await expect(page.getByText('Reserva creada', { exact: true })).toBeVisible({ timeout: 10_000 })

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
    },
  )
})
