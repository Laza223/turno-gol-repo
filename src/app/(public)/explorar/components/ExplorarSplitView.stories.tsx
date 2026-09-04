import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { publicTenantCard } from '@/test/fixtures/tenant'
import { uid } from '@/test/fixtures/ids'
import ExplorarSplitView from './ExplorarSplitView'
// Precarga deliberada, no un import de más.
//
// `ExplorarMapLoader` trae `ExplorarMap` por `next/dynamic({ ssr: false })`, o sea
// un `import()` que en este runner es un pedido al dev server de Vite. La PRIMERA
// story del archivo paga ahí la transformación de `ExplorarMap` + react-leaflet +
// `leaflet/dist/leaflet.css`, y bajo la carga del shard eso se pasa de los 15 s de
// `asyncUtilTimeout`: medido con una sonda, a los 15 s la columna del mapa seguía
// siendo el placeholder `aria-busy="true"`, con cero `.leaflet-container`. O sea
// que el rojo intermitente de este archivo nunca fue Leaflet montando lento —
// era el chunk que no llegaba, y por eso caía siempre en la primera story que
// mira el mapa (la segunda ya lo encuentra en cache).
//
// Importarlo acá lo mete en el grafo de módulos del ARCHIVO: se carga antes de que
// arranque el primer test, fuera del presupuesto de cualquier `findBy*`.
import './ExplorarMap'

