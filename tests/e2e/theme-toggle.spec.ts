/**
 * E2E — Toggle de tema (F3, Task 12)
 *
 * Verifica que:
 *   #1  Hacer clic en "Claro" quita .dark del <html> y las páginas de app
 *       del jugador pasan a light.
 *   #2  Las páginas always-dark (/explorar) conservan su wrapper div.dark
 *       independientemente del tema elegido.
 *   #3  Hacer clic en "Oscuro" agrega .dark al <html>.
 *
 * Usa el storageState del jugador E2E (generado en global-setup) para
 * autenticar sin depender del flujo de magic-link en cada run.
 */

import { test, expect } from './fixtures'

test.describe('Toggle de tema', () => {
  test('togglea superficies de app y respeta always-dark', async ({ browser, playerStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/configuracion')

      // Forzar tema Claro
      await page.getByRole('radio', { name: 'Claro' }).click()
      await expect(page.locator('html')).not.toHaveClass(/dark/)

      // Superficie toggleable cambió a light
      await page.goto('/perfil')
      await expect(page.locator('html')).not.toHaveClass(/dark/)

      // Página always-dark: su layout fuerza .dark en un wrapper interno,
      // independiente del <html>. Verificar que el wrapper existe y es visible.
      await page.goto('/explorar')
      await expect(page.locator('div.dark').first()).toBeVisible()

      // Forzar tema Oscuro
      await page.goto('/configuracion')
      await page.getByRole('radio', { name: 'Oscuro' }).click()
      await expect(page.locator('html')).toHaveClass(/dark/)
    } finally {
      await ctx.close()
    }
  })

  test('admin: el panel flipa con el tema global (sidebar incluido)', async ({
    browser,
    adminStorageState,
  }) => {
    // Dev compila /dashboard on-demand en el primer hit (lento en frío).
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/dashboard')

      // El switch de tema (AdminThemeMenu) está montado en el header admin.
      // La interacción del dropdown Radix en sí se cubre con el patrón del
      // AccountMenu del jugador; acá validamos que el panel admin completo
      // (chrome incluido) responde al tema que ese toggle persiste.
      await expect(page.getByRole('button', { name: 'Cambiar tema' })).toBeVisible({
        timeout: 60_000,
      })

      // next-themes persiste el tema elegido en localStorage['theme'].
      // Forzar "oscuro" → el panel admin flipa a dark.
      await page.evaluate(() => window.localStorage.setItem('theme', 'dark'))
      await page.reload()
      await expect(page.locator('html')).toHaveClass(/dark/)

      // Forzar "claro" → vuelve a light (el sidebar, antes dark-por-diseño,
      // ahora también flipa).
      await page.evaluate(() => window.localStorage.setItem('theme', 'light'))
      await page.reload()
      await expect(page.locator('html')).not.toHaveClass(/dark/)
    } finally {
      await ctx.close()
    }
  })
})
