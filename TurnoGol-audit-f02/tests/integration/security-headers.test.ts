import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('next.config.js security headers', () => {
  const src = readFileSync(path.resolve('next.config.js'), 'utf8')

  it('does NOT include unsafe-eval in script-src', () => {
    const cspBlock = src.match(/Content-Security-Policy[\s\S]*?]\.join/m)?.[0] ?? ''
    expect(cspBlock).not.toMatch(/'unsafe-eval'/)
  })

  it('includes Strict-Transport-Security with preload + includeSubDomains', () => {
    expect(src).toMatch(/Strict-Transport-Security/i)
    expect(src).toMatch(/preload/)
    expect(src).toMatch(/includeSubDomains/)
    expect(src).toMatch(/max-age=\d{7,}/)
  })

  it('keeps X-Frame-Options: DENY', () => {
    expect(src).toMatch(/X-Frame-Options[\s\S]*DENY/)
  })
})