/**
 * Vista mapa de /explorar (`?view=map`): renderiza directo sobre el fondo de la
 * página (`bg-background`), sin card ni aside alrededor — ver `explorar/page.tsx`.
 * El mapa (`ExplorarMapLoader` → `ExplorarMap`, react-leaflet) entra por
 * `next/dynamic({ ssr: false })`: el pin de precio tarda un tick en aparecer,
 * de ahí los `findBy*` en vez de `getBy*` (mismo enfoque que
 * `ExplorarMap.stories.tsx` y `BookingMiniMap.stories.tsx`). Los tiles salen
 * offline vía el decorator global `withOfflineTiles` (`.storybook/preview.tsx`).
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
function mapColumnElement(canvasElement: HTMLElement): HTMLElement {
  const el = canvasElement.querySelector('.lg\\:order-2')
  if (!el)
    throw new Error('No se encontró la columna del mapa (`.lg:order-2`) de ExplorarSplitView')
  return el as HTMLElement
}

function mapColumnOf(canvasElement: HTMLElement) {
  return within(mapColumnElement(canvasElement))
}

/** Escritorio (viewport default ≥1024px, breakpoint `lg`): grid de 2 columnas, lista a la izquierda y mapa sticky a la derecha. */
export const Composicion: Story = {
  args: { results: [complejoFenix, complejoBelgrano], favoritedIds: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Columna lista: una TenantCard (variant compact) por complejo.
    await expect(
      canvas.findByRole('heading', { name: 'Complejo Fénix' }),
    ).resolves.toBeInTheDocument()
    await expect(
      canvas.findByRole('heading', { name: 'Polideportivo Belgrano' }),
    ).resolves.toBeInTheDocument()
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
    const colMapa = mapColumnElement(canvasElement)
    const mapa = within(colMapa)
    const filaDe = async (nombre: string) => {
      const h = await canvas.findByRole('heading', { name: nombre })
      const art = h.closest('article')
      if (!art) throw new Error('TenantCard (variant compact) debería renderizar un <article>')
      return art
    }
    const fila = await filaDe('Complejo Fénix')
    const filaBelgrano = await filaDe('Polideportivo Belgrano')

    // Esta story NO puede asumir que arranca sin hover, y ese era el rojo del shard.
    //
    // El mouse real es uno solo para toda la página del runner y `@vitest/browser`
    // no la recarga entre archivos, así que una story anterior lo deja donde
    // terminó. Si queda parado sobre una fila de la lista, Chromium le dispara
    // `mouseenter` al montar —re-evalúa el hover cuando cambia el layout, sin que
    // nadie mueva nada— y `activeId` arranca seteado. Medido en CI: el pin de Fénix
    // salía en `rgb(6, 95, 70)` (ACTIVO) desde el arranque y se quedaba así los 15 s
    // del `waitFor`, sin que ningún `hover` del test lo hubiera tocado. Caía solo en
    // el shard porque el orden de archivos decide dónde quedó el puntero, y en
    // cualquiera de los dos pines según sobre qué fila cayó.
    //
    // Se limpia con `unhover` sobre las DOS filas, no moviendo el puntero: acá
    // `userEvent` despacha eventos sintéticos, así que estacionar el mouse en otro
    // lado no dispara el `mouseleave` que la fila necesita para soltar `activeId`.
    const soltarHoverDeLaLista = async () => {
      await userEvent.unhover(fila)
      await userEvent.unhover(filaBelgrano)
    }

    // Reposo: ambos pines en el color por defecto (emerald-700, #047857).
    // Era emerald-600 hasta que se descubrió que daba 3.76:1 con su texto blanco.
    const INACTIVO = 'rgb(4, 120, 87)' // #047857
    const ACTIVO = 'rgb(6, 95, 70)' // #065f46 — emerald-800, el resalte

    // Un solo `findBy*` para esperar a que Leaflet monte los pines. De ahí en más
    // el color se lee RE-CONSULTANDO el nodo en cada intento, nunca por una
    // referencia guardada: Leaflet no muta el ícono de un marker, lo reemplaza.
    //
    // Se compara el string y no `toHaveStyle` a propósito: cuando `toHaveStyle`
    // falla NO imprime el valor recibido —el mensaje sale con "Expected" y sin
    // "Received"—, y eso fue exactamente lo que hizo caro este diagnóstico: el
    // rojo de CI no dejaba distinguir "el pin quedó activo" de "el nodo estaba
    // huérfano". Con `toBe` el mensaje canta el valor y se resolvió en una corrida.
    //
    // `getByText` (no `findByText`) adentro del `waitFor`: un `findBy*` anidado
    // se come el presupuesto del `waitFor` y le deja un solo intento.
    await mapa.findByText('$ 9.000')
    const bg = (texto: string) => getComputedStyle(mapa.getByText(texto)).backgroundColor

    await soltarHoverDeLaLista()
    await waitFor(async () => {
      await expect(bg('$ 9.000')).toBe(INACTIVO)
      await expect(bg('$ 11.000')).toBe(INACTIVO)
    })

    // El pin de Fénix se resalta; el de Belgrano queda sin cambios.
    await userEvent.hover(fila)
    await waitFor(async () => {
      await expect(bg('$ 9.000')).toBe(ACTIVO)
      await expect(bg('$ 11.000')).toBe(INACTIVO)
    })

    await userEvent.unhover(fila)
    await soltarHoverDeLaLista()
    await waitFor(async () => {
      await expect(bg('$ 9.000')).toBe(INACTIVO)
      await expect(bg('$ 11.000')).toBe(INACTIVO)
    })
  },
}

/** Mobile (<1024px, sin breakpoint `lg`): sin grid — lista y mapa apilados en una sola columna. */
export const Mobile: Story = {
  args: { results: [complejoFenix, complejoBelgrano], favoritedIds: [] },
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.findByRole('heading', { name: 'Complejo Fénix' }),
    ).resolves.toBeInTheDocument()
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
    const otraFila = (
      await canvas.findByRole('heading', { name: 'Polideportivo Belgrano' })
    ).closest('article')
    if (!otraFila) throw new Error('TenantCard (variant compact) debería renderizar un <article>')
    await expect(
      within(otraFila).getByRole('button', { name: 'Guardar en favoritos' }),
    ).toHaveAttribute('aria-pressed', 'false')
  },
}
