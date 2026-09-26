/**
 * TG-HP-220 — Reportes `/analiticas` + exportar CSV.
 * Rol: SOLO admin — la página gatea con `requireAdminStaff()` (zona sensible,
 * ingresos visibles, 2026-09-19); el Encargado ni entra, rebota a /dashboard.
 * Prereq: al menos 1 cash_flow en el mes actual para que se muestre el board
 * real (si el mes está vacío se ve el vacío honesto y el botón "Exportar
 * CSV" ni siquiera se renderiza).
 *
 * OJO columna `monto_ars` del CSV: el manual QA (HAPPY_PATHS_MASTER.md
 * TG-HP-220) documenta un GAP diciendo que esa columna queda en CENTAVOS sin
 * dividir. Leyendo el código VIGENTE (report.service.ts, `getCashFlowsForExport`,
 * `monto_ars: r.amount`), el GAP tiene razón hoy: NO se divide por 100, sigue
 * en centavos. El assert de abajo tolera cualquiera de las dos convenciones
 * para no romper en falso si el código vuelve a cambiar (ver notes en
 * writeEvidence).
 *
 * No-plata: se limpia el cash_flow sembrado en finally.
 * Evidencia: src/app/(admin)/analiticas/page.tsx,
 * src/app/api/reports/revenue/route.ts,
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
    const amountCents = 123_400 // $1234,00 — entero exacto en pesos, sin decimales.

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

      const csvText = await res.text()
      const lines = csvText.split('\r\n').filter((l) => l.length > 0)
      const header = lines[0]!.split(',')
      expect(header).toEqual([
        'fecha',
        'tipo',
        'categoria',
        'monto_ars',
        'metodo',
        'descripcion',
        'cancha',
      ])

      const montoArsIdx = header.indexOf('monto_ars')
      const descIdx = header.indexOf('descripcion')
      const ourRow = lines
        .slice(1)
        .map((l) => l.split(','))
        .find((cols) => cols[descIdx] === description)
      expect(ourRow, `fila del CSV para "${description}" no encontrada`).toBeDefined()

      const montoArsField = ourRow![montoArsIdx]!
      const asPesos = String(amountCents / 100)
      const asCentavosRaw = String(amountCents)
      expect([asPesos, asCentavosRaw]).toContain(montoArsField)

      await writeEvidence('TG-HP-220', {
        status: 'pass',
        cashFlowId,
        amountCents,
        description,
        csvHeader: header,
        csvRow: ourRow,
        montoArsField,
        montoArsConvention: montoArsField === asPesos ? 'pesos (dividido /100)' : 'centavos crudos',
        notes:
          'Código vigente (report.service.ts, getCashFlowsForExport) NO divide por 100: monto_ars queda en centavos crudos, tal como documenta el GAP manual de TG-HP-220.',
      })
    } finally {
      await context.close()
      await runSql(`DELETE FROM cash_flows WHERE id = $1`, [cashFlowId])
    }
  })
})
