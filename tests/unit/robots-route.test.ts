import { describe, expect, it } from 'vitest'
import robots from '@/app/robots'

describe('robots()', () => {
  const r = robots()

  it('has a single rule for userAgent *', () => {
    expect(Array.isArray(r.rules)).toBe(true)
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    expect(rules).toHaveLength(1)
    expect(rules[0]!.userAgent).toBe('*')
  })

  it('allows public routes', () => {
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    const allow = rules[0]!.allow as string[]
    expect(allow).toContain('/')
    expect(allow).toContain('/explorar')
  })

  it('disallows private + sensitive routes', () => {
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    const disallow = rules[0]!.disallow as string[]
    expect(disallow).toContain('/api/')
    expect(disallow).toContain('/admin/')
    expect(disallow).toContain('/super-admin/')
    expect(disallow).toContain('/player/')
    expect(disallow).toContain('/monitoring')
  })

  it('references a sitemap URL', () => {
    expect(r.sitemap).toBeDefined()
    expect(String(r.sitemap)).toContain('/sitemap.xml')
  })
})
