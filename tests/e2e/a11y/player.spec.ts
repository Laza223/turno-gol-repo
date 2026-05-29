import { test } from '../fixtures'
import { expectNoAxeViolations } from './_helpers'

const ROUTES = ['/mis-reservas', '/perfil', '/configuracion']

test.describe('Player routes a11y', () => {
  for (const route of ROUTES) {
    test(`${route} has no critical/serious axe violations`, async ({
      browser,
      playerStorageState,
    }) => {
      const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
      const page = await ctx.newPage()
      try {
        await page.goto(route)
        await page.waitForLoadState('networkidle')
        await expectNoAxeViolations(page)
      } finally {
        await ctx.close()
      }
    })
  }
})
