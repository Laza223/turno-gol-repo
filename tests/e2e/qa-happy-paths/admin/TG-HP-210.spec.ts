/**
 * TG-HP-210 — Detalle de reserva: agregar cobro parcial.
 * Rol: Admin/manager (requireOperatorStaff). Prereq: reserva confirmed con saldo
 * pendiente > 0 + caja del día abierta (sin fila en daily_cash_closes).
 * CASO DE PLATA — no se limpia la fila al final (queda viva para verificadores).
 * Evidencia: src/app/(admin)/reservas/actions.ts:363-486 (addBookingChargeAction),
 * src/app/(admin)/reservas/[id]/BookingCharges.tsx:39-236.
 */
import type { Locator } from '@playwright/test'
import { test, expect } from '../../fixtures'
import {
  tomorrowDateIsoArt,
  insertBookingServiceRole,
  makeServiceClient,
  E2E_TENANT_ID,
  E2E_COURT_ID,
  E2E_STAFF_USER_ID,
} from '../../_helpers/booking-seed'
import { todayART } from '../../../../src/shared/time/art-date'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

/**
 * Compara el monto renderizado (vía formatArs, Intl.NumberFormat del browser)
 * contra los centavos esperados dejando SOLO los dígitos — evita depender de
 * que el símbolo/separador de miles de Chromium coincida byte a byte con el
 * de Node (mismo locale 'es-AR', pero ICU puede diferir en espacios/símbolos).
 */
async function expectPesosDigits(locator: Locator, cents: number): Promise<void> {
  await expect(async () => {
    const text = (await locator.textContent()) ?? ''
    expect(text.replace(/\D/g, '')).toBe(String(Math.round(cents / 100)))
  }).toPass({ timeout: 10_000 })
}

test.describe('TG-HP-210 — agregar cobro parcial', () => {
  test('admin agrega un cobro parcial → cash_flows + saldo pendiente actualizado sin reload', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const tomorrow = tomorrowDateIsoArt()
    const today = todayART()

    // Defensive: garantiza caja del día ABIERTA — un run anterior de este mismo
    // QA suite pudo haber cerrado la caja de "hoy" (TG-HP-216). El superuser DSN
    // de runSql bypassea el REVOKE UPDATE/DELETE de turnogol_app.
    await runSql(`DELETE FROM daily_cash_closes WHERE tenant_id = $1 AND date = $2::date`, [
      E2E_TENANT_ID,
      today,
    ])

    const priceSnapshot = 200_000 // $2000
    const partialCharge = 50_000 // $500 (parcial, < pendiente)

    const bookingId = await insertBookingServiceRole(supabase, {
      tenantId: E2E_TENANT_ID,
      courtId: E2E_COURT_ID,
      date: tomorrow,
      timeStart: '13:00:00',
      timeEnd: '14:00:00',
      status: 'confirmed',
      priceSnapshot,
      depositAmount: 0,
      depositStatus: 'not_required',
    })

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    // Caso de plata: solo cerramos el contexto del browser en finally — el
    // booking + cash_flow quedan vivos en DB a propósito (evidencia para el
    // verificador), no se limpian.
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto(`/reservas/${bookingId}`)
      await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
        timeout: 15_000,
      })

      // "Saldo pendiente" dd por selector de hermano CSS (dt+dd) — evita
      // ambigüedad de strict-mode: sin seña y sin cobros, el pendiente inicial
      // es igual al precio del turno, así que un simple `dd:has-text(...)`
      // matchea DOS filas ("Precio del turno" Y "Saldo pendiente").
      const pendingDd = page.locator('dt:text-is("Saldo pendiente") + dd')

      // Saldo pendiente inicial = precio completo (sin seña, sin cobros).
      await expectPesosDigits(pendingDd, priceSnapshot)

      await page.getByRole('button', { name: '+ Agregar cobro' }).click()

      // El monto viene prefilled con el pendiente total (BookingCharges.tsx:69) —
      // lo reemplazamos por un monto PARCIAL.
      const amountInput = page.locator('#charge-amount')
      await expect(amountInput).toHaveValue(String(priceSnapshot / 100))
      await amountInput.fill(String(partialCharge / 100))
      await page.locator('#charge-method').selectOption('transfer')

      await page.getByRole('button', { name: 'Registrar cobro' }).click()

      await expect(page.getByText('Cobro registrado', { exact: true })).toBeVisible({
        timeout: 10_000,
      })

      // UI-sin-reload: el saldo pendiente baja SIN navegación — router.refresh()
      // client-side, misma URL.
      const expectedPending = priceSnapshot - partialCharge
      await expectPesosDigits(pendingDd, expectedPending)
      expect(page.url()).toContain(`/reservas/${bookingId}`)

      // ── DB assertion ──────────────────────────────────────────────────────
      const { data: chargeRows, error } = await supabase
        .from('cash_flows')
        .select('amount, method, type, category, booking_id')
        .eq('booking_id', bookingId)

      expect(error).toBeNull()
      expect(chargeRows).toHaveLength(1)
      expect(chargeRows?.[0]?.amount).toBe(partialCharge)
      expect(chargeRows?.[0]?.method).toBe('transfer')
      expect(chargeRows?.[0]?.type).toBe('income')
      expect(chargeRows?.[0]?.category).toBe('booking')

      await writeEvidence('TG-HP-210', {
        status: 'pass',
        bookingId,
        priceSnapshot,
        partialCharge,
        expectedPending,
        cashFlowRow: chargeRows?.[0],
        registeredBy: E2E_STAFF_USER_ID,
        notes:
          'Caso de plata: booking + cash_flow quedan vivos en DB para el verificador. No se limpia en finally.',
      })
    } finally {
      await context.close()
    }
  })
})
