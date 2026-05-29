import { test } from '../fixtures'
import { expectNoAxeViolations } from './_helpers'

const ROUTES = ['/dashboard', '/grilla', '/reservas', '/caja', '/canchas', '/reportes']

test.describe('Admin routes a11y', () => {
  for (const route of ROUTES) {
    test(`${route} has no critical/serious axe violations`, async ({
      browser,
      adminStorageState,
    }) => {
      const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
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
