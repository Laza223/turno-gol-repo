import { withSentryConfig } from '@sentry/nextjs'
import bundleAnalyzer from '@next/bundle-analyzer'
import type { NextConfig } from 'next'

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

// 'unsafe-eval' is required by Next.js dev mode (webpack eval source maps) for
// client hydration of interactive components. Production builds do NOT use
// eval, so we keep CSP strict in prod and relax it only in dev.
const scriptSrc =
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"

// Supabase Realtime abre un WebSocket: en dev contra ws://127.0.0.1:<port>
// (Supabase local) y en producción contra wss://<proj>.supabase.co.
// `wss://*.supabase.co` va EXPLÍCITO en las dos ramas: un host-source pelado
// (`*.supabase.co`) sólo cubre http/https, NO habilita el esquema `wss:`, así
// que sin esa entrada Chrome bloquea el socket y la grilla del admin queda con
// el banner "Sin conexión" permanente (🔴 F-001, QA de producción 2026-08-17 —
// el comentario anterior afirmaba "ya cubierto" sin haberlo verificado).
const connectSrc =
  process.env.NODE_ENV === 'production'
    ? "connect-src 'self' *.supabase.co wss://*.supabase.co *.mercadopago.com"
    : "connect-src 'self' *.supabase.co wss://*.supabase.co *.mercadopago.com ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*"

// CSP violation reports are POSTed to /api/csp-report. We emit both the legacy
// `report-uri` (Firefox/Safari + older Chrome) and the modern `report-to`
// (Chrome, paired with the Reporting-Endpoints header below) so coverage spans
// browsers. When both are present Chrome honours report-to; same endpoint either
// way. See src/shared/observability/csp-report.ts.
const CSP_REPORT_PATH = '/api/csp-report'

// Host del bucket público de R2 (logos, portadas, fotos de canchas). Sale del
// MISMO env que usa `publicUrl()` en runtime (`R2_PUBLIC_BASE_URL`) en vez de
// una constante hardcodeada: el runbook de migración a turnogol.app cambia ese
// dominio (docs/operations/dns-turnogol-app.md), y si `remotePatterns`/`img-src`
// quedan atrás no se rompe la imagen sino la PÁGINA — `next/image` tira
// "Invalid src prop" y el throw en cliente se lleva puesto el perfil público
// entero del complejo (🔴 QA 2026-08-13). `media.turnogol.com` queda siempre en
// la lista para no depender de que la var esté seteada en tiempo de build.
function r2PublicHost(): string | null {
  const raw = process.env.R2_PUBLIC_BASE_URL
  if (!raw) return null
  try {
    return new URL(raw).hostname
  } catch {
    return null
  }
}
const MEDIA_HOSTS = [...new Set(['media.turnogol.com', r2PublicHost()].filter((h) => h !== null))]

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' *.supabase.co images.unsplash.com *.tile.openstreetmap.org ${MEDIA_HOSTS.join(' ')} data: blob:`,
      "font-src 'self'",
      connectSrc,
      "frame-src *.mercadopago.com",
      "worker-src 'self'",
      `report-uri ${CSP_REPORT_PATH}`,
      'report-to csp-endpoint',
    ].join('; '),
  },
  // Defines the `csp-endpoint` group referenced by `report-to` above.
  { key: 'Reporting-Endpoints', value: `csp-endpoint="${CSP_REPORT_PATH}"` },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

// Ya no hace falta `eslint: { ignoreDuringBuilds: true }`: Next 16 sacó `next
// lint` y la integración de ESLint en el build, así que la key no existe más en
// NextConfig. El lint sigue corriendo aparte (`pnpm lint`) y en CI.
const nextConfig: NextConfig = {
  // El indicador de devtools de Next se renderiza EN PANTALLA en `next dev`, y
  // los e2e corren contra `pnpm dev` (no contra un build). Sin apagarlo entra en
  // cada screenshot de regresión visual y ata las baselines a la versión de
  // Next: un bump de patch las invalida todas sin que cambie una línea nuestra.
  // Fuera de E2E queda como está — es útil para desarrollar.
  devIndicators: process.env.NEXT_PUBLIC_E2E === '1' ? false : undefined,
  // Sigue bajo `experimental` en Next 16 (verificado contra ExperimentalConfig en
  // next/dist/server/config-shared.d.ts), no se promovió a top-level.
  experimental: { optimizePackageImports: ['lucide-react', 'date-fns'] },
  // react-leaflet es ESM-only; Next necesita transpilarlo para el build.
  transpilePackages: ['react-leaflet', '@react-leaflet/core'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
      ...MEDIA_HOSTS.map((hostname) => ({ protocol: 'https' as const, hostname })),
    ],
  },
  // Las páginas legales viven en castellano (`/privacidad`, `/terminos`). Las
  // rutas viejas en inglés se sacaron del sitemap y del robots.ts, pero nunca se
  // redirigieron: caían al catch-all `[slug]`, que las interpretaba como slug de
  // complejo y devolvía "Complejo no encontrado" — encima con 200 (🟢 QA
  // 2026-08-14). Cualquier link o bookmark viejo queda apuntando bien.
  async redirects() {
    return [
      { source: '/privacy', destination: '/privacidad', permanent: true },
      { source: '/terms', destination: '/terminos', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // Sentry v8 sacó `hideSourceMaps`. El reemplazo es borrar los sourcemaps del
  // bundle después de subirlos: mismo efecto (no quedan expuestos en prod).
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // NO TOCAR. El `connect-src` del CSP de arriba no lista *.sentry.io: el túnel
  // es lo único que hace pasar el ingest. Si se saca o se pone en `true` (ruta
  // random), el CSP empieza a bloquear a Sentry en silencio.
  tunnelRoute: '/monitoring',
  // Reemplaza a `disableLogger`, deprecado en Sentry 10: saca los logs de debug
  // del SDK del bundle de producción.
  webpack: { treeshake: { removeDebugLogging: true } },
})
