import { test } from '@playwright/test'
import { expectNoAxeViolations } from './_helpers'

const ROUTES = ['/', '/explorar', '/login', '/register']

test.describe('Public routes a11y', () => {
  for (const route of ROUTES) {
    test(`${route} has no critical/serious axe violations`, async ({ page }) => {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expectNoAxeViolations(page)
    })
  }
})
