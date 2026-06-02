import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { logger } from '@/shared/lib/logger'

/**
 * Output (response) contract validation for Route Handlers — doc15 §2.
 *
 * This is a DEV/TEST safety net, never a production gate:
 *   - In production it is a zero-cost no-op. The payload is sent unchanged and the
 *     schema is never evaluated, so there is no per-request overhead and a schema
 *     bug can never break a real response.
 *   - In dev/test it validates the *serialized* response — `JSON.parse(JSON.stringify(payload))`,
 *     i.e. exactly the shape the client receives (Date → ISO string, `undefined`
 *     keys dropped) — against `schema` and logs a `warn` when the response drifts
 *     from its declared contract.
 *
 * It NEVER throws: a contract regression must surface in logs/CI, not turn a
 * successful operation into a 500. Pair it with `validatedJson` to validate and
 * build the response in a single call.
 */
export function validateApiOutput(schema: ZodType, payload: unknown, route: string): void {
  // Read NODE_ENV per call: zero meaningful overhead, and it keeps the prod
  // no-op behaviour observable in tests.
  if (process.env.NODE_ENV === 'production') return

  let wire: unknown
  try {
    wire = JSON.parse(JSON.stringify(payload))
  } catch {
    // A non-serializable payload (circular ref, BigInt, …) is itself a contract
    // problem worth surfacing — but never fatal.
    logger.warn('api.output.unserializable', { route })
    return
  }

  const result = schema.safeParse(wire)
  if (!result.success) {
    logger.warn('api.output.contract_mismatch', {
      route,
      issues: result.error.issues.slice(0, 10).map((i) => ({
        path: i.path.join('.') || '_',
        code: i.code,
        message: i.message,
      })),
    })
  }
}

/**
 * Validate the response against its doc15 output contract and build the JSON
 * response in one call. Equivalent to `validateApiOutput(schema, payload, route)`
 * followed by `NextResponse.json(payload, init)`.
 */
export function validatedJson(
  schema: ZodType,
  payload: unknown,
  route: string,
  init?: ResponseInit,
): NextResponse {
  validateApiOutput(schema, payload, route)
  return NextResponse.json(payload, init)
}
