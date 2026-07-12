import { artDateString, daysFromNow } from './clock'
import { uid } from './ids'
import { openingHours } from './tenant'

/**
 * Fixtures del perfil público del complejo + checkout (`public.service.ts`,
 * `availability-search.service.ts`). Esos módulos son `*.service.ts` — el
 * `no-restricted-imports` de `src/test/**\/*.ts` bloquea el patrón
 * `@/modules/*\/*.service` incluso como `import type` (arrastra DB
 * transitivamente); los tipos van a mano acá, igual que `PublicTenantCardFixture`
 * en `tenant.ts`.
 *
 * Los fixtures de PublicTenantCard/CityCount (`/explorar`, home) viven en
 * `tenant.ts` — acá solo se RE-EXPORTAN bajo los nombres que consumen las
 * stories fuera de esta área (`FeaturedComplexCard`, `HeroSearch`), sin
 * declarar una segunda vez el mismo shape (rompería el barrel: dos exports
 * distintos con igual nombre en `index.ts`).
 *
 * Fotos: assets locales de `public/` (mismo origen, sin red externa —
 * determinismo de build, ver `.storybook/main.ts`), NUNCA unsplash/CDN.
 */

const LOCAL_PHOTOS = ['/bg-hero.png', '/bg-hero-2.png', '/bg-owner.png', '/bg-how-it-works.png']

// ─── Perfil público del complejo (public.service.ts#PublicTenant) ─────────────

export type PublicTenantFixture = {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string | null
  coverUrl: string | null
  address: string
  city: string
  province: string
  phone: string
  whatsapp: string | null
  openingHours: ReturnType<typeof openingHours>
  closedDates: string[]
  closesNextDay: boolean
  status: string
  timezone: string
  allowOnlineBooking: boolean
  requiresDeposit: boolean
  depositPercentage: number
  acceptsCash: boolean
  acceptsTransfer: boolean
  bookingAdvanceDays: number
  amenities: Record<string, boolean>
  latitude: number | null
  longitude: number | null
}

export const publicTenant = (overrides: Partial<PublicTenantFixture> = {}): PublicTenantFixture => ({
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
  whatsapp: '+54 9 11 4567-8900',
  openingHours: openingHours(),
  closedDates: [],
  closesNextDay: false,
  status: 'active',
  timezone: 'America/Argentina/Buenos_Aires',
  allowOnlineBooking: true,
  requiresDeposit: true,
  depositPercentage: 30,
  acceptsCash: true,
  acceptsTransfer: true,
  bookingAdvanceDays: 6,
  amenities: {
    techado: true,
    estacionamiento: true,
    duchas: true,
    vestuario: true,
    parrilla: true,
    wifi: false,
    bar: false,
    iluminacion: true,
  },
  latitude: -34.6091,
  longitude: -58.4416,
  ...overrides,
})

/** Sin seña, sin WhatsApp, sin amenities — el caso "recién onboardeado". */
export const publicTenantMinimal = (): PublicTenantFixture =>
  publicTenant({
    id: uid(2),
    slug: 'canchas-del-sur',
    name: 'Canchas del Sur',
    description: null,
    whatsapp: null,
    requiresDeposit: false,
    depositPercentage: 0,
    amenities: {},
    latitude: null,
    longitude: null,
  })

/** No acepta reservas online: la grilla muestra "Contactar por tel" en vez de "Reservar". */
export const publicTenantNoOnlineBooking = (): PublicTenantFixture =>
  publicTenant({
    id: uid(3),
    slug: 'polideportivo-belgrano',
    name: 'Polideportivo Belgrano',
    allowOnlineBooking: false,
  })

// ─── Canchas del perfil (public.service.ts#PublicCourtCard) ───────────────────

export type PublicCourtCardFixture = {
  id: string
  name: string
  surfaceType: string
  isCovered: boolean
  hasLighting: boolean
  format: number
  capacity: number
  photos: string[]
  fromPriceCents: number | null
}

export const publicCourtCard = (
  overrides: Partial<PublicCourtCardFixture> = {},
): PublicCourtCardFixture => ({
  id: uid(101),
  name: 'Cancha 1',
  surfaceType: 'synthetic_grass',
  isCovered: false,
  hasLighting: true,
  format: 5,
  capacity: 10,
  photos: [LOCAL_PHOTOS[0]!],
  fromPriceCents: 1500000,
  ...overrides,
})

export const publicCourtCardNoPhoto = (): PublicCourtCardFixture =>
  publicCourtCard({ id: uid(102), name: 'Cancha 2', photos: [], format: 7, capacity: 14 })

export const publicCourtCardNoPrice = (): PublicCourtCardFixture =>
  publicCourtCard({
    id: uid(103),
    name: 'Cancha 3 - Fútbol 11',
    surfaceType: 'natural_grass',
    hasLighting: false,
    format: 11,
    capacity: 22,
    photos: [],
    fromPriceCents: null,
  })

export const publicCourtCards = (): PublicCourtCardFixture[] => [
  publicCourtCard(),
  publicCourtCardNoPhoto(),
  publicCourtCardNoPrice(),
]

// ─── Slots / disponibilidad (public.service.ts#Slot/AvailabilityResponse) ─────

export type SlotStatusFixture = 'free' | 'occupied' | 'fixed' | 'blocked' | 'past'

export type SlotFixture = {
  time: string
  duration: number
  status: SlotStatusFixture
  price: number | null
}

