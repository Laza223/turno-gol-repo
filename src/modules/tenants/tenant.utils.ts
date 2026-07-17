/**
 * Segmentos de primer nivel del App Router (los route groups no aportan path,
 * así que sus hijos también son top-level). Un tenant con uno de estos slugs
 * quedaría shadowed: Next resuelve la ruta estática antes que (public)/[slug]
 * y su página pública sería inalcanzable. Mantener en sync al agregar rutas
 * top-level en src/app. Incluye `c` por el prefijo de link público /c/{slug}.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // raíz
  'api',
  'home',
  'mock-mp',
  'onboarding',
  'reserva',
  'select-tenant',
  'icon-192',
  'icon-512',
  'icon-512-maskable',
  // (admin)
  'abonados',
  'actions',
  'caja',
  'canchas',
  'dashboard',
  'grilla',
  'jugadores',
  'metricas',
  'reportes',
  'reservas',
  'settings',
  'staff',
  // (auth)
  'forgot-password',
  'ingresar',
  'login',
  'register',
  'reset-password',
  'verify',
  // (business)
  'alternativas-alquila-tu-cancha',
  'blog',
  'para-complejos',
  'precios',
  'vs',
  // (player)
  'configuracion',
  'eliminar-cuenta',
  'mis-reservas',
  'perfil',
  // (public)
  'explorar',
  'privacidad',
  'suspended',
  'terminos',
  // (super-admin)
  'super-admin',
  // prefijo de link público
  'c',
])

export function generateSlug(name: string): string {
  const result = name
    .normalize('NFD')
    .replace(/̀-ͯ/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return result || 'complejo'
}
