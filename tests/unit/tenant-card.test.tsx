// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

// next/image necesita config de runtime: lo simplificamos a un <img> marcado,
// para poder asertar que TODAS las imágenes de la card pasan por next/image.
vi.mock('next/image', () => ({
  default: ({ fill: _fill, ...props }: { fill?: boolean } & Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img data-next-image {...(props as Record<string, never>)} />
  },
}))

// El botón de favorito usa hooks de toast/fetch que no aportan a estos tests.
vi.mock('@/components/public/FavoriteButton', () => ({ default: () => null }))

import TenantCard from '@/app/(public)/explorar/components/TenantCard'

afterEach(() => cleanup())

const baseTenant: PublicTenantCard = {
  id: 't1',
  slug: 'el-potrero',
  name: 'El Potrero',
  address: 'Av. Siempreviva 742',
  city: 'Rosario',
  province: 'Santa Fe',
  logoUrl: null,
  coverUrl: null,
  allowOnlineBooking: true,
  fromPriceCents: null,
  amenities: {},
  avgRating: 0,
  reviewCount: 0,
  distanceKm: null,
  latitude: null,
  longitude: null,
  courtSurfaces: [],
  courtFormats: [],
}

// Los slides van dentro de <Link aria-hidden> (el link real es el título), así
// que getAllByRole('img') no los ve: consultamos el DOM directo.
function imgs(container: HTMLElement): HTMLImageElement[] {
  return Array.from(container.querySelectorAll('img'))
}

describe('TenantCard — carrusel de fotos', () => {
  it('sin fotos ni cover muestra el fallback con iniciales y ninguna imagen', () => {
    const { container } = render(<TenantCard tenant={baseTenant} photos={[]} />)
    expect(screen.getByText('EL')).toBeTruthy()
    expect(imgs(container)).toHaveLength(0)
  })

  it('con una sola foto renderiza la imagen sin controles de carrusel', () => {
    const { container } = render(
      <TenantCard tenant={{ ...baseTenant, coverUrl: '/cover.jpg' }} photos={[]} />,
    )
    const images = imgs(container)
    expect(images).toHaveLength(1)
    expect(images[0].getAttribute('alt')).toBe('Cancha de El Potrero')
    expect(screen.queryByRole('button', { name: 'Foto siguiente' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Foto anterior' })).toBeNull()
  })

  it('con 3 fotos renderiza los 3 slides y los controles, y el track es focuseable', () => {
    const { container } = render(
      <TenantCard
        tenant={{ ...baseTenant, coverUrl: '/cover.jpg' }}
        photos={['/a.jpg', '/b.jpg']}
      />,
    )
    expect(imgs(container)).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Foto anterior' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Foto siguiente' })).toBeTruthy()
    const track = screen.getByLabelText('Fotos de El Potrero')
    expect(track.getAttribute('tabindex')).toBe('0')
  })

  it('con 6 fotos trunca a 5 slides y muestra el contador "+1"', () => {
    const { container } = render(
      <TenantCard
        tenant={{ ...baseTenant, coverUrl: '/1.jpg' }}
        photos={['/2.jpg', '/3.jpg', '/4.jpg', '/5.jpg', '/6.jpg']}
      />,
    )
    expect(imgs(container)).toHaveLength(5)
    expect(screen.getByText('+1')).toBeTruthy()
  })

  it('deduplica el cover repetido entre las fotos de canchas', () => {
    const { container } = render(
      <TenantCard
        tenant={{ ...baseTenant, coverUrl: '/a.jpg' }}
        photos={['/a.jpg', '/b.jpg']}
      />,
    )
    expect(imgs(container)).toHaveLength(2)
  })

  it('todas las imágenes pasan por next/image (no <img> crudo) y con lazy loading', () => {
    const { container } = render(
      <TenantCard
        tenant={{ ...baseTenant, coverUrl: '/1.jpg' }}
        photos={['/2.jpg', '/3.jpg']}
      />,
    )
    const images = imgs(container)
    expect(images.length).toBeGreaterThan(0)
    for (const img of images) {
      expect(img.hasAttribute('data-next-image')).toBe(true)
      expect(img.getAttribute('loading')).toBe('lazy')
    }
  })
})
