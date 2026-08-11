import { describe, expect, it } from 'vitest'
import { filterReplay } from '@/../instrumentation-client'

describe('filterReplay', () => {
  it('removes the Replay integration and keeps the rest', () => {
    const input = [{ name: 'Replay' }, { name: 'BrowserTracing' }, { name: 'GlobalHandlers' }]
    const result = filterReplay(input)
    expect(result.some((i) => i.name === 'Replay')).toBe(false)
    expect(result).toContainEqual({ name: 'BrowserTracing' })
    expect(result).toContainEqual({ name: 'GlobalHandlers' })
    expect(result).toHaveLength(2)
  })

  it('also removes ReplayIntegration (alternate name used by some Sentry 7.x builds)', () => {
    const input = [{ name: 'ReplayIntegration' }, { name: 'Replay' }, { name: 'BrowserTracing' }]
    const result = filterReplay(input)
    expect(result.some((i) => i.name === 'Replay')).toBe(false)
    expect(result.some((i) => i.name === 'ReplayIntegration')).toBe(false)
    expect(result).toContainEqual({ name: 'BrowserTracing' })
    expect(result).toHaveLength(1)
  })
})
