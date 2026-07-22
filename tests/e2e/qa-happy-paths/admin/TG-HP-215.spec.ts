/**
 * TG-HP-215 — Caja: vender producto (Cantina/Bar).
 * Rol: Admin/manager (requireOperatorStaff vía sellTicketAction).
 * Prereq: caja del día abierta; ≥1 producto en la tabla `canteen_products`
 * (Fase 2 del rediseño Caja/Cantina — migración 048, ya no vive en el JSONB
 * tenants.settings.canteen_products) — se siembra directo por SQL.
 *
 * El producto se siembra CON stock (5 unidades) para poder verificar el
 * descuento atómico (registerSale / stock.service.ts) — la nota del manual
 * (TG-HP-215 GAP) que dice "no existe descuento de stock" está desactualizada:
 * el código actual SÍ lo implementa cuando el producto define `stock`
 * (confirmado también en CLAUDE.md, sección Caja).
 *
 * Fase 3 del rediseño (ticket multi-ítem): la cantidad 2 se logra con DOS
 * taps al botón del producto (no con el diálogo de cantidad de la vieja
 * CanteenQuickSale, eliminada) — sigue siendo la regla de oro "1 ítem = 2 taps".
 *
 * CASO DE PLATA — no se limpia el cash_flow al final.
 * Evidencia: src/app/(admin)/caja/cantina/actions.ts (sellTicketAction),
 * src/app/(admin)/caja/cantina/TicketPanel.tsx.
 */
import { randomUUID } from 'node:crypto'
import { test, expect } from '../../fixtures'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { todayART } from '../../../../src/shared/time/art-date'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

test.describe('TG-HP-215 — caja: vender producto de cantina', () => {
  test('admin vende un producto de cantina con stock → cash_flows product_sale + descuento atómico', async ({
    browser,
    adminStorageState,
  }) => {
    const today = todayART()
    const productId = randomUUID()
    const productName = `Agua QA ${productId.slice(0, 8)}`
    const pricePerUnit = 150_000 // $1500 en centavos

    await runSql(
      `DELETE FROM daily_cash_closes WHERE tenant_id = $1 AND date = $2::date`,
      [E2E_TENANT_ID, today],
    )

    // Reemplaza el catálogo de canteen_products por un único producto
    // determinístico (tabla real desde la migración 048, ya no JSONB).
    await runSql(`DELETE FROM canteen_products WHERE tenant_id = $1`, [E2E_TENANT_ID])
    await runSql(
      `INSERT INTO canteen_products (id, tenant_id, name, price, stock) VALUES ($1, $2, $3, $4, $5)`,
      [productId, E2E_TENANT_ID, productName, pricePerUnit, 5],
    )

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      // Rediseño: la venta rápida de cantina vive en /caja/cantina.
      await page.goto('/caja/cantina')
      await expect(page.getByRole('heading', { name: 'Caja y Cantina' })).toBeVisible({ timeout: 15_000 })
      // Ticket vacío: hint de arranque de TicketPanel (Fase 3).
      await expect(page.getByText('Tocá un producto para empezar')).toBeVisible()

      // Retry el click: primer hit a esta ruta con productos reales (214/216
      // corren con canteen_products vacío) — en dev local el primer click a
      // veces se pierde (recompile/HMR de Turbopack en curso, confirmado por
      // [Fast Refresh] en la consola de la página); reintentar el click hasta
      // que el ticket registre la línea, sin tocar la aserción final.
      const productButton = page.getByRole('button', { name: new RegExp(productName) })
      await expect(productButton).toBeVisible()
      await expect(async () => {
        await productButton.click()
        await expect(page.getByText('×1')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 15_000 })
      await expect(page.getByText('Stock 5')).toBeVisible()

      // Mock data del manual: cantidad 2 — segundo tap al mismo producto
      // (Fase 3: sin diálogo, tap suma la línea) — método Efectivo (default).
      await productButton.click()
      await expect(page.getByText('×2')).toBeVisible()

      await page.getByRole('button', { name: /^Cobrar/ }).click()

      await expect(page.getByText(/Venta registrada/)).toBeVisible({
        timeout: 10_000,
      })
      // Éxito: el ticket se vacía (vuelve el hint) — listo para la próxima venta.
      await expect(page.getByText('Tocá un producto para empezar')).toBeVisible({ timeout: 10_000 })

      // ── DB assertion: cash_flow ──────────────────────────────────────────
      const cfRows = await runSql<{
        id: string
        type: string
        category: string
        amount: number
        method: string
        description: string
      }>(
        `SELECT id, type, category, amount, method, description FROM cash_flows
         WHERE tenant_id = $1 AND description = $2
         ORDER BY created_at DESC LIMIT 1`,
        // ticketDescription() (canteen-sale.service.ts) antepone "Cantina: ".
        [E2E_TENANT_ID, `Cantina: ${productName} x2`],
      )
      expect(cfRows).toHaveLength(1)
      expect(cfRows[0]?.type).toBe('income')
      expect(cfRows[0]?.category).toBe('product_sale')
      expect(cfRows[0]?.amount).toBe(pricePerUnit * 2)
      expect(cfRows[0]?.method).toBe('cash')

      // ── DB assertion: descuento atómico de stock (5 - 2 = 3) ─────────────
      const stockRows = await runSql<{ stock: number }>(
        `SELECT stock FROM canteen_products WHERE tenant_id = $1 AND id = $2`,
        [E2E_TENANT_ID, productId],
      )
      expect(stockRows).toHaveLength(1)
      expect(stockRows[0]?.stock).toBe(3)

      await writeEvidence('TG-HP-215', {
        status: 'pass',
        productId,
        productName,
        cashFlowRow: cfRows[0],
        stockAfter: stockRows[0]?.stock,
        notes:
          'Caso de plata: cash_flow + canteen_products.stock quedan vivos en DB. No se limpia en finally.',
      })
    } finally {
      await context.close()
    }
  })
})
