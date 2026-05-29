import { type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

export type AxeOptions = {
  /** CSS selectors to include in the scan (default: full page). */
  include?: string[]
  /** CSS selectors to exclude (e.g. third-party widgets). */
  exclude?: string[]
  /** axe rule IDs to disable (e.g. ['color-contrast'] if borderline shade is accepted in design system). */
  disableRules?: string[]
}

const SEVERITY = new Set(['critical', 'serious'])

/**
 * Run axe-core on the current page, assert 0 critical/serious violations.
 * Use after waitForLoadState('networkidle') to avoid pre-hydration false positives.
 */
export async function expectNoAxeViolations(page: Page, options: AxeOptions = {}) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])

  if (options.include) {
    for (const sel of options.include) builder = builder.include(sel)
  }
  if (options.exclude) {
    for (const sel of options.exclude) builder = builder.exclude(sel)
  }
  if (options.disableRules) {
    builder = builder.disableRules(options.disableRules)
  }

  const results = await builder.analyze()
  const blocking = results.violations.filter((v) => v.impact && SEVERITY.has(v.impact))

  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => {
        const nodes = v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' > '))
          .join('\n      ')
        return `  - [${v.impact}] ${v.id}: ${v.help}\n    nodes:\n      ${nodes}`
      })
      .join('\n')
    throw new Error(
      `axe-core found ${blocking.length} blocking violation(s):\n${summary}\n\nFull rule docs: https://dequeuniversity.com/rules/axe/`,
    )
  }
}
