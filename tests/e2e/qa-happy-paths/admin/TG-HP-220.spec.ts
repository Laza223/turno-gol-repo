/**
 * TG-HP-220 — Reportes `/analiticas` + exportar CSV.
 * Rol: SOLO admin — la página gatea con `requireAdminStaff()` (zona sensible,
 * ingresos visibles, 2026-09-19); el Encargado ni entra, rebota a /dashboard.
 * Prereq: al menos 1 cash_flow en el mes actual para que se muestre el board
 * real (si el mes está vacío se ve el vacío honesto y el botón "Exportar
 * CSV" ni siquiera se renderiza).
 *
 * Formato del CSV (2026-11-01, `revenue-csv.ts`): el mismo es-AR que
 * Ajustes → Tus datos — BOM, `;`, encabezados en castellano y Monto en pesos
 * con coma decimal. Cierra el GAP de TG-HP-220 (antes `,` y centavos).
 *
 * No-plata: se limpia el cash_flow sembrado en finally.
 * Evidencia: src/app/(admin)/analiticas/page.tsx,
 * src/app/api/reports/revenue/route.ts,
 * src/app/api/reports/revenue/revenue-csv.ts,
 * src/modules/reports/report.service.ts (getCashFlowsForExport).
 */
import { test, expect } from '../../fixtures'
import { E2E_TENANT_ID, E2E_STAFF_USER_ID } from '../../_helpers/booking-seed'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

test.describe('TG-HP-220 — reportes + exportar CSV', () => {
  test('admin ve KPIs del mes y exporta el CSV con el movimiento sembrado', async ({
    browser,
    adminStorageState,
  }) => {
    const description = `QA seed reportes TG-HP-220 ${Date.now()}`
    const amountCents = 123_450 // $1234,50: con centavos, para ver la coma decimal.

    const seeded = await runSql<{ id: string; occurred_at: string }>(
      `INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
       VALUES ($1, 'income', 'other', $2, 'cash', $3, $4, NOW())
       RETURNING id, occurred_at::text`,
      [E2E_TENANT_ID, amountCents, description, E2E_STAFF_USER_ID],
    )
    const cashFlowId = seeded[0]!.id

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/analiticas')
      // El `<h1>Métricas` quedó `sr-only` en el rediseño "Canchas primero"
      // (2026-09-26): el título visible en contenido es el `<h2>` del board.
      await expect(page.getByRole('heading', { name: /^Entró en/ })).toBeVisible({
        timeout: 15_000,
      })

      // Con actividad en el mes, no se muestra el vacío honesto de MonthEmpty.
      await expect(page.getByRole('heading', { name: /^Todavía no hay cobros/ })).toHaveCount(0)

      const exportButton = page.getByRole('button', { name: /Exportar CSV/i })
      await expect(exportButton).toBeVisible()

      // Component layer: el click real dispara fetch + blob (ExportCsvButton.tsx),
      // que termina en una descarga de archivo nativa, sin toast de éxito.
      const [csvRequest, download] = await Promise.all([
        page.waitForRequest(
          (r) => r.url().includes('/api/reports/revenue') && r.url().includes('format=csv'),
        ),
        page.waitForEvent('download'),
        exportButton.click(),
      ])
      expect(download.suggestedFilename()).toMatch(/^reporte-.*\.csv$/)

      // Data layer: mismo endpoint y mismos params que usó el botón, vía
      // APIRequestContext (comparte cookies con el context del browser) para
      // inspeccionar el contenido exacto del CSV.
      const res = await context.request.get(csvRequest.url())
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toContain('text/csv')

      // BOM UTF-8: sin él, Excel lee el archivo como ANSI y rompe las tildes.
      const body = await res.body()
      expect(Array.from(body.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf])

      const csvText = body.subarray(3).toString('utf8')
      const lines = csvText.split('\r\n').filter((l) => l.length > 0)
      const header = lines[0]!.split(';')
      expect(header).toEqual([
        'Fecha',
        'Tipo',
        'Categoría',
        'Monto',
        'Método',
        'Descripción',
        'Cancha',
      ])

      const montoIdx = header.indexOf('Monto')
      const descIdx = header.indexOf('Descripción')
      const ourRow = lines
        .slice(1)
        .map((l) => l.split(';'))
        .find((cols) => cols[descIdx] === description)
      expect(ourRow, `fila del CSV para "${description}" no encontrada`).toBeDefined()
      expect(ourRow![header.indexOf('Tipo')]).toBe('Ingreso')
      expect(ourRow![header.indexOf('Categoría')]).toBe('Otro ingreso')
      expect(ourRow![header.indexOf('Método')]).toBe('Efectivo')
      expect(ourRow![montoIdx]).toBe('1234,50')

      await writeEvidence('TG-HP-220', {
        status: 'pass',
        cashFlowId,
        amountCents,
        description,
        csvHeader: header,
        csvRow: ourRow,
        notes: 'CSV es-AR: BOM, `;` y Monto en pesos con coma decimal (revenue-csv.ts).',
      })
    } finally {
      await context.close()
      await runSql(`DELETE FROM cash_flows WHERE id = $1`, [cashFlowId])
    }
  })
})
