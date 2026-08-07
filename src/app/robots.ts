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
          // Los 6 espacios del staff + las rutas que viven adentro de ellos.
          // La lista se verifica contra el árbol real de `(admin)` en
          // tests/unit/admin-routes-reachable.test.ts: una página admin nueva
          // que no quede cubierta acá rompe ese test.
          '/dashboard',
          '/grilla',
          '/reservas',
          '/caja',
          '/abonados',
          '/jugadores',
          '/torneos',
          '/analiticas',
          '/settings',
          // Rutas legacy que sólo redirigen, pero siguen siendo URLs servidas.
          '/canchas',
          '/staff',
          '/metricas',
          '/reportes',
          '/deudas',
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
