/**
 * E2E — Reportes empty state (pages/analiticas.md §6, "primera-vez espectral")
 *
 * Navigating to a month with no movements must show ghost example KPIs
 * (opacity 50%, non-interactive) with the "así se verá tu mes" label instead
 * of a mute empty state, and hide the CSV export (an empty CSV is confusing).
 *
 * Uses a far-past month (2020-01) so it can never collide with seeded data.
 */

import { test, expect } from './fixtures'

test('reportes — mes sin movimientos muestra KPIs de ejemplo (primera-vez espectral)', async ({
  page,
  adminStorageState,
}) => {
  await page.context().addCookies(JSON.parse(adminStorageState).cookies)

  await page.goto('/analiticas?month=2020-01')

  await expect(page.getByText('Así se verá tu mes cuando cargues reservas')).toBeVisible()
  await expect(page.getByText('Todavía no hay movimientos en este período.')).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Cargá tu primera reserva desde la grilla/ }),
  ).toBeVisible()

  // CSV export hidden on an empty month
  await expect(page.getByRole('link', { name: /Exportar CSV/ })).toHaveCount(0)
})
