/**
 * E2E mobile — la puerta del complejo.
 *
 * La barra del portal esconde "Para complejos" bajo 640 px y /ingresar es el login del jugador:
 * desde el celu el dueño no tenía cómo llegar a /para-complejos, /login ni /register. Estos tests
 * corren solo en `mobile-chrome` (Pixel 5, 393 px) porque el hueco no existe en desktop.
 */

import { test, expect } from '@playwright/test'

test.describe('entrada del complejo desde el celu', () => {
  test('home: "Sumalo a TurnoGol" lleva a /para-complejos', async ({ page }) => {
    await page.goto('/')
    // La barra no la trae a este ancho: la entrada es la línea del hero.
    await expect(page.locator('header').getByRole('link', { name: /para complejos/i })).toBeHidden()
    const link = page.getByRole('link', { name: 'Sumalo a TurnoGol' })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/para-complejos$/)
  })

  test('/ingresar: "Entrar a mi panel" lleva a /login', async ({ page }) => {
    await page.goto('/ingresar')
    await page.getByRole('link', { name: 'Entrar a mi panel' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('/ingresar: "Registrar mi complejo" lleva a /register', async ({ page }) => {
    await page.goto('/ingresar')
    await page.getByRole('link', { name: 'Registrar mi complejo' }).click()
    await expect(page).toHaveURL(/\/register$/)
  })
})
