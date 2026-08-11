/**
 * TG-HP-214 — Caja: agregar movimiento (ingreso).
 * Rol: Admin/manager (requireOperatorStaff vía createCashFlowAction).
 * Prereq: caja del tenant Demo del día de HOY sin fila en daily_cash_closes.
 * CASO DE PLATA — no se limpia la fila al final.
 * Evidencia: src/app/(admin)/caja/actions.ts:81-114 (createCashFlowAction),
 * src/app/(admin)/caja/components/RegisterMovementModal.tsx:49-209.
 */
import { test, expect } from '../../fixtures'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { todayART } from '../../../../src/shared/time/art-date'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

test.describe('TG-HP-214 — caja: agregar movimiento', () => {
  test('admin registra un ingreso manual → cash_flows + lista sin reload', async ({
    browser,
    adminStorageState,
  }) => {
    const today = todayART()

    // Defensive: garantiza caja de HOY abierta.
    await runSql(`DELETE FROM daily_cash_closes WHERE tenant_id = $1 AND date = $2::date`, [
      E2E_TENANT_ID,
      today,
    ])

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/caja')
      await expect(page.getByRole('heading', { name: 'Caja' })).toBeVisible({ timeout: 15_000 })

      await page.getByRole('button', { name: '+ Agregar movimiento' }).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByRole('heading', { name: 'Agregar movimiento' })).toBeVisible()

      // Mock data del manual: Ingreso / Otro ingreso / Efectivo son los chips
      // seleccionados — Ingreso y Efectivo SÍ vienen por default
      // (RegisterMovementModal.tsx:63-65), pero la categoría default es
      // 'booking' (primer ítem de CATEGORIES.income) — hay que clickear
      // "Otro ingreso" explícitamente para que quede seteada.
      // exact:true: el chip de categoría "Otro ingreso" matchea 'Ingreso' como
      // substring case-insensitive del chip de tipo si no se pide match exacto.
      await expect(page.getByRole('button', { name: 'Ingreso', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await page.getByRole('button', { name: 'Otro ingreso', exact: true }).click()
      await page.locator('#cf-amount').fill('5000')
      await page.locator('#cf-desc').fill('Venta de gorras sueltas')

      await page.getByRole('button', { name: 'Guardar' }).click()

      await expect(page.getByText('Movimiento registrado', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

      // UI-sin-reload: el movimiento aparece en "Movimientos del día" sin navegar.
      await expect(page.getByText('Venta de gorras sueltas').first()).toBeVisible({
        timeout: 10_000,
      })
      expect(page.url()).toContain('/caja')

      // ── DB assertion ──────────────────────────────────────────────────────
      const rows = await runSql<{
        id: string
        type: string
        category: string
        amount: number
        method: string
        description: string
      }>(
        `SELECT id, type, category, amount, method, description FROM cash_flows
         WHERE tenant_id = $1 AND description = 'Venta de gorras sueltas'
         ORDER BY created_at DESC LIMIT 1`,
        [E2E_TENANT_ID],
      )

      expect(rows).toHaveLength(1)
      expect(rows[0]?.type).toBe('income')
      expect(rows[0]?.category).toBe('other')
      expect(rows[0]?.amount).toBe(500_000) // 5000 pesos en centavos
      expect(rows[0]?.method).toBe('cash')

      await writeEvidence('TG-HP-214', {
        status: 'pass',
        cashFlowRow: rows[0],
        notes: 'Caso de plata: cash_flow queda vivo en DB. No se limpia en finally.',
      })
    } finally {
      await context.close()
    }
  })
})
