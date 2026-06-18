import { beforeEach, describe, expect, it, vi } from 'vitest'

// CSP violation reports POSTed by browsers must surface in Sentry (level
// warning) so a misconfigured policy is caught, without (a) trusting the
// unauthenticated body, (b) flooding Sentry when a broken directive fires on
// every page load, or (c) letting an oversized payload through.
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))

import { captureMessage } from '@/lib/sentry'
import {
  handleCspReport,
  __resetCspReportDedupeForTests,
} from '@/shared/observability/csp-report'

const mockCapture = vi.mocked(captureMessage)

function legacyReport(overrides: Record<string, unknown> = {}): Request {
  const body = {
    'csp-report': {
      'document-uri': 'https://app.turnogol.app/grilla',
      'violated-directive': 'script-src',
      'effective-directive': 'script-src',
      'blocked-uri': 'https://evil.example/x.js',
      'original-policy': "default-src 'self'",
      ...overrides,
    },
  }
  return new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body: JSON.stringify(body),
  })
}

function modernReport(reports: unknown[]): Request {
  return new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/reports+json' },
    body: JSON.stringify(reports),
  })
}

beforeEach(() => {
  __resetCspReportDedupeForTests()
  vi.clearAllMocks()
})

describe('handleCspReport', () => {
  it('logs a Sentry warning naming the directive and blocked URI (legacy report-uri)', async () => {
    const res = await handleCspReport(legacyReport())

    expect(res.status).toBe(204)
    expect(mockCapture).toHaveBeenCalledTimes(1)
    const [msg, ctx] = mockCapture.mock.calls[0]!
    expect(String(msg)).toContain('script-src')
    expect(String(msg)).toContain('https://evil.example/x.js')
    const context = ctx as { level?: string; extra?: Record<string, unknown> }
    expect(context.level).toBe('warning')
    expect(context.extra?.blockedUri).toBe('https://evil.example/x.js')
    expect(context.extra?.documentUri).toBe('https://app.turnogol.app/grilla')
    expect(context.extra?.violatedDirective).toBe('script-src')
  })

  it('logs a warning for the modern Reporting API format (application/reports+json)', async () => {
    const res = await handleCspReport(
      modernReport([
        {
          type: 'csp-violation',
          url: 'https://app.turnogol.app/caja',
          body: {
            documentURL: 'https://app.turnogol.app/caja',
            effectiveDirective: 'img-src',
            violatedDirective: 'img-src',
            blockedURL: 'https://tracker.example/p.gif',
            originalPolicy: "default-src 'self'",
          },
        },
      ]),
    )

    expect(res.status).toBe(204)
    expect(mockCapture).toHaveBeenCalledTimes(1)
    const [msg, ctx] = mockCapture.mock.calls[0]!
    expect(String(msg)).toContain('img-src')
    const context = ctx as { extra?: Record<string, unknown> }
    expect(context.extra?.blockedUri).toBe('https://tracker.example/p.gif')
  })

  it('ignores non-CSP report types in the modern array', async () => {
    const res = await handleCspReport(
      modernReport([
        { type: 'deprecation', url: 'x', body: { id: 'foo' } },
        { type: 'network-error', url: 'y', body: {} },
      ]),
    )

    expect(res.status).toBe(204)
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('deduplicates identical violations within the cooldown (no Sentry flood)', async () => {
    await handleCspReport(legacyReport())
    await handleCspReport(legacyReport())
    await handleCspReport(legacyReport())

    expect(mockCapture).toHaveBeenCalledTimes(1)
  })

  it('treats distinct violations as separate events', async () => {
    await handleCspReport(legacyReport({ 'blocked-uri': 'https://a.example/1.js' }))
    await handleCspReport(legacyReport({ 'blocked-uri': 'https://b.example/2.js' }))

    expect(mockCapture).toHaveBeenCalledTimes(2)
  })

  it('returns 204 and does not capture on invalid JSON', async () => {
    const req = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: '{not json',
    })

    const res = await handleCspReport(req)

    expect(res.status).toBe(204)
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('returns 204 and does not capture on an empty body', async () => {
    const req = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: '',
    })

    const res = await handleCspReport(req)

    expect(res.status).toBe(204)
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('rejects an oversized payload without logging', async () => {
    const huge = 'https://evil.example/' + 'a'.repeat(20_000)
    const res = await handleCspReport(legacyReport({ 'blocked-uri': huge }))

    expect(res.status).toBe(204)
    expect(mockCapture).not.toHaveBeenCalled()
  })
})
