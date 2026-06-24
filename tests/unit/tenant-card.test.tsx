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

describe('TenantCard — píldoras de turnos libres', () => {
  const pills = {
    date: '2026-06-15',
    slots: [
      { time: '18:00', courtId: 'c9', durationMins: 60 },
      { time: '19:00', courtId: 'c9', durationMins: 60 },
    ],
  }

  it('renderiza las píldoras como links directos a la reserva con court+fecha+hora+duración', () => {
    render(<TenantCard tenant={baseTenant} slotPills={pills} />)
    const link = screen.getByRole('link', { name: 'Reservar a las 18:00' })
    expect(link.getAttribute('href')).toBe(
      '/el-potrero/reservar?court=c9&date=2026-06-15&time=18:00&dur=60',
    )
    expect(screen.getByRole('link', { name: 'Reservar a las 19:00' })).toBeTruthy()
    expect(
      screen.getByRole('group', { name: 'Turnos libres el 15/06/2026' }),
    ).toBeTruthy()
  })

  it('sin búsqueda temporal (sin slotPills) la card no muestra turnos', () => {
    render(<TenantCard tenant={baseTenant} />)
    expect(screen.queryByText('18:00')).toBeNull()
    expect(screen.queryByRole('link', { name: /Reservar a las/ })).toBeNull()
  })

  it('si el complejo no acepta reserva online no muestra píldoras aunque lleguen', () => {
    render(
      <TenantCard tenant={{ ...baseTenant, allowOnlineBooking: false }} slotPills={pills} />,
    )
    expect(screen.queryByText('18:00')).toBeNull()
  })
})

describe('TenantCard — body (rediseño Matchday)', () => {
  it('muestra el precio en el body con font-display y "/turno"', () => {
    render(<TenantCard tenant={{ ...baseTenant, fromPriceCents: 1200000 }} />)
    const price = screen.getByText(/\$\s?12\.000/)
    expect(price.className).toContain('font-display')
    expect(screen.getByText('/turno')).toBeTruthy()
  })

  it('sin precio no rompe ni muestra "/turno"', () => {
    render(<TenantCard tenant={{ ...baseTenant, fromPriceCents: null }} />)
    expect(screen.queryByText('/turno')).toBeNull()
  })

  it('muestra el rating en el body cuando hay reseñas', () => {
    render(<TenantCard tenant={{ ...baseTenant, avgRating: 4.8, reviewCount: 123 }} />)
    // RatingStars renderiza el número y el conteo
    expect(screen.getByText(/4[.,]8/)).toBeTruthy()
  })

  it('muestra los formatos como chips de "Fútbol N"', () => {
    render(<TenantCard tenant={{ ...baseTenant, courtFormats: [5, 7] }} />)
    expect(screen.getByText('Fútbol 5')).toBeTruthy()
    expect(screen.getByText('Fútbol 7')).toBeTruthy()
  })

  it('muestra el badge "Reservá online" cuando corresponde', () => {
    render(<TenantCard tenant={{ ...baseTenant, allowOnlineBooking: true }} />)
    expect(screen.getByText('Reservá online')).toBeTruthy()
  })
})
