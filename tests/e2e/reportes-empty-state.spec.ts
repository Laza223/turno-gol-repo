/**
 * E2E — Reportes empty state (UX batch)
 *
 * Navigating to a month with no movements must show the informative empty
 * state (illustration + explanation of what the report will show) instead of
 * the bare one-liner, and hide the CSV export (an empty CSV is confusing).
 *
 * Uses a far-past month (2020-01) so it can never collide with seeded data.
 */

import { test, expect } from './fixtures'

test('reportes — mes sin movimientos muestra empty state informativo', async ({
  page,
  adminStorageState,
}) => {
  await page.context().addCookies(JSON.parse(adminStorageState).cookies)

  await page.goto('/reportes?month=2020-01')

  await expect(page.getByText('Sin movimientos en este período')).toBeVisible()
  await expect(
    page.getByText(/vas a ver los ingresos del mes/),
  ).toBeVisible()

  // CSV export hidden on an empty month
  await expect(page.getByRole('link', { name: /Exportar CSV/ })).toHaveCount(0)
})
