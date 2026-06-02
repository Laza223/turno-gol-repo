import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  apiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  businessRule,
  serviceUnavailable,
  internal,
  validationError,
  zodFieldErrors,
  type ApiErrorBody,
} from '@/shared/api-error'
import { runWithRequestContext } from '@/shared/lib/request-context'

async function read(res: Response): Promise<ApiErrorBody> {
  return (await res.json()) as ApiErrorBody
}

describe('api-error envelope (doc15 §2.3)', () => {
  it('apiError builds nested {error:{code,message}, meta:{request_id}}', async () => {
    const res = apiError(409, 'SLOT_UNAVAILABLE', 'Turno ya tomado.')
    expect(res.status).toBe(409)
    const body = await read(res)
    expect(body.error.code).toBe('SLOT_UNAVAILABLE')
    expect(body.error.message).toBe('Turno ya tomado.')
    expect('details' in body.error).toBe(false)
    expect(body.meta).toEqual({ request_id: null })
  })

  it('includes details only when provided', async () => {
    const withDetails = await read(apiError(409, 'X', 'm', { court_id: 'abc' }))
    expect(withDetails.error.details).toEqual({ court_id: 'abc' })

    const withoutDetails = await read(apiError(409, 'X', 'm'))
    expect('details' in withoutDetails.error).toBe(false)
  })

  it('propagates request_id from the active request context', async () => {
    const res = await runWithRequestContext({ requestId: 'req-123' }, () =>
      Promise.resolve(notFound('nope')),
    )
    const body = await read(res)
    expect(body.meta.request_id).toBe('req-123')
  })
})

describe('api-error factories map to doc15 §2.5 status+code', () => {
  const cases: Array<[Response, number, string]> = [
    [badRequest('m'), 400, 'VALIDATION_ERROR'],
    [unauthorized(), 401, 'UNAUTHORIZED'],
    [forbidden(), 403, 'FORBIDDEN'],
    [notFound(), 404, 'NOT_FOUND'],
    [conflict('m'), 409, 'CONFLICT'],
    [businessRule('m'), 422, 'BUSINESS_RULE_VIOLATION'],
    [serviceUnavailable(), 503, 'SERVICE_UNAVAILABLE'],
    [internal(), 500, 'INTERNAL_ERROR'],
  ]

  it.each(cases)('status %#', async (res, status, code) => {
    expect(res.status).toBe(status)
    const body = await read(res)
    expect(body.error.code).toBe(code)
    expect(typeof body.error.message).toBe('string')
    expect(body.error.message.length).toBeGreaterThan(0)
  })

  it('allows overriding the default code', async () => {
    const body = await read(conflict('m', { code: 'SLOT_UNAVAILABLE' }))
    expect(body.error.code).toBe('SLOT_UNAVAILABLE')
  })

  it('allows attaching details via opts', async () => {
    const body = await read(forbidden('m', { details: { plan: 'predio' } }))
    expect(body.error.details).toEqual({ plan: 'predio' })
  })
})

describe('validationError (doc15 §2.4)', () => {
  const schema = z.object({
    time_start: z.string().min(1, 'La hora de inicio es obligatoria.'),
    date: z.string().min(1, 'La fecha es obligatoria.'),
  })

  it('formats Zod issues into details.fields and defaults to 400', async () => {
    const parsed = schema.safeParse({ time_start: '', date: '' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const res = validationError(parsed.error)
    expect(res.status).toBe(400)
    const body = await read(res)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual({
      fields: {
        time_start: 'La hora de inicio es obligatoria.',
        date: 'La fecha es obligatoria.',
      },
    })
    // message defaults to the first issue message
    expect(body.error.message).toBe('La hora de inicio es obligatoria.')
  })

  it('honours a status override (e.g. 422 for admin body validation)', async () => {
    const parsed = schema.safeParse({ time_start: '', date: 'x' })
    if (parsed.success) return
    const res = validationError(parsed.error, { status: 422 })
    expect(res.status).toBe(422)
  })

  it('accepts a plain string message', async () => {
    const res = validationError('Datos inválidos.')
    expect(res.status).toBe(400)
    const body = await read(res)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('Datos inválidos.')
    expect('details' in body.error).toBe(false)
  })

  it('zodFieldErrors keeps the first message per field path', () => {
    const parsed = z
      .object({ a: z.string().min(3, 'a-min'), b: z.number() })
      .safeParse({ a: 'x', b: 'nan' })
    if (parsed.success) throw new Error('expected failure')
    const fields = zodFieldErrors(parsed.error)
    expect(fields.a).toBe('a-min')
    expect(typeof fields.b).toBe('string')
  })
})