export const slot = (overrides: Partial<SlotFixture> = {}): SlotFixture => ({
  time: '18:00',
  duration: 60,
  status: 'free',
  price: 1500000,
  ...overrides,
})

/** Hoy en ART (FROZEN_NOW), formato YYYY-MM-DD — coincide con el "hoy" que calcula AvailabilityGrid. */
export const todayArt = (): string => artDateString()

type PublicCourtSlotsFixture = {
  id: string
  name: string
  surfaceType: string
  isCovered: boolean
  hasLighting: boolean
  slots: SlotFixture[]
}

export type AvailabilityResponseFixture = { date: string; courts: PublicCourtSlotsFixture[] }

/** Una fila de horas con las 5 variantes de status + un hueco sin precio configurado. */
function sampleSlots(): SlotFixture[] {
  return [
    slot({ time: '09:00', status: 'past', price: 900000 }),
    slot({ time: '10:00', status: 'free', price: 900000 }),
    slot({ time: '11:00', status: 'occupied', price: 900000 }),
    slot({ time: '18:00', status: 'fixed', price: 1300000 }),
    slot({ time: '19:00', status: 'blocked', price: 1300000 }),
    slot({ time: '20:00', status: 'free', price: 1300000 }),
    slot({ time: '21:00', status: 'free', price: null }),
  ]
}

export const availabilityResponse = (
  overrides: Partial<AvailabilityResponseFixture> = {},
): AvailabilityResponseFixture => ({
  date: todayArt(),
  courts: [
    { id: uid(101), name: 'Cancha 1', surfaceType: 'synthetic_grass', isCovered: false, hasLighting: true, slots: sampleSlots() },
    { id: uid(102), name: 'Cancha 2', surfaceType: 'synthetic_grass', isCovered: true, hasLighting: true, slots: sampleSlots() },
  ],
  ...overrides,
})

/** Complejo sin canchas online todavía. */
export const availabilityResponseNoCourts = (): AvailabilityResponseFixture =>
  availabilityResponse({ courts: [] })

/** Día cerrado / fuera de horario: canchas presentes pero sin ningún slot generado. */
export const availabilityResponseNoSlots = (): AvailabilityResponseFixture =>
  availabilityResponse({
    courts: [
      { id: uid(101), name: 'Cancha 1', surfaceType: 'synthetic_grass', isCovered: false, hasLighting: true, slots: [] },
    ],
  })

export type WeeklyAvailabilityResponseFixture = {
  startDate: string
  days: { date: string; courts: PublicCourtSlotsFixture[] }[]
}

export const weeklyAvailabilityResponse = (): WeeklyAvailabilityResponseFixture => {
  const start = todayArt()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${start}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    return {
      date: dateStr,
      courts:
        i === 3
          ? [{ id: uid(101), name: 'Cancha 1', surfaceType: 'synthetic_grass', isCovered: false, hasLighting: true, slots: [] }]
          : [
              { id: uid(101), name: 'Cancha 1', surfaceType: 'synthetic_grass', isCovered: false, hasLighting: true, slots: sampleSlots() },
              { id: uid(102), name: 'Cancha 2', surfaceType: 'synthetic_grass', isCovered: true, hasLighting: true, slots: sampleSlots() },
            ],
    }
  })
  return { startDate: start, days }
}

// ─── Reseñas (review.service.ts) ───────────────────────────────────────────

export type PublicReviewItem = { id: string; rating: number; comment: string | null; createdAt: string | Date }

export const reviewItem = (overrides: Partial<PublicReviewItem> = {}): PublicReviewItem => ({
  id: uid(801),
  rating: 5,
  comment: 'Excelente cancha, siempre bien mantenida y el encargado muy atento.',
  createdAt: daysFromNow(-4),
  ...overrides,
})

export const reviews = (): PublicReviewItem[] => [
  reviewItem(),
  reviewItem({ id: uid(802), rating: 4, comment: 'Buena superficie, un poco caro el estacionamiento.', createdAt: daysFromNow(-10) }),
  reviewItem({ id: uid(803), rating: 3, comment: null, createdAt: daysFromNow(-30) }),
]

// ─── /explorar — turnos libres de la card (availability-search.service.ts#SlotPill) ─

export type SlotPillFixture = { time: string; courtId: string; durationMins: number }

export const slotPill = (overrides: Partial<SlotPillFixture> = {}): SlotPillFixture => ({
  time: '19:00',
  courtId: uid(101),
  durationMins: 60,
  ...overrides,
})

// ─── Re-exports de tenant.ts (PublicTenantCard/CityCount) ─────────────────────
//
// RE-EXPORT de verdad (`export { x } from 'y'`), no un alias `const x = y`:
// así el barrel (`index.ts`, `export * from './tenant'` + `export * from
// './public'`) resuelve ambos caminos al MISMO binding original y no lo
// marca ambiguo (TS2308). Mismo dato, dos nombres: `tenant.ts` los llama
// `publicTenantCardSinResenas` / `publicTenantCardSinReservaOnline`
// (consumidos por FavoritesList y home/FeaturedComplexes); acá quedan
// disponibles también como `publicTenantCardNoPhoto` / `publicTenantCardNoOnline`
// para las stories de `@/components/site` (FeaturedComplexCard, HeroSearch),
// que ya las importan con ese nombre desde este módulo.

export {
  publicTenantCard,
  cityCounts,
  publicTenantCardSinResenas as publicTenantCardNoPhoto,
  publicTenantCardSinReservaOnline as publicTenantCardNoOnline,
} from './tenant'
