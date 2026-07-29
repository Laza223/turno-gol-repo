/**
 * Regresión visual — mobile (Pixel 5, 393×851 @2x).
 *
 * Dos fotos, elegidas por dónde duele: el 70% del tráfico público es mobile, y
 * la grilla mobile tiene layout propio (GridScroller, banda de madrugada, touch
 * targets de 44px) — es la que más se rompe y la que menos se mira.
 *
 * El project `visual-mobile` matchea por `*.mobile.spec.ts`.
 */

import { test, expect, devChrome, suppressPushBanner, ADMIN_STORAGE_STATE } from './_visual-test'
import { FROZEN_NOW, VISUAL_DATE, VISUAL_TENANT_SLUG, seedVisualData } from './_seed'

test('ficha pública mobile @visual', async ({ page }) => {
  await suppressPushBanner(page)
  await page.goto(`/${VISUAL_TENANT_SLUG}`)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page).toHaveScreenshot('perfil-publico-mobile.png', {
    // Ver el spec de escritorio: la disponibilidad es "ahora"-relativa por diseño.
    mask: [...devChrome(page), page.getByRole('region', { name: 'Grilla de disponibilidad' })],
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
    await expect(page).toHaveScreenshot('admin-grilla-mobile.png', { mask: devChrome(page) })
  })
})
