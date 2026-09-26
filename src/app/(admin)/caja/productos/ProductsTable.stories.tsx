import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { canteenProduct, canteenProductsWithInactive, salesRanking } from '@/test/fixtures'
import { uid } from '@/test/fixtures/ids'
import { ProductsTable } from './ProductsTable'
import { TopSellers } from './TopSellers'
import type { ProductActionResult, StockActionResult } from './actions'

const PRODUCTS = canteenProductsWithInactive()

/**
 * Ventas de la semana del fixture: el Gatorade (2 en stock, mínimo 5) vendió 10
 * → alcanza 1 noche; la IPA está agotada.
 */
const UNITS_LAST_7_DAYS: Record<string, number> = {
  [uid(801)]: 18,
  [uid(803)]: 10,
  [uid(804)]: 12,
}

/** Vive sobre `bg-background` en caja/productos/page.tsx: cada bloque es su propia tarjeta. */
const meta = {
  title: 'Admin/Caja/Productos/ProductsTable',
  component: ProductsTable,
  parameters: { layout: 'padded' },
  args: {
    products: PRODUCTS,
    unitsLast7Days: UNITS_LAST_7_DAYS,
    canEditCatalog: true,
    createProductAction: fn(async (): Promise<ProductActionResult> => ({ success: true })),
    updateProductAction: fn(async (): Promise<ProductActionResult> => ({ success: true })),
    deactivateProductAction: fn(async (): Promise<ProductActionResult> => ({ success: true })),
    registerPurchaseAction: fn(async (): Promise<StockActionResult> => ({ success: true })),
    registerStockExitAction: fn(async (): Promise<StockActionResult> => ({ success: true })),
  },
} satisfies Meta<typeof ProductsTable>

export default meta
type Story = StoryObj<typeof meta>

/** Catálogo completo como admin: ve el botón "Agregar producto" y todas las acciones. */
export const ComoAdmin: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const catalog = within(canvas.getByRole('region', { name: /Catálogo/ }))
    for (const p of PRODUCTS) {
      await expect(catalog.getByText(p.name)).toBeVisible()
    }
    await expect(canvas.getByRole('button', { name: /agregar producto/i })).toBeVisible()
  },
}

/**
 * Lo primero de la página: lo que hay que reponer, lo más urgente arriba y con
 * para cuántas noches alcanza al ritmo de la semana. Su botón abre la misma
 * reposición que la fila del catálogo.
 */
export const ParaReponer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const card = canvas.getByRole('region', { name: /Para reponer/ })
    await expect(card).toHaveTextContent('Para reponer · 2')

    const items = within(card).getAllByRole('listitem')
    // El agotado va primero: no alcanza para ninguna noche.
    await expect(items[0]).toHaveTextContent(
      'Cerveza IPA lata agotado · esta semana se vendieron 12',
    )
    await expect(items[1]).toHaveTextContent(
      'Gatorade 500ml quedan 2 (mínimo 5) · al ritmo de esta semana alcanza 1 noche',
    )
    // El pausado nunca pide reposición, aunque su stock esté bajo.
    await expect(within(card).queryByText(/Sanguchito/)).toBeNull()

    await userEvent.click(within(card).getByRole('button', { name: 'Reponer Gatorade 500ml' }))
    const dialogEl = await body.findByRole('dialog')
    await waitFor(() => expect(dialogEl).toBeVisible())
    await expect(dialogEl).toHaveTextContent('Gatorade 500ml')
  },
}

/**
 * Un agotado va primero aunque no se haya vendido en la semana: no hay ritmo que
 * medir, pero no queda nada.
 */
