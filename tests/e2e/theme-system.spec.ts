import { test, expect } from '@playwright/test'

test.describe('Tema del celular en la home', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const savedTheme of [null, 'system'] as const) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`sigue ${colorScheme} del sistema con preferencia ${savedTheme ?? 'sin guardar'}`, async ({
        page,
      }) => {
        await page.addInitScript((theme) => {
          if (theme === null) localStorage.removeItem('theme')
          else localStorage.setItem('theme', theme)
        }, savedTheme)
        await page.emulateMedia({ colorScheme })
        await page.goto('/')

        const html = page.locator('html')
        await expect(html).toHaveClass(new RegExp(`\\b${colorScheme}\\b`))
        await expect(html).toHaveCSS('color-scheme', colorScheme)

        const opposite = colorScheme === 'dark' ? 'light' : 'dark'
        await page.emulateMedia({ colorScheme: opposite })
        await expect(html).toHaveClass(new RegExp(`\\b${opposite}\\b`))
        await expect(html).toHaveCSS('color-scheme', opposite)
        // El fondo de la página es el del mundo del portal: blanco en claro, el del panel en oscuro.
        const pageBg = page.locator('.player-shell-bg')
        // Claro: blanco (portal-world.css). Oscuro: --background de `.dark` en globals.css,
        // 224 71% 4% = #030711. El selector `html:has([data-world='portal']) .player-shell-bg`
        // (globals.css) es el que fija `background: var(--color-background)`.
        await expect(pageBg).toHaveCSS(
          'background-color',
          opposite === 'dark' ? 'rgb(3, 7, 17)' : 'rgb(255, 255, 255)',
        )

        await page.reload()
        await expect(html).toHaveClass(new RegExp(`\\b${opposite}\\b`))
      })
    }
  }

  for (const savedTheme of ['light', 'dark'] as const) {
    test(`respeta la elección manual ${savedTheme} aunque cambie el sistema`, async ({ page }) => {
      await page.addInitScript((theme) => localStorage.setItem('theme', theme), savedTheme)
      const opposite = savedTheme === 'dark' ? 'light' : 'dark'
      await page.emulateMedia({ colorScheme: opposite })
      await page.goto('/')

      const html = page.locator('html')
      await expect(html).toHaveClass(new RegExp(`\\b${savedTheme}\\b`))
      await page.emulateMedia({ colorScheme: savedTheme })
      await page.emulateMedia({ colorScheme: opposite })
      await expect(html).toHaveClass(new RegExp(`\\b${savedTheme}\\b`))
      await expect(html).toHaveCSS('color-scheme', savedTheme)
      await page.reload()
      await expect(html).toHaveClass(new RegExp(`\\b${savedTheme}\\b`))
      expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(savedTheme)
    })
  }
})
