// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { publicTenantCard } from '@/test/fixtures/tenant'

/**
 * Leaflet toca `window` y el layout; acá se mockea y se mira lo que ExplorarMap le pide: el HTML
 * del pin y el contenido del popup. La rueda y el gesto de un dedo los cubren las stories.
 */

vi.mock('leaflet/dist/leaflet.css', () => ({}))
vi.mock('leaflet', () => ({
  default: {
    divIcon: (o: { html: string }) => o,
    Browser: { mobile: false },
  },
}))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({ children, icon }: { children: ReactNode; icon: { html: string } }) => (
    <div data-testid="marker" data-icon-html={icon.html}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({
    getContainer: () => document.createElement('div'),
    scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
    on: vi.fn(),
    off: vi.fn(),
    setView: vi.fn(),
    fitBounds: vi.fn(),
  }),
}))

import ExplorarMap from '@/app/(public)/explorar/components/ExplorarMap'

const located = publicTenantCard({
  id: 't1',
  slug: 'la-catedral',
  name: 'La Catedral',
  latitude: -34.6,
  longitude: -58.4,
  fromPriceCents: 1200000,
  fromPricePerPlayerCents: 120000,
})
const hidden = { ...located, fromPriceCents: null, fromPricePerPlayerCents: null }

afterEach(() => cleanup())

describe('ExplorarMap — precios ocultos', () => {
  /** El texto del popup y el HTML del pin, con todos los atributos de accesibilidad. */
  function everything(container: HTMLElement): string {
    const attrs = Array.from(container.querySelectorAll('*')).flatMap((el) =>
      ['aria-label', 'title', 'alt', 'data-icon-html'].map((a) => el.getAttribute(a) ?? ''),
    )
    return `${container.textContent}\n${attrs.join('\n')}`
  }

  it('sin precio, ni el pin ni el popup muestran un "$" (el pin cae a las iniciales)', () => {
    const { container, getByTestId } = render(<ExplorarMap results={[hidden]} />)
    expect(everything(container)).not.toContain('$')
    expect(getByTestId('marker').getAttribute('data-icon-html')).toContain('>LA<')
  })

  it('control: con precio el pin y el popup sí lo muestran', () => {
    const { container, getByTestId } = render(<ExplorarMap results={[located]} />)
    expect(getByTestId('marker').getAttribute('data-icon-html')).toMatch(/\$\s?1\.200\/jug/)
    expect(everything(container)).toContain('$')
  })
})

describe('ExplorarMap — popup', () => {
  it('el link "Ver complejo" apunta a la ficha', () => {
    const { getByRole } = render(<ExplorarMap results={[located]} />)
    expect(getByRole('link', { name: 'Ver complejo' }).getAttribute('href')).toBe('/la-catedral')
  })
})