export const AgotadoSinVentasVaPrimero: Story = {
  args: { unitsLast7Days: { [uid(803)]: 10 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('region', { name: /Para reponer/ })
    const items = within(card).getAllByRole('listitem')
    await expect(items[0]).toHaveTextContent('Cerveza IPA lata agotado · no se vendió esta semana')
    await expect(items[1]).toHaveTextContent('Gatorade 500ml')
  },
}

/** Sin nada bajo el mínimo no hay tarjeta: un "todo bien" sería ruido. */
export const NadaParaReponer: Story = {
  args: { products: [canteenProduct()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('region', { name: /Para reponer/ })).toBeNull()
  },
}

/**
 * Como manager: sin botón de alta, sin "Editar" en la fila y sin "Pausar" en el
 * menú. Repone stock, que es lo suyo.
 */
export const ComoManager: Story = {
  args: { canEditCatalog: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await expect(canvas.queryByRole('button', { name: /agregar producto/i })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Editar' })).toBeNull()
    await expect(canvas.getAllByRole('button', { name: 'Reponer' }).length).toBeGreaterThan(0)

    const menuButtons = canvas.getAllByRole('button', { name: /Opciones para/i })
    await userEvent.click(menuButtons[0]!)
    // waitFor: el menuitem de Radix existe en el DOM un frame antes de ser
    // visible (animación del portal) — findByRole solo espera existencia y
    // toBeVisible pelado flakea (gotcha dropdown Radix headless del repo).
    await waitFor(async () => {
      await expect(await body.findByRole('menuitem', { name: 'Salida de stock' })).toBeVisible()
    })
    await expect(body.queryByRole('menuitem', { name: /pausar|reactivar/i })).toBeNull()
  },
}

/**
 * Las dos acciones de la visita semanal están en la fila, no escondidas en el
 * menú "...". Ese menú queda solo con lo ocasional.
 */
export const AccionesALaVista: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await expect(canvas.getAllByRole('button', { name: 'Reponer' }).length).toBe(PRODUCTS.length)
    await expect(canvas.getAllByRole('button', { name: 'Editar' }).length).toBe(PRODUCTS.length)

    await userEvent.click(canvas.getAllByRole('button', { name: /Opciones para/i })[0]!)
    await waitFor(async () => {
      await expect(await body.findByRole('menuitem', { name: 'Salida de stock' })).toBeVisible()
    })
    await expect(body.queryByRole('menuitem', { name: 'Reponer' })).toBeNull()
    await expect(body.queryByRole('menuitem', { name: 'Editar' })).toBeNull()
  },
}

/**
 * En el teléfono Reponer y Editar no entran al lado del nombre: la fila queda
 * con nombre, stock, precio y "⋯", y las dos acciones pasan arriba del menú.
 */
export const EnElTelefono: Story = {
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await expect(canvas.queryByRole('button', { name: 'Reponer' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Editar' })).toBeNull()

    await userEvent.click(canvas.getByRole('button', { name: 'Opciones para Agua mineral 500ml' }))
    await waitFor(async () => {
      await expect(await body.findByRole('menuitem', { name: 'Reponer' })).toBeVisible()
    })
    await expect(body.getByRole('menuitem', { name: 'Editar' })).toBeVisible()
    await expect(body.getByRole('menuitem', { name: 'Salida de stock' })).toBeVisible()
  },
}

/**
 * Catálogo de 45: de a 40 por página, con el total y la página 2 a un clic. El
 * pausado va último aunque sea el primero de la lista.
 */
export const CatalogoLargo: Story = {
  args: {
    products: Array.from({ length: 45 }, (_, i) =>
      canteenProduct({
        id: uid(900 + i),
        name: `Producto ${String(i + 1).padStart(2, '0')}`,
        isActive: i !== 0,
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // La primera lista de la tarjeta son los productos; el paginador trae la suya.
    const catalog = within(canvas.getByRole('region', { name: /Catálogo/ }))
    const list = within(catalog.getAllByRole('list')[0]!)
    const pager = within(canvas.getByRole('navigation', { name: 'Paginación del catálogo' }))
    await expect(pager.getByRole('status')).toHaveTextContent('1–40 de 45')
    await expect(list.getByText('Producto 02')).toBeVisible()
    await expect(list.queryByText('Producto 01')).toBeNull()

    await userEvent.click(pager.getByRole('button', { name: 'Página 2' }))
    await expect(pager.getByRole('status')).toHaveTextContent('41–45 de 45')
    await expect(list.getByText('Producto 01')).toBeVisible()
    await expect(list.queryByText('Producto 02')).toBeNull()
  },
}

export const SinProductos: Story = {
  args: { products: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no cargaste productos')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Cargar el primero' })).toBeVisible()
  },
}

/** "Reponer" abre el StockEntryDialog de esa fila, para cualquier rol operativo. */
export const AbreReposicion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Reponer' })[0]!)
    // `findByRole` resuelve apenas el nodo EXISTE, no cuando está visible: el
    // diálogo entra con `data-[state=open]:animate-in fade-in-0` y aunque
    // `prefers-reduced-motion` la baje a 0.01ms (globals.css), la opacidad
    // recién llega a 1 en el frame siguiente. Un assert síncrono le gana la
    // carrera bajo la suite completa y lee opacity 0.
    const dialogEl = await body.findByRole('dialog')
    await waitFor(() => expect(dialogEl).toBeVisible())
  },
}

/** La página entera: "Lo que más salió" al lado del catálogo desde `lg`. */
export const ConLoQueMasSalio: Story = {
  parameters: { layout: 'fullscreen' },
  args: { aside: <TopSellers range={7} ranking={salesRanking()} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: /Lo que más salió/ })).toBeVisible()
    await expect(canvas.getByRole('region', { name: /Catálogo/ })).toBeVisible()
  },
}
