import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import L from 'leaflet'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { paintedContrast } from '@/test/contrast'
import { publicTenantCard } from '@/test/fixtures/tenant'
import { uid } from '@/test/fixtures/ids'
import ExplorarMap from './ExplorarMap'

/**
 * react-leaflet.
 * Monta un `MapContainer` real (siempre vía `next/dynamic({ ssr: false })` desde
 * `ExplorarMapLoader`) y pide tiles a `{s}.tile.openstreetmap.org`; el decorator global
 * `withOfflineTiles` (`.storybook/preview.tsx`) pisa esa URL por un tile en blanco
 * embebido — sin eso son requests reales a un tercero desde el runner de CI.
 *
 * El pin es un `L.divIcon` con html propio (`priceIcon` en ExplorarMap.tsx): el texto
 * del precio queda en el DOM real, sin esperar a que se abra el Popup (que Leaflet
 * mantiene cerrado hasta un click).
 *
 * Vive directo sobre el fondo de la página (`bg-background`, sin card ni aside
 * alrededor — ver `explorar/page.tsx`), así que no hace falta decorator de superficie.
 */
const meta = {
  title: 'Player/Explorar/ExplorarMap',
  component: ExplorarMap,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ExplorarMap>

export default meta
type Story = StoryObj<typeof meta>

const complejoFenix = publicTenantCard({
  id: uid(1),
  slug: 'complejo-fenix',
  name: 'Complejo Fénix',
  latitude: -34.6091,
  longitude: -58.4416,
  fromPriceCents: 900000,
  fromPricePerPlayerCents: 90000, // F5 a $9.000 → $900 por jugador
})

const complejoBelgrano = publicTenantCard({
  id: uid(4),
  slug: 'polideportivo-belgrano',
  name: 'Polideportivo Belgrano',
  latitude: -34.5633,
  longitude: -58.4573,
  fromPriceCents: 1100000,
  // El mínimo por jugador sale de la F7 ($11.000/14 = $785,71 → $800), no de la
  // cancha del precio mínimo: por eso el dato viene denormalizado (migr. 087).
  fromPricePerPlayerCents: 78572,
})

const complejoCatedral = publicTenantCard({
  id: uid(5),
  slug: 'la-catedral-f5',
  name: 'La Catedral F5',
  latitude: -34.5885,
  longitude: -58.4306,
  fromPriceCents: 800000,
  fromPricePerPlayerCents: 65000, // F11 barata por cabeza → $700
})

/** Complejo sin `latitude`/`longitude` cargada: `isLocated()` lo filtra antes de llegar al mapa. */
const complejoSinUbicacion = publicTenantCard({
  id: uid(3),
  slug: 'la-bombonerita',
  name: 'La Bombonerita Fútbol Club',
  latitude: null,
  longitude: null,
  fromPriceCents: 700000,
  fromPricePerPlayerCents: 70000,
})

/** Varios complejos con coordenadas: un pin "$X/jug" por cada uno. */
export const VariosComplejos: Story = {
  args: { results: [complejoFenix, complejoBelgrano, complejoCatedral] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.findByText('$ 900/jug')).resolves.toBeInTheDocument()
    await expect(canvas.findByText('$ 800/jug')).resolves.toBeInTheDocument()
    await expect(canvas.findByText('$ 700/jug')).resolves.toBeInTheDocument()
  },
}

/** Complejo sin coordenadas mezclado con uno ubicado: el mapa filtra el primero sin romperse. */
export const ComplejosSinCoordenadas: Story = {
  args: { results: [complejoFenix, complejoSinUbicacion] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.findByText('$ 900/jug')).resolves.toBeInTheDocument()
    await expect(canvas.queryByText('$ 700/jug')).not.toBeInTheDocument()
  },
}

/**
 * activeId resalta el pin correspondiente: fondo más oscuro (emerald-800 vs emerald-700).
 *
 * Los dos tonos bajaron un escalón respecto del diseño original (era 700 vs 600) porque el
 * pin por defecto daba 3.76:1 con su texto blanco — abajo de AA. Se conserva la jerarquía
 * "el activo es más oscuro"; lo que cambió es que ahora los dos pasan.
 */
