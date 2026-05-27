export const SITE_NAME = 'TurnoGol'
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export function absoluteUrl(path: string): string {
  if (!path.startsWith('/')) path = `/${path}`
  return `${SITE_URL}${path}`
}
