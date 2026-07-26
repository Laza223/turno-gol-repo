import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo/metadata'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // Las páginas legales viven en `/privacidad` y `/terminos` (castellano);
        // `/privacy` y `/terms` no existen.
        allow: ['/', '/explorar', '/privacidad', '/terminos'],
        disallow: [
          '/api/',
          // Panel del complejo. `(admin)` es un route GROUP: no aparece en la
          // URL, así que `/admin/` no bloqueaba nada y estas rutas quedaban
          // sin declarar. Requieren sesión y redirigen a /login, así que no
          // había fuga — pero sí ruido de rastreo.
          '/dashboard',
          '/grilla',
          '/reservas',
          '/caja',
          '/abonados',
          '/jugadores',
          '/analiticas',
          '/settings',
          '/select-tenant',
          // Área del jugador. `(player)` también es route group.
          '/mis-reservas',
          '/perfil',
          '/configuracion',
          '/eliminar-cuenta',
          '/reserva/',
          '/super-admin/',
          '/ingresar',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/verify',
          '/onboarding',
          '/monitoring',
          // No va `/auth/`: `(auth)` también es route group y el callback vive
          // en `/api/auth/...`, ya cubierto por la regla `/api/` de arriba.
          '/mock-mp',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
