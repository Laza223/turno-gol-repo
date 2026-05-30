/**
 * Regression guard: verifies that ≥10 E2E tests are tagged @critical.
 *
 * Reads all `tests/e2e/**‌/*.spec.ts` files recursively (excluding _helpers/),
 * counts the occurrences of `@critical` in test name strings, and asserts
 * the total is at least 10.
 *
 * This prevents accidental removal of tags or tests that would break the
 * `pnpm test:e2e:flake-detect` gate (which runs --grep @critical).
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walkSpecs(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('_helpers')) continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...walkSpecs(fullPath))
    } else if (entry.endsWith('.spec.ts')) {
      results.push(fullPath)
    }
  }
  return results
}

describe('e2e @critical tag coverage', () => {
  it('must have ≥10 @critical tagged tests', () => {
    const e2eDir = resolve(__dirname, '..', 'e2e')
    const specFiles = walkSpecs(e2eDir)

    let count = 0
    for (const file of specFiles) {
      const content = readFileSync(file).toString()
      count += content.match(/@critical/g)?.length ?? 0
    }

    expect(count, 'must have ≥10 @critical tagged tests').toBeGreaterThanOrEqual(10)
  })
})