export const ComplejoActivoVsInactivo: Story = {
  args: { results: [complejoFenix, complejoBelgrano], activeId: complejoFenix.id },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const activo = await canvas.findByText('$ 900/jug')
    const inactivo = await canvas.findByText('$ 800/jug')
    await expect(activo).toHaveStyle({ backgroundColor: 'rgb(6, 95, 70)' }) // #065f46
    await expect(inactivo).toHaveStyle({ backgroundColor: 'rgb(4, 120, 87)' }) // #047857
  },
}

/**
 * Popup abierto: el link "Ver complejo" es un botón `bg-primary text-primary-foreground`, pero
 * `leaflet.css` le pone color a todo `.leaflet-container a` y le ganaba a la utilidad de Tailwind
 * (en claro, azul sobre verde; en oscuro, verde sobre verde). axe no lo mide con el popup cerrado
 * y acá se mide lo que se pinta, en el tema que corra la suite (claro u oscuro).
 */
export const PopupAbierto: Story = {
  args: { results: [complejoFenix, complejoBelgrano] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByText('$ 900/jug'))
    const link = await canvas.findByRole('link', { name: 'Ver complejo' })
    await expect(link).toHaveAttribute('href', '/complejo-fenix')
    await expect(await paintedContrast(link)).toBeGreaterThanOrEqual(4.5)
  },
}

/**
 * El mapa va dentro de una página que se scrollea: con `scrollWheelZoom` siempre activo, la rueda (y el
 * gesto del trackpad) hacían zoom al pasar por encima en vez de seguir de largo. Ahora la rueda solo
 * hace zoom mientras el mapa tiene el foco (click o Tab) y se bloquea al salir.
 *
 * Se mide la separación entre dos pines: un nivel de zoom la duplica.
 */
export const RuedaSoloConElMapaEnFoco: Story = {
  args: { results: [complejoFenix, complejoBelgrano] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const container = canvasElement.querySelector<HTMLElement>('.leaflet-container')
    if (!container) throw new Error('No se montó el mapa (`.leaflet-container`)')
    const fenix = await canvas.findByText('$ 900/jug')
    const belgrano = await canvas.findByText('$ 800/jug')
    const separation = () => {
      const a = fenix.getBoundingClientRect()
      const b = belgrano.getBoundingClientRect()
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const rueda = () => {
      const r = container.getBoundingClientRect()
      container.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -240,
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const inicial = separation()

    // Sin haber tocado el mapa la rueda no hace nada: se espera más que el debounce (40 ms) y la animación (250 ms).
    rueda()
    await esperar(600)
    await expect(separation()).toBeCloseTo(inicial, 0)

    // Con el foco (un click sobre el mapa se lo da) la rueda hace zoom.
    await userEvent.click(container)
    rueda()
    await waitFor(() => expect(separation()).toBeGreaterThan(inicial * 1.5))
    await esperar(400) // que termine la animación del zoom antes de medir de nuevo

    // Al salir del mapa se vuelve a bloquear.
    container.blur()
    const conZoom = separation()
    rueda()
    await esperar(600)
    await expect(separation()).toBeCloseTo(conZoom, 0)
  },
}

/**
 * En el celular, arrastrar con un dedo sobre el mapa tiene que scrollear la página: el arrastre del
 * mapa (`dragging`) se apaga en táctil y queda el gesto de dos dedos (pellizcar/mover). Leaflet decide
 * "táctil" con `L.Browser.mobile`; el runner es un Chromium de escritorio, así que se fuerza.
 */
export const SinArrastreConUnDedoEnTactil: Story = {
  args: { results: [complejoFenix, complejoBelgrano] },
  beforeEach: () => {
    const antes = L.Browser.mobile
    Object.assign(L.Browser, { mobile: true })
    return () => {
      Object.assign(L.Browser, { mobile: antes })
    }
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('$ 900/jug')
    const container = canvasElement.querySelector('.leaflet-container')
    // `leaflet-grab` lo agrega el handler de arrastre al activarse.
    await expect(container).not.toHaveClass('leaflet-grab')
  },
}

/** En escritorio el arrastre con el mouse sigue andando (control de la story anterior). */
export const ArrastreConMouseEnEscritorio: Story = {
  args: { results: [complejoFenix, complejoBelgrano] },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('$ 900/jug')
    await expect(canvasElement.querySelector('.leaflet-container')).toHaveClass('leaflet-grab')
  },
}

/** Sin resultados: estado vacío en vez de un mapa sin pines. */
export const SinComplejos: Story = {
  args: { results: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(/todavía no tienen ubicación cargada en el mapa/i),
    ).toBeInTheDocument()
  },
}
