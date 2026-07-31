import type { OpeningHours, OpeningHoursDay, TenantRow, TenantSettings } from '@/modules/tenants/tenant.types'
import { daysFromNow } from './clock'
import { uid } from './ids'

/**
 * `search.service.ts` (server-only, `.service.ts`) no es importable acá ni en
 * stories (regla `no-restricted-imports`) — ni siquiera como `import type`,
 * el patrón `@/modules/*\/*.service` bloquea el módulo entero. Mismo caso que
 * `StaffMember` en `staff.ts`: shape a mano en base a `PublicTenantCard`/
 * `CityCount` (search.service.ts).
 */
export type PublicTenantCardFixture = {
  id: string
  slug: string
  name: string
  address: string
  city: string
  province: string
  logoUrl: string | null
  coverUrl: string | null
  allowOnlineBooking: boolean
  fromPriceCents: number | null
  amenities: Record<string, boolean>
  avgRating: number
  reviewCount: number
  distanceKm: number | null
  latitude: number | null
  longitude: number | null
  courtSurfaces: string[]
  courtFormats: number[]
}

const day = (open: string, close: string, closed = false): OpeningHoursDay => ({ open, close, closed })

/** Horario típico: todos los días, cierra un poco más tarde el fin de semana. */
export const openingHours = (overrides: Partial<OpeningHours> = {}): OpeningHours => ({
  mon: day('09:00', '23:00'),
  tue: day('09:00', '23:00'),
  wed: day('09:00', '23:00'),
  thu: day('09:00', '23:00'),
  fri: day('09:00', '24:00'),
  sat: day('09:00', '24:00'),
  sun: day('09:00', '22:00'),
  ...overrides,
})

/** Complejo que cierra pasada la medianoche los viernes y sábados (día operativo). */
export const openingHoursClosesNextDay = (): OpeningHours =>
  openingHours({
    fri: day('09:00', '02:00'),
    sat: day('09:00', '02:00'),
  })

export const tenantSettings = (overrides: Partial<TenantSettings> = {}): TenantSettings => ({
  requires_deposit: true,
  deposit_percentage: 30,
  cancellation_policy: {
    hours_before: 12,
    penalty_type: 'deposit',
    penalty_amount: null,
  },
  accepts_cash: true,
  accepts_transfer: true,
  accepts_mercadopago: true,
  allow_online_booking: true,
  booking_advance_days: 6,
  auto_complete_minutes: 90,
  onboarding_step: 4,
  onboarding_completed: true,
  public_link_shared: true,
  // canteen_products (JSONB) eliminado: la cantina vive en canteen_products
  // (tabla, migr. 048) — fixtures en src/test/fixtures/canteen.ts.
  ...overrides,
})

export const tenant = (overrides: Partial<TenantRow> = {}): TenantRow => ({
  id: uid(1),
  slug: 'complejo-fenix',
  name: 'Complejo Fénix',
  description: 'Predio de fútbol 5 y 7 con parrilla, buffet y estacionamiento propio.',
  logoUrl: null,
  coverUrl: null,
  address: 'Av. Rivadavia 4820',
  city: 'Ciudad Autónoma de Buenos Aires',
  province: 'CABA',
  phone: '+54 11 4567-8900',
  email: 'contacto@complejofenix.com.ar',
  status: 'active',
  trialEndsAt: null,
  settings: tenantSettings(),
  openingHours: openingHours(),
  closedDates: [],
  closesNextDay: false,
  mpConnectedAt: daysFromNow(-180),
  mpNickname: 'COMPLEJOFENIX',
  ...overrides,
})

/** Complejo en trial, todavía sin conectar MercadoPago (onboarding a medio hacer). */
export const tenantTrialing = (): TenantRow =>
  tenant({
    id: uid(2),
    slug: 'canchas-del-sur',
    name: 'Canchas del Sur',
    status: 'trialing',
    trialEndsAt: daysFromNow(9),
    mpConnectedAt: null,
    mpNickname: null,
    settings: tenantSettings({
      onboarding_step: 2,
      onboarding_completed: false,
      public_link_shared: false,
    }),
  })

/** Complejo que cierra la madrugada de viernes/sábado (día operativo, closes_next_day). */
export const tenantClosesNextDay = (): TenantRow =>
  tenant({
    id: uid(3),
    slug: 'la-bombonerita',
    name: 'La Bombonerita Fútbol Club',
    openingHours: openingHoursClosesNextDay(),
    closesNextDay: true,
  })

/** Complejo con la suscripción SaaS vencida (para stories de estados bloqueados). */
export const tenantPastDue = (): TenantRow =>
  tenant({
    id: uid(4),
    slug: 'polideportivo-belgrano',
    name: 'Polideportivo Belgrano',
    status: 'past_due',
  })

/** Segundo complejo de uso general (para listados/grillas con más de uno). */
export const tenantAlt = (): TenantRow =>
  tenant({
    id: uid(6),
    slug: 'club-atenas',
    name: 'Club Atenas',
    address: 'Av. San Martín 890',
    city: 'Vicente López',
    province: 'Buenos Aires',
    phone: '+54 11 4795-6600',
    email: 'contacto@clubatenas.com.ar',
  })

