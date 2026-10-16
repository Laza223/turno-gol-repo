/**
 * Regresión visual — mobile (Pixel 5, 393×851 @2x).
 *
 * Dos fotos, elegidas por dónde duele: el 70% del tráfico público es mobile, y
 * la grilla mobile tiene layout propio (GridScroller, banda de madrugada, touch
 * targets de 44px) — es la que más se rompe y la que menos se mira.
 *
 * El project `visual-mobile` matchea por `*.mobile.spec.ts`.
 */

import { test, expect, suppressPushBanner, ADMIN_STORAGE_STATE } from './_visual-test'
import { tomorrowDateIsoArt } from '../_helpers/booking-seed'
import { FROZEN_NOW, VISUAL_DATE, VISUAL_TENANT_SLUG, seedVisualData } from './_seed'

test('ficha pública mobile @visual', async ({ page }) => {
  await suppressPushBanner(page)
  // Mañana, no hoy: hoy puede no tener horas (ya pasaron) y eso cambia la altura de la reserva y
  // dónde cae el resto de la ficha (ver el spec de escritorio).
  await page.goto(`/${VISUAL_TENANT_SLUG}?date=${tomorrowDateIsoArt()}`)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  // La altura de la reserva decide dónde cae el resto de la ficha: se espera a que su primer estado
  // quede resuelto (horas, día cerrado o error: `data-state`), no a un texto que un día cerrado
  // o un error nunca tienen.
  await expect(page.getByRole('region', { name: 'Reservá tu turno' })).toHaveAttribute(
    'data-state',
    /^(ready|closed|error)$/,
  )
  await expect(page).toHaveScreenshot('perfil-publico-mobile.png', {
    // Ver el spec de escritorio: la reserva, el estado de apertura, la tira de días (sangra fuera
    // de la región) y la fila de hoy en Horarios son "ahora"-relativos por diseño.
    mask: [
      page.getByRole('region', { name: 'Reservá tu turno' }),
      page.getByTestId('open-status'),
      page.getByRole('radiogroup', { name: 'Día' }),
      page.getByTestId('opening-hours'),
    ],
  })
})

test.describe('visual mobile — admin', () => {
  test.use({ storageState: ADMIN_STORAGE_STATE })

  test.beforeAll(async () => {
    await seedVisualData()
  })

  test('grilla mobile @visual', async ({ page }) => {
    await suppressPushBanner(page)
    await page.clock.setFixedTime(FROZEN_NOW)
    await page.goto(`/grilla?date=${VISUAL_DATE}`)
    await expect(page.getByText('Martina Sosa')).toBeVisible()
    // El segmento Grilla|Agenda llega por portal después de hidratar (ver
    // `waitForHeaderSlot`): sin esperarlo, dos regeneraciones seguidas del
    // 2026-09-28 salieron una con el segmento y otra sin.
    await expect(page.getByRole('navigation', { name: 'Vistas de la grilla' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page).toHaveScreenshot('admin-grilla-mobile.png')
  })
})
