import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { validateApiOutput, validatedJson } from '@/shared/api-output'
import { logger } from '@/shared/lib/logger'

const schema = z.strictObject({
  data: z.strictObject({ id: z.string(), n: z.number() }),
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('validateApiOutput', () => {
  it('does not warn when the payload matches the contract', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    validateApiOutput(schema, { data: { id: 'a', n: 1 } }, 'GET /x')
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns (never throws) when the payload drifts from the contract', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    expect(() =>
      validateApiOutput(schema, { data: { id: 'a', n: 'not-a-number' } }, 'GET /x'),
    ).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toBe('api.output.contract_mismatch')
    const meta = warn.mock.calls[0]![1] as {
      route: string
      issues: Array<{ path: string }>
    }
    expect(meta.route).toBe('GET /x')
    expect(meta.issues.some((i) => i.path === 'data.n')).toBe(true)
  })

  it('flags unexpected extra fields (strict schemas catch additive drift)', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    validateApiOutput(schema, { data: { id: 'a', n: 1, extra: true } }, 'GET /x')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('validates the serialized shape — a Date field is an ISO string over the wire', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const dateSchema = z.strictObject({ when: z.string() })
    // In memory `when` is a Date; serialized it is an ISO string, which is what
    // the client receives. The helper round-trips through JSON, so z.string() is
    // the correct contract and this must NOT warn.
    validateApiOutput(dateSchema, { when: new Date('2026-06-01T00:00:00.000Z') }, 'GET /x')
    expect(warn).not.toHaveBeenCalled()
  })

  it('is a no-op in production: never validates, never warns', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')
    validateApiOutput(schema, { data: { id: 'a', n: 'wrong-type' } }, 'GET /x')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('validatedJson', () => {
  it('returns a NextResponse carrying the payload and honours init (status)', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const res = validatedJson(schema, { data: { id: 'a', n: 1 } }, 'POST /x', { status: 201 })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: 'a', n: 1 } })
    expect(warn).not.toHaveBeenCalled()
  })

  it('still sends the response (and warns) on a contract mismatch', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const res = validatedJson(schema, { data: { id: 'a', n: 'wrong' } }, 'POST /x')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { id: 'a', n: 'wrong' } })
    expect(warn).toHaveBeenCalledOnce()
  })
})
