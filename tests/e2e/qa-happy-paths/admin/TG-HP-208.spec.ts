import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import {
  tomorrowDateIsoArt,
  cleanupBookingsByIds,
  makeServiceClient,
  E2E_TENANT_ID,
  E2E_COURT_ID,
} from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'
import { openQuickBookingPopover } from '../../_helpers/grid'

/**
 * TG-HP-208 — Crear reserva MANUAL desde grilla (offline / "de palabra").
 * Rol: Admin o manager — requireOperatorStaff.
 * Prereq: Tenant Demo, Cancha E2E 1 online, fecha de mañana (ART), slot 20:00 libre.
 * Flujo: /grilla → click celda libre 20:00 → popover de alta rápida → "Más
 *   opciones" → modal "Nueva reserva" (motivo default
 *   "Reserva Telefónica") → nombre/teléfono opcionales → Confirmar → toast +
 *   booking visible en grilla.
 * Caso de plata: NO (reserva manual = status confirmed sin payments, spec §doc7).
 * Evidence anchors: src/app/(admin)/reservas/actions.ts:54-116,
 *   BookingFormModal.tsx:54-60,73-152,163-305, booking.service.ts:190-278.
 */
test.describe('TG-HP-208 — Reserva manual desde grilla (de palabra)', () => {
  test('admin creates a manual booking via the grilla modal — guest path → confirmed in DB, no payments row', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const tomorrow = tomorrowDateIsoArt()
    let bookingId: string | null = null

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      // waitUntil networkidle: el botón del slot ya existe en el HTML del SSR,
      // pero si React no hidrató todavía el click es un no-op silencioso.
      await page.goto(`/grilla?date=${tomorrow}`, { waitUntil: 'networkidle' })
      // Step 2/3: celda libre 20:00 (208 usa 20:00; 209 usa 21:00 — evita
      // colisión) → popover de alta rápida → el modal con el motivo vive detrás
      // de "Más opciones".
      await openQuickBookingPopover(page, '20:00')
      await page.getByRole('button', { name: /Más opciones/ }).click()

      await expect(page.getByText('Nueva reserva')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('#reason')).toHaveValue('phone')

      // Step 4: nombre + teléfono opcionales.
      await page.fill('#guestName', 'E2E QA-208 Manual')
      // El teléfono vive colapsado bajo "Opciones avanzadas" desde el rediseño
      // del modal (progressive disclosure). Este spec lo llenaba directo y
      // fallaba con "element is not visible" — roto en main desde antes de Fase 3.
      await page.getByRole('button', { name: 'Opciones avanzadas' }).click()
      await page.fill('#guestPhone', '+5491100000208')

      // Step 5: qué se cobró es respuesta obligatoria. "De palabra" es
      // justamente el turno que todavía no pagó nada.
      await page.selectOption('#depositMethod', 'none')

      // Step 6: confirmar.
      await page.getByRole('button', { name: 'Confirmar' }).click()

      // Toast + cierre del modal.
      await expect(page.getByText('Reserva creada', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })

      // Booking visible en la grilla (BookingCard renderiza el guest name).
      await expect(page.getByText(/E2E QA-208 Manual/i)).toBeVisible({ timeout: 10_000 })

      // DB: status siempre 'confirmed' para reservas manuales (nunca pending_payment),
      // type='spontaneous', sin payments asociado.
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('tenant_id', E2E_TENANT_ID)
        .eq('court_id', E2E_COURT_ID)
        .eq('date', tomorrow)
        .eq('time_start', '20:00:00')
        .maybeSingle()

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      expect(data?.status).toBe('confirmed')
      expect(data?.type).toBe('spontaneous')
      expect(data?.guest_name).toBe('E2E QA-208 Manual')
      expect(data?.payment_id).toBeNull()
      expect(data?.created_by_staff).not.toBeNull()
      bookingId = data?.id ?? null

      const paymentRows = await runSql<{ count: number }>(
        'SELECT count(*)::int AS count FROM payments WHERE booking_id = $1',
        [bookingId],
      )
      expect(paymentRows[0]?.count ?? 0).toBe(0)

      await writeEvidence('TG-HP-208', {
        status: 'pass',
        bookingId,
        date: tomorrow,
        dbRow: data,
        dbWrites: 'bookings INSERT (createManualBooking, status=confirmed, sin payments)',
        notes: 'Reserva "de palabra": no dispara MP ni crea fila en payments.',
      })
    } finally {
      await context.close()
      if (bookingId) await cleanupBookingsByIds(supabase, [bookingId])
    }
  })
})
