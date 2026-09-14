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
import { openCreateModal } from '../../_helpers/grid'

/**
 * TG-HP-208 — Crear reserva MANUAL desde grilla (offline / "de palabra").
 * Rol: Admin o manager — requireOperatorStaff.
 * Prereq: Tenant Demo, Cancha E2E 1 online, fecha de mañana (ART), slot 20:00 libre.
 * Flujo: /grilla → click celda libre 20:00 → modal "Nueva reserva" (Turno,
 *   default) → nombre/teléfono → Confirmar → toast + booking visible en grilla.
 * Caso de plata: NO (reserva manual = status confirmed sin payments, spec §doc7).
 * Evidence anchors: src/app/(admin)/reservas/actions.ts:78-148,
 *   BookingFormModal.tsx, create-modal/TurnoForm.tsx, booking.service.ts.
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
      // colisión) abre DIRECTO el modal, con "Turno" ya elegido (rediseño
      // 2026-09-14: el alta rápida se eliminó).
      await openCreateModal(page, '20:00')

      // Step 4: nombre + teléfono.
      await page.getByLabel('¿A nombre de quién?').fill('E2E QA-208 Manual')
      await page.getByLabel('Teléfono').fill('11 0000-0208')

      // Step 5: "No cobré" viene preseleccionado — "De palabra" es justamente
      // el turno que todavía no pagó nada, así que no hace falta tocar nada más.

      // Step 6: confirmar.
      await page.getByRole('button', { name: /Reservar/ }).click()

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
