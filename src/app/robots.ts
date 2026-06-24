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
          '/ingresar',
          '/login',
          '/register',
          '/onboarding',
          '/monitoring',
          '/auth/',
          '/mock-mp',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
