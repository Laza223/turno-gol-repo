/**
 * TG-HP-215 — Caja: vender producto (Cantina/Bar).
 * Rol: Admin/manager (requireOperatorStaff vía sellCanteenProductAction).
 * Prereq: caja del día abierta; tenants.settings.canteen_products con ≥1
 * producto — se siembra directo por SQL (JSONB, sin tabla propia).
 *
 * El producto se siembra CON stock (5 unidades) para poder verificar el
 * descuento atómico (sellCanteenProductAction, caja/actions.ts:166-265) — la
 * nota del manual (TG-HP-215 GAP) que dice "no existe descuento de stock" está
 * desactualizada: el código actual SÍ lo implementa cuando el producto define
 * `stock` (confirmado también en CLAUDE.md, sección Caja).
 *
 * CASO DE PLATA — no se limpia el cash_flow al final.
 * Evidencia: src/app/(admin)/caja/actions.ts:166-265 (sellCanteenProductAction),
 * src/app/(admin)/caja/components/CanteenQuickSale.tsx:1-330.
 */
import { randomUUID } from 'node:crypto'
import { test, expect } from '../../fixtures'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { todayART } from '../../../../src/shared/time/art-date'
import { runSql, writeEvidence, jsonParam } from '../_qa/evidence'
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

    // Reemplaza canteen_products por un único producto determinístico (no hay
    // tabla propia — vive en tenants.settings JSONB, ver CLAUDE.md).
    // jsonParam(), NO JSON.stringify()+::jsonb — ese patrón doble-codifica el
    // array (postgres.js re-serializa el string, Postgres guarda un jsonb
    // *string* en vez de un array real y products.map explota en el server,
    // CanteenQuickSale.tsx:92 — confirmado con jsonb_typeof()).
    const products = [{ id: productId, name: productName, price: pricePerUnit, stock: 5 }]
    await runSql(`UPDATE tenants SET settings = jsonb_set(settings, '{canteen_products}', $1) WHERE id = $2`, [
      jsonParam(products),
      E2E_TENANT_ID,
    ])

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/caja')
      await expect(page.getByRole('heading', { name: 'Caja' })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('Cantina/Bar')).toBeVisible()

      // Retry el click: primer hit a esta ruta con productos reales (214/216
      // corren con canteen_products vacío, rama distinta de CanteenQuickSale) —
      // en dev local el primer click a veces se pierde (recompile/HMR de
      // Turbopack en curso, confirmado por [Fast Refresh] en la consola de la
      // página); reintentar el click hasta que el dialog abra, sin tocar la
      // aserción final.
      const productButton = page.getByRole('button', { name: new RegExp(productName) })
      await expect(productButton).toBeVisible()
      await expect(async () => {
        await productButton.click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 15_000 })
      await expect(page.getByRole('heading', { name: productName })).toBeVisible()
      await expect(page.getByText(/Stock disponible:\s*5/)).toBeVisible()

      // Mock data del manual: cantidad 2, método Efectivo (default).
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Sumar uno' }).click()
      await expect(dialog.getByText('2', { exact: true })).toBeVisible()

      await page.getByRole('button', { name: /Registrar venta/i }).click()

      await expect(page.getByText('Venta registrada', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

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
        [E2E_TENANT_ID, `${productName} x2`],
      )
      expect(cfRows).toHaveLength(1)
      expect(cfRows[0]?.type).toBe('income')
      expect(cfRows[0]?.category).toBe('product_sale')
      expect(cfRows[0]?.amount).toBe(pricePerUnit * 2)
      expect(cfRows[0]?.method).toBe('cash')

      // ── DB assertion: descuento atómico de stock (5 - 2 = 3) ─────────────
      const stockRows = await runSql<{ stock: number }>(
        `SELECT (elem->>'stock')::int AS stock
         FROM tenants, jsonb_array_elements(settings->'canteen_products') elem
         WHERE tenants.id = $1 AND elem->>'id' = $2`,
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
          'Caso de plata: cash_flow + canteen_products[stock] quedan vivos en DB. No se limpia en finally.',
      })
    } finally {
      await context.close()
    }
  })
})
