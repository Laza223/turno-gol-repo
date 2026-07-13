import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { publicTenantCard } from '@/test/fixtures/tenant'
import { uid } from '@/test/fixtures/ids'
import ExplorarSplitView from './ExplorarSplitView'

/**
 * Vista mapa de /explorar (`?view=map`): renderiza directo sobre el fondo de la
 * página (`bg-background`), sin card ni aside alrededor — ver `explorar/page.tsx`.
 * El mapa (`ExplorarMapLoader` → `ExplorarMap`, react-leaflet) entra por
 * `next/dynamic({ ssr: false })`: el pin de precio tarda un tick en aparecer,
 * de ahí los `findBy*` en vez de `getBy*` (mismo enfoque que
 * `ExplorarMap.stories.tsx` y `BookingMiniMap.stories.tsx`).
 *
 * No tiene un toggle propio (el botón Lista/Mapa vive en `ExplorarToolbar`, ya
 * cubierto en su propio story): lo que sí es exclusivo de este componente es el
 * hover de una fila de la lista resaltando su pin en el mapa (`onMouseEnter` →
 * `activeId` → `ExplorarMap`), cubierto en `HoverResaltaPinEnMapa`.
 */
const meta = {
  title: 'Player/Explorar/ExplorarSplitView',
  component: ExplorarSplitView,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ExplorarSplitView>

export default meta
type Story = StoryObj<typeof meta>

const complejoFenix = publicTenantCard({
  id: uid(1),
  slug: 'complejo-fenix',
  name: 'Complejo Fénix',
  latitude: -34.6091,
  longitude: -58.4416,
  fromPriceCents: 900000,
})

const complejoBelgrano = publicTenantCard({
  id: uid(4),
  slug: 'polideportivo-belgrano',
  name: 'Polideportivo Belgrano',
  latitude: -34.5633,
  longitude: -58.4573,
  fromPriceCents: 1100000,
})

/**
 * TenantCard (lista) y ExplorarMap (pin) muestran el MISMO "Desde $X" — `findByText`
 * sin acotar es ambiguo. `.lg:order-2` es la columna del mapa (clase propia de
 * ExplorarSplitView, no markup interno de Leaflet), así que sirve para desambiguar.
 */
function mapColumnOf(canvasElement: HTMLElement) {
  const el = canvasElement.querySelector('.lg\\:order-2')
  if (!el) throw new Error('No se encontró la columna del mapa (`.lg:order-2`) de ExplorarSplitView')
  return within(el as HTMLElement)
}

/** Escritorio (viewport default ≥1024px, breakpoint `lg`): grid de 2 columnas, lista a la izquierda y mapa sticky a la derecha. */
export const Composicion: Story = {
  args: { results: [complejoFenix, complejoBelgrano], favoritedIds: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Columna lista: una TenantCard (variant compact) por complejo.
    await expect(canvas.findByRole('heading', { name: 'Complejo Fénix' })).resolves.toBeInTheDocument()
    await expect(canvas.findByRole('heading', { name: 'Polideportivo Belgrano' })).resolves.toBeInTheDocument()
    // Columna mapa: un pin "Desde $X" por complejo.
    const mapa = mapColumnOf(canvasElement)
    const pinFenix = await mapa.findByText('$ 9.000')
    await expect(mapa.findByText('$ 11.000')).resolves.toBeInTheDocument()
    // Layout real: grid de 2 columnas (`lg:grid lg:grid-cols-2`), no una sola columna apilada.
    const root = pinFenix.closest('.lg\\:grid')
    if (!root) throw new Error('No se encontró el contenedor `lg:grid` de ExplorarSplitView')
    await expect(root).toHaveStyle({ display: 'grid' })
  },
}

/**
 * Al pasar el mouse por una fila de la lista, `activeId` resalta su pin en el mapa
 * (fondo más oscuro — mismos colores que `ExplorarMap` usa para `active`); al salir,
 * vuelve al color por defecto. Verifica la ÚNICA lógica de estado propia de este
 * componente (el resto es paso de props).
 */
export const HoverResaltaPinEnMapa: Story = {
  args: { results: [complejoFenix, complejoBelgrano], favoritedIds: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mapa = mapColumnOf(canvasElement)
    const heading = await canvas.findByRole('heading', { name: 'Complejo Fénix' })
    const fila = heading.closest('article')
    if (!fila) throw new Error('TenantCard (variant compact) debería renderizar un <article>')

    // Reposo: ambos pines en el color por defecto (emerald-700, #047857).
    // Era emerald-600 hasta que se descubrió que daba 3.76:1 con su texto blanco.
    const INACTIVO = 'rgb(4, 120, 87)' // #047857
    const ACTIVO = 'rgb(6, 95, 70)' // #065f46 — emerald-800, el resalte
    await expect(await mapa.findByText('$ 9.000')).toHaveStyle({ backgroundColor: INACTIVO })
    await expect(await mapa.findByText('$ 11.000')).toHaveStyle({ backgroundColor: INACTIVO })

    await userEvent.hover(fila)
    // El pin de Fénix se resalta; el de Belgrano queda sin cambios.
    // getByText (no findByText): el nodo ya existe, lo que cambia es su estilo —
    // waitFor reintenta la aserción hasta que Leaflet termine de aplicar el ícono nuevo.
    await waitFor(() => expect(mapa.getByText('$ 9.000')).toHaveStyle({ backgroundColor: ACTIVO }))
    await expect(await mapa.findByText('$ 11.000')).toHaveStyle({ backgroundColor: INACTIVO })

    await userEvent.unhover(fila)
    await waitFor(() => expect(mapa.getByText('$ 9.000')).toHaveStyle({ backgroundColor: INACTIVO }))
  },
}

/** Mobile (<1024px, sin breakpoint `lg`): sin grid — lista y mapa apilados en una sola columna. */
export const Mobile: Story = {
  args: { results: [complejoFenix, complejoBelgrano], favoritedIds: [] },
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.findByRole('heading', { name: 'Complejo Fénix' })).resolves.toBeInTheDocument()
    const pinFenix = await mapColumnOf(canvasElement).findByText('$ 9.000')
    const root = pinFenix.closest('.lg\\:grid')
    if (!root) throw new Error('No se encontró el contenedor `lg:grid` de ExplorarSplitView')
    await expect(root).not.toHaveStyle({ display: 'grid' })
  },
}

/** favoritedIds: TenantCard recibe `initialFavorited` ya en true para el complejo guardado. */
export const ConFavoritos: Story = {
  args: { results: [complejoFenix, complejoBelgrano], favoritedIds: [complejoFenix.id] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = await canvas.findByRole('heading', { name: 'Complejo Fénix' })
    const fila = heading.closest('article')
    if (!fila) throw new Error('TenantCard (variant compact) debería renderizar un <article>')
    await expect(within(fila).getByRole('button', { name: 'Quitar de favoritos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const otraFila = (await canvas.findByRole('heading', { name: 'Polideportivo Belgrano' })).closest('article')
    if (!otraFila) throw new Error('TenantCard (variant compact) debería renderizar un <article>')
    await expect(within(otraFila).getByRole('button', { name: 'Guardar en favoritos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  },
}