// ─── PublicTenantCard (search.service.ts) — landing pública / búsqueda ────────

/** Card destacada default: rating alto, con foto, reserva online, seña visible. */
export const publicTenantCard = (
  overrides: Partial<PublicTenantCardFixture> = {},
): PublicTenantCardFixture => ({
  id: uid(1),
  slug: 'complejo-fenix',
  name: 'Complejo Fénix',
  address: 'Av. Rivadavia 4820',
  city: 'Ciudad Autónoma de Buenos Aires',
  province: 'CABA',
  logoUrl: null,
  coverUrl: null,
  allowOnlineBooking: true,
  fromPriceCents: 900000,
  amenities: { techado: true, iluminacion: true, estacionamiento: true, duchas: true },
  avgRating: 4.8,
  reviewCount: 62,
  distanceKm: 1.2,
  latitude: -34.6091,
  longitude: -58.4416,
  courtSurfaces: ['synthetic_grass'],
  courtFormats: [5, 7],
  ...overrides,
})

/** Complejo recién sumado: sin reseñas todavía (RatingStars sin contador). */
export const publicTenantCardSinResenas = (): PublicTenantCardFixture =>
  publicTenantCard({
    id: uid(2),
    slug: 'canchas-del-sur',
    name: 'Canchas del Sur',
    address: 'Av. Directorio 2140',
    city: 'Ciudad Autónoma de Buenos Aires',
    province: 'CABA',
    avgRating: 0,
    reviewCount: 0,
    distanceKm: 3.4,
    amenities: {},
  })

/** Complejo sin reserva online (solo aparece en el listado, sin badge ni CTA directo). */
export const publicTenantCardSinReservaOnline = (): PublicTenantCardFixture =>
  publicTenantCard({
    id: uid(3),
    slug: 'la-bombonerita',
    name: 'La Bombonerita Fútbol Club',
    address: 'Av. Boedo 1780',
    allowOnlineBooking: false,
    fromPriceCents: null,
    distanceKm: null,
  })

/** Seis complejos destacados (tope real de `searchPublicTenants({ sort: 'rating', limit: 6 })`). */
export const publicTenantCards = (): PublicTenantCardFixture[] => [
  publicTenantCard(),
  publicTenantCard({
    id: uid(4),
    slug: 'polideportivo-belgrano',
    name: 'Polideportivo Belgrano',
    address: 'Av. Cabildo 3050',
    avgRating: 4.6,
    reviewCount: 38,
    distanceKm: 2.1,
    fromPriceCents: 1100000,
    amenities: { estacionamiento: true, bar: true },
  }),
  publicTenantCard({
    id: uid(5),
    slug: 'la-catedral-f5',
    name: 'La Catedral F5',
    address: 'Honduras 5147, Palermo',
    avgRating: 4.9,
    reviewCount: 145,
    distanceKm: 0.8,
    fromPriceCents: 800000,
    amenities: { techado: true, iluminacion: true, wifi: true },
  }),
  publicTenantCardSinResenas(),
  publicTenantCard({
    id: uid(6),
    slug: 'club-atenas',
    name: 'Club Atenas',
    address: 'Av. San Martín 890',
    city: 'Vicente López',
    province: 'Buenos Aires',
    avgRating: 4.3,
    reviewCount: 19,
    distanceKm: 8.7,
    fromPriceCents: 750000,
    amenities: { parrilla: true, estacionamiento: true },
  }),
  publicTenantCardSinReservaOnline(),
]

/** Ciudades con al menos un complejo visible públicamente (buscador del hero). */
export type CityCountFixture = { city: string; province: string; count: number }

export const cityCounts = (): CityCountFixture[] => [
  { city: 'Ciudad Autónoma de Buenos Aires', province: 'CABA', count: 34 },
  { city: 'Vicente López', province: 'Buenos Aires', count: 6 },
  { city: 'La Plata', province: 'Buenos Aires', count: 9 },
  { city: 'Córdoba', province: 'Córdoba', count: 11 },
]

// ─── StaffTenantRow (auth.service.ts) — /select-tenant ────────────────────────

/**
 * `auth.service.ts` (server-only) no es importable acá — mismo caso que
 * `PublicTenantCardFixture`: shape a mano en base a `StaffTenantRow`.
 */
export type StaffTenantRowFixture = {
  tenantId: string
  tenantName: string
  tenantSlug: string
  role: string
}

export const staffTenantRow = (overrides: Partial<StaffTenantRowFixture> = {}): StaffTenantRowFixture => ({
  tenantId: uid(1),
  tenantName: 'Complejo Fénix',
  tenantSlug: 'complejo-fenix',
  role: 'admin',
  ...overrides,
})

/** Staff con acceso a 3 complejos (el caso real que justifica la página: N>1). */
export const staffTenantRows = (): StaffTenantRowFixture[] => [
  staffTenantRow(),
  staffTenantRow({
    tenantId: uid(2),
    tenantName: 'Canchas del Sur',
    tenantSlug: 'canchas-del-sur',
    role: 'manager',
  }),
  staffTenantRow({
    tenantId: uid(4),
    tenantName: 'Polideportivo Belgrano',
    tenantSlug: 'polideportivo-belgrano',
    role: 'admin',
  }),
]
