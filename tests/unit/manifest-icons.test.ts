import { describe, it, expect } from 'vitest'
import manifest from '@/app/manifest'

describe('PWA manifest icons', () => {
  const m = manifest()

  it('includes icon 192x192 with purpose any', () => {
    const icon192 = m.icons?.find((i) => i.sizes === '192x192' && i.purpose === 'any')
    expect(icon192).toBeDefined()
    expect(icon192?.src).toBe('/icon-192')
  })

  it('includes icon 512x512 with purpose any', () => {
    const icon512 = m.icons?.find((i) => i.sizes === '512x512' && i.purpose === 'any')
    expect(icon512).toBeDefined()
    expect(icon512?.src).toBe('/icon-512')
  })

  it('includes icon 512x512 with purpose maskable', () => {
    const maskable = m.icons?.find((i) => i.sizes === '512x512' && i.purpose === 'maskable')
    expect(maskable).toBeDefined()
    expect(maskable?.src).toBe('/icon-512-maskable')
  })

  it('preserves 32x32 and 180x180 icons (regression guard)', () => {
    expect(m.icons?.find((i) => i.sizes === '32x32')).toBeDefined()
    expect(m.icons?.find((i) => i.sizes === '180x180')).toBeDefined()
  })

  it('declares categories including sports', () => {
    expect(m.categories).toContain('sports')
    expect(m.categories).toContain('business')
    expect(m.categories).toContain('productivity')
  })

  it('declares orientation portrait', () => {
    expect(m.orientation).toBe('portrait')
  })

  it('preserves display standalone (PWA install required by F9 push iOS 16.4+)', () => {
    expect(m.display).toBe('standalone')
  })
})
