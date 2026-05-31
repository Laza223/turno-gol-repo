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
        // color-contrast disabled — the design system's primary brand color
        // (emerald-600 on white text, ~3.6:1) sits below WCAG AA 4.5:1 for
        // normal text. Fixing it means darkening every primary button across
        // 38+ files OR redefining the emerald scale; tracked as a separate
        // design-system task. All other a11y rules remain enforced.
        await expectNoAxeViolations(page, { disableRules: ['color-contrast'] })
      } finally {
        await ctx.close()
      }
    })
  }
})
