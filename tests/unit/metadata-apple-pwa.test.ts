import { describe, it, expect, vi } from 'vitest'

// next/font/google uses the Next.js build pipeline; mock it so layout.tsx
// can be imported in a plain Vitest/Node environment.
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter', className: 'inter' }),
  Archivo: () => ({ variable: '--font-archivo', className: 'archivo' }),
  Sora: () => ({ variable: '--font-sora', className: 'sora' }),
}))

import { metadata } from '@/app/layout'

describe('appleWebApp metadata', () => {
  it('exports appleWebApp with capable=true', () => {
    expect(metadata.appleWebApp).toBeDefined()
    const apple = metadata.appleWebApp as { capable: boolean; statusBarStyle: string; title: string }
    expect(apple.capable).toBe(true)
  })

  it('sets statusBarStyle to default', () => {
    const apple = metadata.appleWebApp as { statusBarStyle: string }
    expect(apple.statusBarStyle).toBe('default')
  })

  it('sets title to TurnoGol', () => {
    const apple = metadata.appleWebApp as { title: string }
    expect(apple.title).toBe('TurnoGol')
  })

  it('preserves other metadata fields (regression guard)', () => {
    expect(metadata.applicationName).toBe('TurnoGol')
    expect(metadata.formatDetection?.telephone).toBe(false)
  })
})
