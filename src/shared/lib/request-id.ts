// Non-cryptographic id for trace correlation. Edge-safe: no node built-ins, no Sentry.
export function newRequestId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/** Returns a valid request id: the incoming one if present and ≤64 chars, else a fresh one. */
export function resolveRequestId(incoming: string | null | undefined): string {
  return incoming && incoming.length > 0 && incoming.length <= 64 ? incoming : newRequestId()
}
