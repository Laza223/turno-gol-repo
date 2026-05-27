export const SITE_NAME = 'TurnoGol'
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

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
    ? (input.image.startsWith('http') ? input.image : absoluteUrl(input.image))
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
