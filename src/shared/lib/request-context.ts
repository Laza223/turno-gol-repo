import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestContext = {
  requestId: string
  tenantId?: string
  userId?: string
  userType?: 'staff' | 'player' | 'system_admin' | 'system'
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

export function updateRequestContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore()
  if (current) Object.assign(current, patch)
}
