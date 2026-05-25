import * as Sentry from '@sentry/nextjs'
import { runWithRequestContext, updateRequestContext, type RequestContext } from '@/shared/lib/request-context'
import { resolveRequestId } from '@/shared/lib/request-id'

/** Wrap a node route handler so logger/Sentry get request_id + context. */
export function runRequestObservability<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  const requestId = resolveRequestId(req.headers.get('x-request-id'))
  const ctx: RequestContext = { requestId }
  return runWithRequestContext(ctx, async () => {
    Sentry.setTag('request_id', requestId)
    return fn()
  })
}

/** Attach tenant/user identity to the active request context + Sentry scope. Safe to call with no active context (updateRequestContext no-ops). */
export function tagSession(tenantId?: string | null, userId?: string | null, userType?: RequestContext['userType']): void {
  updateRequestContext({
    ...(tenantId ? { tenantId } : {}),
    ...(userId ? { userId } : {}),
    ...(userType ? { userType } : {}),
  })
  if (tenantId) Sentry.setTag('tenant_id', tenantId)
  if (userId) Sentry.setTag('user_id', userId)
  if (userType) Sentry.setTag('user_type', userType)
}
