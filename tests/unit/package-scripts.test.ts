import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8'),
) as { scripts: Record<string, string> }

const scripts = pkg.scripts

describe('package.json E2E scripts', () => {
  it('test:e2e:ci includes core CI projects (chromium, mobile-chrome, axe-audit)', () => {
    expect(scripts['test:e2e:ci']).toBeDefined()
    expect(scripts['test:e2e:ci']).toContain('--project chromium')
    expect(scripts['test:e2e:ci']).toContain('--project mobile-chrome')
    expect(scripts['test:e2e:ci']).toContain('--project axe-audit')
  })

  it('test:e2e:ci does NOT include cross-browser projects (webkit, firefox, mobile-safari)', () => {
    const ci = scripts['test:e2e:ci']
    expect(ci).toBeDefined()
    expect(ci).not.toMatch(/\bwebkit\b/)
    expect(ci).not.toMatch(/\bfirefox\b/)
    expect(ci).not.toMatch(/\bmobile-safari\b/)
  })

  it('test:e2e:flake-detect includes @critical grep, repeat-each=10, and retries=0', () => {
    expect(scripts['test:e2e:flake-detect']).toBeDefined()
    expect(scripts['test:e2e:flake-detect']).toContain('--grep @critical')
    expect(scripts['test:e2e:flake-detect']).toContain('--repeat-each=10')
    expect(scripts['test:e2e:flake-detect']).toContain('--retries=0')
  })

  it('test:e2e:cross-browser includes webkit, firefox, and mobile-safari projects', () => {
    expect(scripts['test:e2e:cross-browser']).toBeDefined()
    expect(scripts['test:e2e:cross-browser']).toContain('--project webkit')
    expect(scripts['test:e2e:cross-browser']).toContain('--project firefox')
    expect(scripts['test:e2e:cross-browser']).toContain('--project mobile-safari')
  })
})
