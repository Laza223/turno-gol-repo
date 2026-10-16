// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// next/image necesita config de runtime (Invalid URL en happy-dom): se simplifica a un <img>.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, never>)} />
  },
}))

import OpeningHoursList from '@/app/(public)/[slug]/components/OpeningHoursList'
import ProfileRest from '@/app/(public)/[slug]/components/ProfileRest'
import { dayKeyOf } from '@/lib/schedule/open-status'
import { artNowParts } from '@/shared/dates/art'
import { DAY_LABELS_LONG } from '@/shared/time/week-days'
import { publicCourtCard, publicTenant } from '@/test/fixtures/public'
import { openingHours } from '@/test/fixtures/tenant'

afterEach(() => cleanup())

const NO_REVIEWS = { initial: [], total: 0, average: 0 }
const rest = (courts: Parameters<typeof ProfileRest>[0]['courts']) =>
  render(
    <ProfileRest
      tenant={publicTenant({ description: null, amenities: {} })}
      courts={courts}
      tournaments={[]}
      reviews={NO_REVIEWS}
    />,
  )

describe('ProfileRest: fotos', () => {
  it('la galería no repite las fotos que ya se ven en las fichas de cancha', () => {
    rest([
      publicCourtCard({ id: 'c1', name: 'Cancha 1', photos: ['/a.png', '/b.png'] }),
      publicCourtCard({ id: 'c2', name: 'Cancha 2', photos: ['/c.png'] }),
      publicCourtCard({ id: 'c3', name: 'Cancha 3', photos: [] }),
    ])

    const srcs = screen.getAllByRole('img').map((img) => img.getAttribute('src'))
    expect(srcs.filter((src) => src === '/a.png')).toHaveLength(1) // la ficha, no la galería
    expect(srcs).toContain('/b.png') // la foto que sobra va a la galería
    expect(screen.getByRole('region', { name: 'Fotos del complejo' }).textContent).toContain('(1)')
    expect(screen.getByRole('region', { name: 'Canchas' }).textContent).toContain('(2)')
  })

  it('si no sobra ninguna foto, el bloque Fotos no aparece', () => {
    rest([publicCourtCard({ id: 'c1', name: 'Cancha 1', photos: ['/a.png'] })])

    expect(screen.getByRole('region', { name: 'Canchas' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Fotos del complejo' })).toBeNull()
  })

  it('el alt de la ficha es el nombre de la cancha, sin repetir "Cancha"', () => {
    rest([publicCourtCard({ id: 'c1', name: 'Cancha 1', photos: ['/a.png'] })])

    expect(screen.getByRole('img', { name: 'Cancha 1' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Cancha Cancha/ })).toBeNull()
  })
})

describe('OpeningHoursList', () => {
  const allDays = openingHours({
    mon: { open: '09:00', close: '24:00' },
    tue: { open: '09:00', close: '24:00' },
    wed: { open: '09:00', close: '24:00' },
    thu: { open: '09:00', close: '24:00' },
    fri: { open: '09:00', close: '24:00' },
    sat: { open: '09:00', close: '24:00' },
    sun: { open: '09:00', close: '24:00' },
  })

  it('resalta el día de hoy y solo ese, con la palabra "hoy"', async () => {
    render(<OpeningHoursList openingHours={allDays} />)

    await screen.findByText('hoy')
    const todayKey = dayKeyOf(artNowParts().date)
    const current = document.querySelectorAll('[aria-current="date"]')
    expect(current).toHaveLength(1)
    expect(current[0]!.textContent).toContain(DAY_LABELS_LONG[todayKey])
  })

  it('el cierre guardado como 24:00 se muestra 00:00', () => {
    render(<OpeningHoursList openingHours={allDays} />)

    expect(screen.getAllByText('09:00 – 00:00')).toHaveLength(7)
    expect(document.body.textContent).not.toContain('24:00')
  })

  it('un día cerrado dice "Cerrado"', () => {
    render(
      <OpeningHoursList
        openingHours={openingHours({ mon: { open: '09:00', close: '23:00', closed: true } })}
      />,
    )
    expect(screen.getByText('Cerrado')).toBeTruthy()
  })
})
