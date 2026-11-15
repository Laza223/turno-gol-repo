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

// Portal de vidrio (F4): las canchas son fichas de texto y TODAS sus fotos van a la galería.
describe('ProfileRest: canchas y fotos', () => {
  it('lista todas las canchas, con o sin foto, y la galería junta sus fotos sin repetir', () => {
    rest([
      publicCourtCard({ id: 'c1', name: 'Cancha 1', photos: ['/a.png', '/b.png'] }),
      publicCourtCard({ id: 'c2', name: 'Cancha 2', photos: ['/a.png', '/c.png'] }),
      publicCourtCard({ id: 'c3', name: 'Cancha 3', photos: [] }),
    ])

    const canchas = screen.getByRole('region', { name: 'Canchas' })
    expect(canchas.textContent).toContain('(3)')
    expect(canchas.textContent).toContain('Cancha 3')
    expect(canchas.querySelector('img')).toBeNull()
    const fotos = screen.getByRole('region', { name: 'Fotos del complejo' })
    const srcs = [...fotos.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(srcs).toEqual(['/a.png', '/b.png', '/c.png'])
    expect(fotos.textContent).toContain('(3)')
  })

  it('sin ninguna foto, el bloque Fotos no aparece', () => {
    rest([publicCourtCard({ id: 'c1', name: 'Cancha 1', photos: [] })])

    expect(screen.getByRole('region', { name: 'Canchas' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Fotos del complejo' })).toBeNull()
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
