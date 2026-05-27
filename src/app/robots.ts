import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo/metadata'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/explorar', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/admin/',
          '/super-admin/',
          '/player/',
          '/login',
          '/register',
          '/onboarding',
          '/monitoring',
          '/auth/',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/').replace(/\/$/, ''),
  }
}
