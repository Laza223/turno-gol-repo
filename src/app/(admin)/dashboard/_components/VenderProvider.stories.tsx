import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { canteenProduct } from '@/test/fixtures'
import type {
  CreateTabActionResult,
  SellTicketActionResult,
} from '@/app/(admin)/caja/cantina/actions'
import { VenderProvider, useVender } from './VenderProvider'

/**
 * Vender en Hoy: un modal grande con rubros, la lista del rubro y la venta a la
 * derecha (decisión del dueño, 2026-09-25). Lo abre el botón "Vender" de la barra
 * superior o la tecla V. La venta es la misma de Caja (`useTicketSale`).
 *
 * Lo que estas stories fijan: el modal cobra por la misma acción, los rubros y
 * "Más vendidos" agrupan el catálogo, el buscador busca en todo el catálogo, se vende
 * con el teclado, se cierra solo después de cobrar y NO se cierra con una venta sin
 * confirmar ni tocando afuera.
 */
const AGUA = canteenProduct({
  id: 'p-agua',
  name: 'Agua 500 ml',
  price: 150_000,
  category: 'Bebidas',
})
const GATORADE = canteenProduct({
  id: 'p-gatorade',
  name: 'Gatorade',
  price: 300_000,
  stock: 3,
  minStock: 5,
  category: 'Bebidas',
})
const QUILMES = canteenProduct({
  id: 'p-quilmes',
  name: 'Quilmes lata',
  price: 350_000,
  category: 'Cervezas',
})
const STELLA = canteenProduct({
  id: 'p-stella',
  name: 'Stella Artois lata',
  price: 450_000,
  stock: 0,
  category: 'Cervezas',
})
const PECHERAS = canteenProduct({
  id: 'p-pecheras',
  name: 'Alquiler de pecheras',
  price: 500_000,
  stock: null,
  minStock: null,
})
const PRODUCTS = [AGUA, GATORADE, QUILMES, STELLA, PECHERAS]

/** Un botón cualquiera que abre la venta: el real cuelga de la barra superior por un portal. */
function OpenVender() {
  const { setOpen } = useVender()
  return (
    <button type="button" onClick={() => setOpen(true)}>
      Abrir venta
    </button>
  )
}

const meta = {
  title: 'Admin/Dashboard/Vender',
  component: VenderProvider,
  parameters: { layout: 'fullscreen' },
  args: {
    products: PRODUCTS,
    topProductIds: [QUILMES.id, AGUA.id],
    sellTicketAction: fn(async (): Promise<SellTicketActionResult> => ({
      success: true,
      total: 300000,
    })),
    createTabAction: fn(async (): Promise<CreateTabActionResult> => ({
      success: true,
      debtorName: 'Capitán equipo 22hs',
      total: 300000,
    })),
    children: <OpenVender />,
  },
} satisfies Meta<typeof VenderProvider>

export default meta
type Story = StoryObj<typeof meta>

async function openDialog(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Abrir venta' }))
  const element = await screen.findByRole('dialog', { name: 'Vender' })
  // Entra con una animación de opacidad: se espera a que termine.
  await waitFor(() => expect(element).toBeVisible())
  return within(element)
}

const catalog = (dialog: ReturnType<typeof within>) => within(dialog.getByTestId('canteen-catalog'))

/**
 * Un rubro por nombre. Desde `lg` es la columna de la izquierda y debajo, la tira de
 * chips: a cada ancho hay uno solo visible (el otro es `display: none`), y el runner
 * de stories corre angosto.
 */
const rubro = (dialog: ReturnType<typeof within>, name: string) =>
  dialog.getByRole('button', { name: new RegExp(`^${name}`) })
const RUBROS = /^(Más vendidos|Bebidas|Cervezas|Otros|Todos)/

/** Arranca en "Más vendidos", en su orden; los rubros agrupan y lo suelto va a "Otros". */
export const Rubros: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    for (const name of ['Más vendidos', 'Bebidas', 'Cervezas', 'Otros', 'Todos']) {
      await expect(rubro(dialog, name)).toBeVisible()
    }
    const first = catalog(dialog).getAllByRole('button')
    await expect(first[0]).toHaveTextContent('Quilmes lata')
    await expect(first[1]).toHaveTextContent('Agua 500 ml')

    await userEvent.click(rubro(dialog, 'Cervezas'))
    await expect(catalog(dialog).getByRole('button', { name: /Stella Artois/ })).toBeDisabled()
    await expect(catalog(dialog).queryByText('Agua 500 ml')).toBeNull()

    await userEvent.click(rubro(dialog, 'Otros'))
    await expect(catalog(dialog).getByText('Alquiler de pecheras')).toBeVisible()
  },
}

