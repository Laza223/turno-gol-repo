import type { CourtPricingData, CourtRow, SurfaceType } from '@/modules/courts/court.types'
import { daysFromNow } from './clock'
import { uid } from './ids'
import { tenant } from './tenant'

/** Sintética estándar: más cara de noche y el fin de semana. */
export const pricingSynthetic = (): CourtPricingData => ({
  rules: [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '09:00', to: '18:00', price: 900000 },
    { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '18:00', to: '24:00', price: 1300000 },
    { days: ['sat', 'sun'], from: '09:00', to: '24:00', price: 1500000 },
  ],
})

/** Una sola franja fija todo el día — cancha 11 al aire libre. */
export const pricingFlat = (): CourtPricingData => ({
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '09:00',
      to: '24:00',
      price: 1800000,
    },
  ],
})

export const court = (overrides: Partial<CourtRow> = {}): CourtRow => ({
  id: uid(101),
  tenantId: tenant().id,
  name: 'Cancha 1',
  description: 'Sintética con iluminación LED y arcos reglamentarios.',
  surfaceType: 'synthetic_grass' satisfies SurfaceType,
  isCovered: false,
  hasLighting: true,
  format: 5,
  capacity: 10,
  photos: [],
  status: 'online',
  pricing: pricingSynthetic(),
  createdAt: daysFromNow(-260),
  updatedAt: daysFromNow(-14),
  ...overrides,
})

export const courtFutbol5 = (): CourtRow => court()

export const courtFutbol7 = (): CourtRow =>
  court({
    id: uid(102),
    name: 'Cancha 2',
    description: 'Sintética techada, ideal para días de lluvia.',
    isCovered: true,
    format: 7,
    capacity: 14,
  })

export const courtFutbol11 = (): CourtRow =>
  court({
    id: uid(103),
    name: 'Cancha 3 - Fútbol 11',
    description: 'Césped natural al aire libre, sin iluminación.',
    surfaceType: 'natural_grass',
    hasLighting: false,
    format: 11,
    capacity: 22,
    pricing: pricingFlat(),
  })

/** Cancha dada de baja temporalmente (mantenimiento). */
export const courtOffline = (): CourtRow =>
  court({
    id: uid(104),
    name: 'Cancha 4',
    description: 'Piso de cemento — en refacción.',
    surfaceType: 'cement',
    hasLighting: false,
    format: 5,
    capacity: 10,
    status: 'offline',
  })

export const courts = (): CourtRow[] => [
  courtFutbol5(),
  courtFutbol7(),
  courtFutbol11(),
  courtOffline(),
]
