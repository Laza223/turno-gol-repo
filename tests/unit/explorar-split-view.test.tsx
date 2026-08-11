// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

vi.mock('@/app/(public)/explorar/components/ExplorarMapLoader', () => ({
  default: () => <div data-testid="map" />,
}))
vi.mock('@/components/public/FavoriteButton', () => ({ default: () => null }))

import ExplorarSplitView from '@/app/(public)/explorar/components/ExplorarSplitView'

afterEach(() => cleanup())

const t = (id: string, name: string): PublicTenantCard => ({
  id,
  slug: id,
  name,
  address: '',
  city: 'Rosario',
  province: 'SF',
  logoUrl: null,
  coverUrl: null,
  allowOnlineBooking: true,
  fromPriceCents: 900000,
  amenities: {},
  avgRating: 0,
  reviewCount: 0,
  distanceKm: null,
  latitude: -32.9,
  longitude: -60.6,
  courtSurfaces: [],
  courtFormats: [],
})

describe('ExplorarSplitView', () => {
  it('renderiza la lista compacta y el mapa', () => {
    render(<ExplorarSplitView results={[t('a', 'Uno'), t('b', 'Dos')]} favoritedIds={[]} />)
    expect(screen.getByText('Uno')).toBeTruthy()
    expect(screen.getByText('Dos')).toBeTruthy()
    expect(screen.getByTestId('map')).toBeTruthy()
  })
})
