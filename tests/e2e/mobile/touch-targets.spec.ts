/**
 * E2E mobile — touch target audit (Fase F10)
 *
 * Verifica que los elementos interactivos visibles en mobile cumplen
 * WCAG 2.5.5 Level AA (target size 44x44 CSS px mínimo).
 *
 * Audita: /grilla (la vista más crítica del admin).
 * Allowlist: elementos display:none, sr-only, fuera de viewport,
 * deshabilitados, o triggers desktop-only (hidden md:flex).
 *
 * Viewport: Pixel 5 (393x851) via project mobile-chrome.
 */

import { test, expect } from '../fixtures'

const TARGET_MIN_PX = 44

test('admin /grilla — interactive elements meet 44px touch target', async ({
  browser,
  adminStorageState,
}) => {
  const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
  const page = await ctx.newPage()
  await page.goto('/grilla', { waitUntil: 'networkidle' })

  // Audit any element that the user can tap: buttons, links, inputs, selects,
  // and explicit role="button". Skip role="presentation"/decorative.
  const violations = await page.evaluate((min: number) => {
    function isVisible(el: Element): boolean {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        return false
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return false
      // Off-screen: skip.
      if (rect.bottom <= 0 || rect.right <= 0) return false
      if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false
      return true
    }

    const selectors = [
      'button',
      'a[href]',
      'input:not([type=hidden])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
    ]
    const els = Array.from(document.querySelectorAll(selectors.join(','))) as HTMLElement[]
    const fails: Array<{ tag: string; classes: string; text: string; w: number; h: number }> = []

    for (const el of els) {
      if (!isVisible(el)) continue
      if (el.matches('[disabled], [aria-disabled="true"]')) continue
      // Skip sr-only utility classes (visually-hidden labels).
      if (el.classList.contains('sr-only')) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < min || rect.height < min) {
        fails.push({
          tag: el.tagName.toLowerCase(),
          classes: el.className.toString().slice(0, 80),
          text: (el.textContent ?? '').trim().slice(0, 50),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        })
      }
    }
    return fails
  }, TARGET_MIN_PX)

  if (violations.length > 0) {
    console.log('Touch target violations on /grilla:')
    for (const v of violations) {
      console.log(`  - <${v.tag}> "${v.text}" ${v.w}x${v.h}px [${v.classes}]`)
    }
  }

  expect(violations).toEqual([])

  await ctx.close()
})
