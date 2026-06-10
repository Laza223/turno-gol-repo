// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import TenantHeader from '@/app/(public)/[slug]/components/TenantHeader'
import type { PublicTenant } from '@/modules/tenants/public.service'

afterEach(() => cleanup())

const tenant = {
  id: 't1',
  slug: 'cancha-x',
  name: 'Cancha X',
  description: null,
  logoUrl: null,
  coverUrl: null,
  address: 'Calle 1',
  city: 'CABA',
  province: 'Buenos Aires',
  phone: '+5491100000000',
  whatsapp: null,
  openingHours: {},
  closedDates: [],
  status: 'active',
  timezone: 'America/Argentina/Buenos_Aires',
  allowOnlineBooking: true,
  requiresDeposit: false,
  depositPercentage: 0,
  bookingDurationMinutes: [60],
  bookingAdvanceDays: 6,
  amenities: {},
  latitude: null,
  longitude: null,
} as unknown as PublicTenant

describe('TenantHeader favorito (#40)', () => {
  it('propaga initialFavorited=true → el botón arranca en "Guardado"', () => {
    render(<TenantHeader tenant={tenant} avgRating={0} reviewCount={0} initialFavorited />)
    const btn = screen.getByRole('button', { name: 'Guardado' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('sin estado de favorito el botón arranca en "Guardar"', () => {
    render(<TenantHeader tenant={tenant} avgRating={0} reviewCount={0} />)
    const btn = screen.getByRole('button', { name: 'Guardar' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })
})
