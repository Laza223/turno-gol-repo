const { withSentryConfig } = require('@sentry/nextjs')
const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === 'true' })

// 'unsafe-eval' is required by Next.js dev mode (webpack eval source maps) for
// client hydration of interactive components. Production builds do NOT use
// eval, so we keep CSP strict in prod and relax it only in dev.
const scriptSrc = process.env.NODE_ENV === 'production'
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"

// Supabase Realtime en dev apunta a ws://127.0.0.1:<port> (Supabase local), que
// el CSP de prod (*.supabase.co) bloquea — la grilla queda "Sin conexión".
// Relajamos connect-src SOLO en dev para permitir el WebSocket local; en
// producción Realtime usa wss://<proj>.supabase.co (ya cubierto) y el header
// queda estricto.
const connectSrc = process.env.NODE_ENV === 'production'
  ? "connect-src 'self' *.supabase.co *.mercadopago.com"
  : "connect-src 'self' *.supabase.co *.mercadopago.com ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*"

// CSP violation reports are POSTed to /api/csp-report. We emit both the legacy
// `report-uri` (Firefox/Safari + older Chrome) and the modern `report-to`
// (Chrome, paired with the Reporting-Endpoints header below) so coverage spans
// browsers. When both are present Chrome honours report-to; same endpoint either
// way. See src/shared/observability/csp-report.ts.
const CSP_REPORT_PATH = '/api/csp-report'

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' *.supabase.co images.unsplash.com *.tile.openstreetmap.org media.turnogol.com data: blob:",
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: { optimizePackageImports: ['lucide-react', 'date-fns'] },
  // react-leaflet v4 es ESM-only; Next necesita transpilarlo para el build.
  transpilePackages: ['react-leaflet', '@react-leaflet/core'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'media.turnogol.com' },
    ],
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

module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  hideSourceMaps: true,
  tunnelRoute: '/monitoring',
  disableLogger: true,
})
