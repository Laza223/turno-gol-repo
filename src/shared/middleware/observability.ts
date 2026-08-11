import * as Sentry from '@sentry/nextjs'
import {
  runWithRequestContext,
  updateRequestContext,
  type RequestContext,
} from '@/shared/lib/request-context'
import { resolveRequestId } from '@/shared/lib/request-id'

/**
 * Wrap a node route handler so logger/Sentry get request_id + context.
 *
 * B5 (2026-08-09): esta función existía desde siempre y NO LA LLAMABA NADIE, y
 * es la única que puebla el AsyncLocalStorage de `request-context`. O sea que
 * los dos lectores que sí están vivos leían un store vacío: `logger.ts` emitía
 * cada línea sin requestId/tenantId/userId, y `api-error.ts` respondía
 * `{"request_id": null}` en TODOS los errores de API. `tagSession` tampoco
 * hacía nada útil (`updateRequestContext` no-opea sin store activo). Cableada
 * en los 4 wrappers de route handler: withTenant, withBillingTenant,
 * withPlayer y withAuth.
 */
export function runRequestObservability<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  const requestId = resolveRequestId(req.headers.get('x-request-id'))
  const ctx: RequestContext = { requestId }
  return runWithRequestContext(ctx, async () => {
    Sentry.setTag('request_id', requestId)
    return fn()
  })
}

/** Attach tenant/user identity to the active request context + Sentry scope. Safe to call with no active context (updateRequestContext no-ops). */
export function tagSession(
  tenantId?: string | null,
  userId?: string | null,
  userType?: RequestContext['userType'],
): void {
  updateRequestContext({
    ...(tenantId ? { tenantId } : {}),
    ...(userId ? { userId } : {}),
    ...(userType ? { userType } : {}),
  })
  if (tenantId) Sentry.setTag('tenant_id', tenantId)
  if (userId) Sentry.setTag('user_id', userId)
  if (userType) Sentry.setTag('user_type', userType)
}
