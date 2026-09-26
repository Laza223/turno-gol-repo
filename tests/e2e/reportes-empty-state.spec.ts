/**
 * E2E — Reportes empty state (rediseño "Canchas primero", 2026-09-26; ver
 * AnaliticasView.tsx / MonthBoard.tsx `MonthEmpty`)
 *
 * Navegar a un mes SIN movimientos muestra un solo vacío honesto ("En {mes}
 * no hubo cobros" en un mes ya pasado), sin los KPIs de ejemplo ni las barras
 * fantasma de antes (GhostKpis y el "3,2%" de muestra se eliminaron), y
 * oculta el export de CSV: un CSV vacío no sirve de nada.
 *
 * Uses a far-past month (2020-01) so it can never collide with seeded data.
 */

import { test, expect } from './fixtures'

test('reportes — mes sin movimientos muestra el vacío honesto, sin CSV', async ({
  page,
  adminStorageState,
}) => {
  await page.context().addCookies(JSON.parse(adminStorageState).cookies)

  await page.goto('/analiticas?month=2020-01')

  await expect(page.getByRole('heading', { name: 'En enero no hubo cobros' })).toBeVisible()
  // El link a la Grilla solo aparece en el mes en curso — acá no.
  await expect(page.getByRole('link', { name: 'Ir a la Grilla' })).toHaveCount(0)

  // CSV export hidden on an empty month
  await expect(page.getByRole('button', { name: /Exportar CSV/ })).toHaveCount(0)
})
