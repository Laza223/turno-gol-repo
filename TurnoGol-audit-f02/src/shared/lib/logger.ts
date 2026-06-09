import { getRequestContext } from './request-context'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogMeta = Record<string, unknown>

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  const ctx = getRequestContext()
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(ctx?.requestId ? { request_id: ctx.requestId } : {}),
    ...(ctx?.tenantId ? { tenant_id: ctx.tenantId } : {}),
    ...(ctx?.userId ? { user_id: ctx.userId } : {}),
    ...(ctx?.userType ? { user_type: ctx.userType } : {}),
    ...(meta ?? {}),
  }
  const line = JSON.stringify(entry)
  if (level === 'error') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

export const logger = {
  debug: (msg: string, meta?: LogMeta) => emit('debug', msg, meta),
  info: (msg: string, meta?: LogMeta) => emit('info', msg, meta),
  warn: (msg: string, meta?: LogMeta) => emit('warn', msg, meta),
  error: (msg: string, meta?: LogMeta) => emit('error', msg, meta),
}
