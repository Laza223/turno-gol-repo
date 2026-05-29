// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

// Capture the callback passed to useReportWebVitals so tests can invoke it directly.
let capturedCb: ((metric: unknown) => void) | undefined

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: (cb: (metric: unknown) => void) => {
    capturedCb = cb
  },
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}))

// Import mocks AFTER vi.mock calls.
import * as Sentry from '@sentry/nextjs'
import { WebVitalsReporter } from '@/components/perf/WebVitalsReporter'

const mockCaptureMessage = vi.mocked(Sentry.captureMessage)

const sampleMetric = {
  name: 'LCP',
  value: 1800,
  delta: 1800,
  id: 'v1',
  navigationType: 'navigate',
  rating: 'good',
}

beforeEach(() => {
  capturedCb = undefined
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('WebVitalsReporter', () => {
  it('does not call Sentry when NODE_ENV is development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.spyOn(Math, 'random').mockReturnValue(0.1)

    render(<WebVitalsReporter />)
    expect(capturedCb).toBeDefined()
    capturedCb!(sampleMetric)

    expect(mockCaptureMessage).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('does not call Sentry when in production but random > 0.25 (sample miss)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    render(<WebVitalsReporter />)
    expect(capturedCb).toBeDefined()
    capturedCb!(sampleMetric)

    expect(mockCaptureMessage).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('calls Sentry.captureMessage with correct args when in production and random <= 0.25 (sample hit)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.spyOn(Math, 'random').mockReturnValue(0.1)

    render(<WebVitalsReporter />)
    expect(capturedCb).toBeDefined()
    capturedCb!(sampleMetric)

    expect(mockCaptureMessage).toHaveBeenCalledOnce()
    expect(mockCaptureMessage).toHaveBeenCalledWith('web-vital:LCP', {
      level: 'info',
      tags: { metric: 'LCP', rating: 'good' },
      extra: {
        value: 1800,
        delta: 1800,
        id: 'v1',
        navigationType: 'navigate',
      },
    })

    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
})
