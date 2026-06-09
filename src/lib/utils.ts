import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Builds the absolute public URL of a complex (`/c/{slug}`).
 *
 * Prefers a configured absolute `appUrl` (NEXT_PUBLIC_APP_URL). When that is
 * missing or not absolute, falls back to the browser `origin`
 * (window.location.origin). Returns `null` when no absolute base can be
 * resolved, so callers can avoid sharing/copying a useless relative link.
 */
export function buildPublicLinkUrl(
  appUrl: string | null | undefined,
  origin: string | null | undefined,
  slug: string,
): string | null {
  const isAbsolute = (v: string | null | undefined): v is string =>
    typeof v === 'string' && /^https?:\/\//i.test(v)

  const base = isAbsolute(appUrl) ? appUrl : isAbsolute(origin) ? origin : null
  if (!base) return null

  return `${base.replace(/\/$/, '')}/c/${slug}`
}