/** Sin categorías ni ventas: solo "Todos", sin rubros vacíos. */
export const SinCategorias: Story = {
  args: {
    products: PRODUCTS.map((p) => ({ ...p, category: null })),
    topProductIds: [],
  },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await expect(dialog.getAllByRole('button', { name: RUBROS })).toHaveLength(1)
    await expect(rubro(dialog, 'Todos')).toBeVisible()
  },
}

/**
 * Con el teclado, sin mouse: el buscador busca en TODO el catálogo (aunque el rubro
 * sea otro), Enter suma el elegido y F2 cobra. Después de cobrar el modal se cierra.
 */
export const VendeConElTeclado: Story = {
  play: async ({ args, canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    const search = dialog.getByRole('searchbox')
    await userEvent.click(search)
    await userEvent.type(search, 'pech')
    await expect(catalog(dialog).getAllByRole('button')).toHaveLength(1)
    await userEvent.keyboard('{Enter}')
    await expect(search).toHaveValue('')

    // ↓ en "Más vendidos" elige el segundo (Agua) y Enter lo suma dos veces.
    await userEvent.keyboard('{ArrowDown}{Enter}{Enter}')
    await expect(dialog.getByRole('button', { name: /^Cobrar \$\s8\.000$/ })).toBeVisible()

    await userEvent.keyboard('{F2}')
    await waitFor(() =>
      expect(args.sellTicketAction).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { productId: PECHERAS.id, qty: 1 },
            { productId: AGUA.id, qty: 2 },
          ],
          method: 'cash',
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** La V abre la venta; escribiendo en un campo es una letra, no un atajo. */
export const LaVAbreLaVenta: Story = {
  args: {
    children: (
      <>
        <OpenVender />
        <input aria-label="Otro campo" />
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Otro campo'), 'v')
    await expect(screen.queryByRole('dialog')).toBeNull()

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    await userEvent.keyboard('v')
    await expect(await screen.findByRole('dialog', { name: 'Vender' })).toBeInTheDocument()
  },
}

/**
 * Se corta la red a mitad de una venta: no se sabe si entró. Cerrar el modal
 * desmontaría la venta y perdería la clave de reintento — al reabrir, cobrar de nuevo
 * duplicaría la venta. Por eso Esc no cierra y tocar afuera nunca cierra.
 */
export const NoSeCierraConUnaVentaSinConfirmar: Story = {
  args: {
    sellTicketAction: fn(async (): Promise<SellTicketActionResult> => {
      throw new Error('Failed to fetch')
    }),
  },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await userEvent.click(catalog(dialog).getByRole('button', { name: /Agua 500 ml/ }))
    await userEvent.click(dialog.getByRole('button', { name: /^Cobrar/ }))
    await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent(/no sabemos si/i))

    await userEvent.keyboard('{Escape}')
    await expect(screen.getByRole('dialog')).toBeInTheDocument()
    await expect(dialog.getByRole('button', { name: /Reintentar cobro/ })).toBeVisible()
  },
}

/**
 * Esc con la venta todavía saliendo tampoco cierra: desmontaría la venta antes de saber
 * si la red se cortó, y si se corta no queda clave para reintentar.
 */
export const NoSeCierraConLaVentaEnVuelo: Story = {
  args: {
    sellTicketAction: fn(
      () =>
        new Promise<SellTicketActionResult>((_, reject) => {
          rejectInFlight = reject
        }),
    ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await userEvent.click(catalog(dialog).getByRole('button', { name: /Agua 500 ml/ }))
    await userEvent.click(dialog.getByRole('button', { name: /^Cobrar/ }))
    await expect(dialog.getByRole('button', { name: /Cobrando/ })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await expect(screen.getByRole('dialog')).toBeInTheDocument()

    rejectInFlight?.(new Error('Failed to fetch'))
    await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent(/no sabemos si/i))
    await expect(dialog.getByRole('button', { name: /Reintentar cobro/ })).toBeVisible()
  },
}
let rejectInFlight: ((err: Error) => void) | undefined

/** Tocar el fondo nunca cierra: un toque de más no puede borrar una venta armada. */
export const TocarAfueraNoCierra: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await userEvent.click(catalog(dialog).getByRole('button', { name: /Agua 500 ml/ }))
    await expect(dialog.getByText(/^1 × \$\s1\.500$/)).toBeVisible()

    const overlay = document.querySelector('[data-state="open"].fixed.inset-0')
    if (!(overlay instanceof HTMLElement)) throw new Error('no se encontró el overlay del diálogo')
    await userEvent.click(overlay, { pointerEventsCheck: 0 })

    await expect(screen.getByRole('dialog')).toBeInTheDocument()
    await expect(dialog.getByText(/^1 × \$\s1\.500$/)).toBeVisible()
  },
}
