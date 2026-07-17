/**
 * TG-HP-216 — Caja: cerrar caja diaria.
 * Rol: Admin/manager (requireOperatorStaff vía closeDayAction).
 * Prereq: caja del día abierta (sin fila en daily_cash_closes para la fecha).
 *
 * OJO orden de ejecución: este caso cierra la caja de HOY para el tenant Demo.
 * Numéricamente corre DESPUÉS de TG-HP-210/214/215 (que necesitan la caja
 * abierta) dentro de esta misma banda — el runner ejecuta los specs del
 * directorio admin/ en orden alfabético de archivo, que coincide con el orden
 * numérico de los casos. Cualquier caso de una banda posterior que necesite
 * agregar un cash_flow a la caja de HOY del tenant Demo se encontrará con la
 * caja cerrada por este test (riesgo cross-banda, ver reporte final).
 *
 * CASO DE PLATA — no se limpia la fila de daily_cash_closes al final.
 * Evidencia: src/app/(admin)/caja/components/CloseDayButton.tsx:24-137,
 * src/modules/cashflow/daily-close.service.ts:42-120.
 */
import { test, expect } from '../../fixtures'
import { E2E_TENANT_ID, E2E_STAFF_USER_ID } from '../../_helpers/booking-seed'
import { todayART } from '../../../../src/shared/time/art-date'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

test.describe('TG-HP-216 — caja: cerrar caja diaria', () => {
  test('admin cierra la caja del día → daily_cash_closes + CierreCard inmutable', async ({
    browser,
    adminStorageState,
  }) => {
    const today = todayART()

    // Defensive: garantiza caja de HOY abierta antes de este test.
    await runSql(
      `DELETE FROM daily_cash_closes WHERE tenant_id = $1 AND date = $2::date`,
      [E2E_TENANT_ID, today],
    )

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/caja')
      await expect(page.getByRole('heading', { name: 'Caja' })).toBeVisible({ timeout: 15_000 })

      await page.getByRole('button', { name: 'Cerrar caja' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })
      await expect(page.getByRole('heading', { name: /Cerrar caja del/ })).toBeVisible()

      // Efectivo contado se deja vacío a propósito (sin diferencia que anotar).
      await dialog.locator('#confirm-phrase').fill('CERRAR')
      await dialog.getByRole('button', { name: 'Cerrar caja' }).click()

      // La descripción del toast es texto único (el título "Caja cerrada" también
      // lo renderiza CierreCard.h2 tras el refresh — chequear por el título
      // colisionaría en strict mode si ambos coexisten un instante).
      await expect(
        page.getByText('El resumen del día quedó guardado.', { exact: true }),
      ).toBeVisible({ timeout: 10_000 })
      await expect(dialog).not.toBeVisible({ timeout: 10_000 })

      // UI-sin-reload: CierreCard reemplaza CajaActions/CanteenQuickSale sin navegar.
      await expect(page.getByRole('heading', { name: 'Caja cerrada', exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('button', { name: '+ Agregar movimiento' })).not.toBeVisible()
      await expect(page.getByRole('button', { name: 'Cerrar caja' })).not.toBeVisible()
      expect(page.url()).toContain('/caja')

      // ── DB assertion ──────────────────────────────────────────────────────
      const rows = await runSql<{
        id: string
        declared_cash: number
        closed_by: string
      }>(
        `SELECT id, declared_cash, closed_by FROM daily_cash_closes
         WHERE tenant_id = $1 AND date = $2::date`,
        [E2E_TENANT_ID, today],
      )

      expect(rows).toHaveLength(1)
      expect(rows[0]?.declared_cash).toBe(0)
      expect(rows[0]?.closed_by).toBe(E2E_STAFF_USER_ID)

      await writeEvidence('TG-HP-216', {
        status: 'pass',
        date: today,
        dailyCashCloseRow: rows[0],
        notes:
          'Caso de plata: fila daily_cash_closes queda viva (además, la tabla es inmutable post-cierre por REVOKE UPDATE/DELETE — no se podría limpiar con el pool app aunque quisiéramos).',
      })
    } finally {
      await context.close()
    }
  })
})
