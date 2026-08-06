/**
 * TG-HP-220 — Reportes `/analiticas` + exportar CSV.
 * Rol: cualquier staff autenticado (sin gate de rol a nivel página — admin y
 * manager acceden). Prereq: al menos 1 cash_flow en el mes actual para que se
 * muestren los KPIs reales (si el mes está vacío, se ve el estado fantasma y
 * el link "Exportar CSV" ni siquiera se renderiza).
 *
 * OJO columna `monto_ars` del CSV: el manual QA (HAPPY_PATHS_MASTER.md
 * TG-HP-220) documenta un GAP diciendo que esa columna queda en CENTAVOS sin
 * dividir. Leyendo el código VIGENTE (report.service.ts:221-223,
 * `monto_ars: r.amount / 100`), la columna SÍ se divide por 100 — está en
 * PESOS. El assert de abajo tolera cualquiera de las dos convenciones para no
 * romper en falso si el código vuelve a cambiar, pero documenta cuál es la
 * real hoy (ver notes en writeEvidence). Reportar esta discrepancia manual↔código.
 *
 * No-plata: se limpia el cash_flow sembrado en finally.
 * Evidencia: src/app/(admin)/analiticas/page.tsx:73-294,
 * src/app/api/reports/revenue/route.ts:1-51,
 * src/modules/reports/report.service.ts:195-229.
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
      await expect(page.getByRole('heading', { name: 'Métricas' })).toBeVisible({
        timeout: 15_000,
      })

      // Con actividad en el mes, no se muestra el estado fantasma.
      await expect(page.getByText('Ingresos').first()).toBeVisible()
      await expect(
        page.getByText('Así se verá tu mes cuando cargues reservas'),
      ).not.toBeVisible()

      const exportLink = page.getByRole('link', { name: /Exportar CSV/i })
      await expect(exportLink).toBeVisible()
      const href = await exportLink.getAttribute('href')
      expect(href).toBeTruthy()

      // Component layer: el click real dispara una descarga de archivo (GET
      // idempotente, sin toast — el navegador maneja la descarga nativamente).
      const [download] = await Promise.all([page.waitForEvent('download'), exportLink.click()])
      expect(download.suggestedFilename()).toMatch(/^reporte-.*\.csv$/)

      // Data layer: mismo endpoint, vía APIRequestContext (comparte cookies con
      // el context del browser) para inspeccionar el contenido exacto del CSV.
      const res = await context.request.get(href!)
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toContain('text/csv')

      const csvText = await res.text()
      const lines = csvText.split('\r\n').filter((l) => l.length > 0)
      const header = lines[0]!.split(',')
      expect(header).toEqual(['fecha', 'tipo', 'categoria', 'monto_ars', 'metodo', 'descripcion', 'cancha'])

      const montoArsIdx = header.indexOf('monto_ars')
      const descIdx = header.indexOf('descripcion')
      const ourRow = lines.slice(1).map((l) => l.split(',')).find((cols) => cols[descIdx] === description)
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
          'Código vigente (report.service.ts:221-223) divide por 100: monto_ars está en PESOS, no en centavos. El manual QA (GAP TG-HP-220) dice lo contrario — desactualizado.',
      })
    } finally {
      await context.close()
      await runSql(`DELETE FROM cash_flows WHERE id = $1`, [cashFlowId])
    }
  })
})
