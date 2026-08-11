/**
 * Returns `next` only if it is a safe same-origin path (starts with a single
 * `/`, not `//` or `/\`). Otherwise returns `fallback`. Guards against
 * open-redirects through the auth callback `?next` param.
 */
export function sanitizeNext(next: string | null | undefined, fallback = '/mis-reservas'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//')) return fallback
  if (next.startsWith('/\\')) return fallback
  return next
}
