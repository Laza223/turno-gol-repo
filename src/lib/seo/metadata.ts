export const SITE_NAME = 'TurnoGol'

/**
 * Origin público del sitio: `scheme://host[:port]`, sin barra final.
 *
 * Blindado a propósito. Un valor mal pegado en la env (un `\n` o espacio de
 * más al copiar-pegar en Vercel, o sin `https://`) NO debe poder tirar abajo
 * el build entero: `new URL(SITE_URL)` en `app/layout.tsx` (metadataBase) y el
 * generador de `/sitemap.xml` reventaban con `ERR_INVALID_URL` y el deploy de
 * producción fallaba completo. Ahora: trim + se antepone `https://` si falta
 * el scheme + se valida con `new URL`; si aun así es inválida, cae al fallback
 * local en vez de romper el prerender.
 */
function resolveSiteUrl(): string {
  const FALLBACK = 'http://localhost:3000'
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    FALLBACK
  ).trim()
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    // `.origin` normaliza: descarta path/query/barra final y garantiza un valor
    // que `new URL()` río abajo nunca rechaza.
    return new URL(candidate).origin
  } catch {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        `[seo] NEXT_PUBLIC_APP_URL/SITE_URL inválida (${JSON.stringify(raw)}); usando ${FALLBACK}`,
      )
    }
    return FALLBACK
  }
}

export const SITE_URL = resolveSiteUrl()

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalized}`
}

import type { Metadata } from 'next'

export const DEFAULT_OG_IMAGE = '/opengraph-image'
export const SITE_LOCALE = 'es_AR'

export type OgInput = {
  title: string
  description: string
  path: string
  image?: string
  noIndex?: boolean
  titleAbsolute?: boolean
}

export function buildMetadata(input: OgInput): Metadata {
  const url = absoluteUrl(input.path)
  const image = input.image
    ? input.image.startsWith('http')
      ? input.image
      : absoluteUrl(input.image)
    : absoluteUrl(DEFAULT_OG_IMAGE)

  return {
    title: input.titleAbsolute ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: url },
    robots: input.noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : undefined,
    openGraph: {
      type: 'website',
      url,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title: input.title,
      description: input.description,
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [image],
    },
  }
}
