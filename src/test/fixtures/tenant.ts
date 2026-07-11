import type { OpeningHours, OpeningHoursDay, TenantRow, TenantSettings } from '@/modules/tenants/tenant.types'
import { daysFromNow } from './clock'
import { uid } from './ids'

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
  canteen_products: [
    { id: uid(701), name: 'Agua mineral 500ml', price: 150000 },
    { id: uid(702), name: 'Gatorade 500ml', price: 250000 },
    { id: uid(703), name: 'Alfajor Havanna', price: 180000 },
  ],
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
    settings: tenantSettings({
      onboarding_step: 2,
      onboarding_completed: false,
      public_link_shared: false,
      canteen_products: [],
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
