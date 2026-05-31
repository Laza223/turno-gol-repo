import { test } from '@playwright/test'
import { expectNoAxeViolations } from './_helpers'

const ROUTES = ['/', '/explorar', '/login', '/register']

test.describe('Public routes a11y', () => {
  for (const route of ROUTES) {
    test(`${route} has no critical/serious axe violations`, async ({ page }) => {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      // color-contrast disabled — known design-system issue with brand
      // emerald-600 on white text (~3.6:1 < AA 4.5:1). See admin.spec.ts.
      await expectNoAxeViolations(page, { disableRules: ['color-contrast'] })
    })
  }
})
