import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { canteenProducts } from '@/test/fixtures'
import type {
  CreateTabActionResult,
  SellTicketActionResult,
} from '@/app/(admin)/caja/cantina/actions'
import { VenderProvider, useVender } from './VenderProvider'
import { VenderRail } from './VenderRail'

/**
 * Vender en Hoy: la MISMA venta de /caja en dos formas — la columna fija desde
 * `xl` y, debajo, un diálogo que abre el botón "Vender". Lo que estas stories
 * fijan es lo que no depende del ancho de la pantalla:
 *  - el diálogo cobra por la misma acción que la columna;
 *  - mientras el diálogo está abierto la columna NO se renderiza (dos tickets a la
 *    vez repetirían los ids del buscador y del método de pago).
 *
 * Qué se ve a cada ancho (columna desde `xl`, botón debajo) lo deciden dos clases
 * de CSS (`hidden xl:block` / `xl:hidden`), no JavaScript: se verifica en el
 * navegador real a 1440 y a 375 px, no acá.
 */
const PRODUCTS = canteenProducts()

/** Un botón cualquiera que abre el diálogo: el real cuelga de la barra superior por un portal. */
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
  parameters: { layout: 'padded' },
  args: {
    products: PRODUCTS,
    sellTicketAction: fn(async (): Promise<SellTicketActionResult> => ({
      success: true,
      total: 300000,
    })),
    createTabAction: fn(async (): Promise<CreateTabActionResult> => ({
      success: true,
      debtorName: 'Capitán equipo 22hs',
      total: 300000,
    })),
    children: (
      <>
        <OpenVender />
        <VenderRail />
      </>
    ),
  },
} satisfies Meta<typeof VenderProvider>

export default meta
type Story = StoryObj<typeof meta>

async function openDialog() {
  const element = await screen.findByRole('dialog')
  // Entra con una animación de opacidad: se espera a que termine.
  await waitFor(() => expect(element).toBeVisible())
  return within(element)
}

/** La columna está montada; el diálogo, no. */
export const Cerrado: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByLabelText('Vender', { selector: 'aside' }),
    ).toBeInTheDocument()
    await expect(screen.queryByRole('dialog')).toBeNull()
  },
}

/** Abrir el diálogo saca la columna del DOM y cobra por la misma acción. */
export const DialogoVendeYSacaLaColumna: Story = {
  play: async ({ args, canvasElement }) => {
    const product = PRODUCTS[0]!
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Abrir venta' }))

    const dialog = await openDialog()
    await expect(dialog.getByRole('heading', { name: 'Vender' })).toBeVisible()
    // Un solo ticket en pantalla: la columna se fue.
    await expect(within(canvasElement).queryByLabelText('Vender', { selector: 'aside' })).toBeNull()
    await expect(document.querySelectorAll('input[type="search"]')).toHaveLength(1)

    await userEvent.click(dialog.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await userEvent.click(dialog.getByRole('button', { name: /^Cobrar/ }))
    await waitFor(() =>
      expect(args.sellTicketAction).toHaveBeenCalledWith(
        expect.objectContaining({ lines: [{ productId: product.id, qty: 1 }], method: 'cash' }),
      ),
    )
  },
}

/** Cerrar el diálogo devuelve la columna. */
export const CerrarDevuelveLaColumna: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Abrir venta' }))
    await openDialog()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(
      within(canvasElement).getByLabelText('Vender', { selector: 'aside' }),
    ).toBeInTheDocument()
  },
}

/**
 * Se corta la red a mitad de una venta: no se sabe si entró. Cerrar el diálogo
 * desmontaría el ticket y perdería la clave de reintento — al reabrir, cobrar de nuevo
 * duplicaría la venta. Por eso Esc no cierra y tocar afuera nunca cierra.
 */
export const NoSeCierraConUnaVentaSinConfirmar: Story = {
  args: {
    sellTicketAction: fn(async (): Promise<SellTicketActionResult> => {
      throw new Error('Failed to fetch')
    }),
  },
  play: async ({ canvasElement }) => {
    const product = PRODUCTS[0]!
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Abrir venta' }))
    const dialog = await openDialog()
    await userEvent.click(dialog.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await userEvent.click(dialog.getByRole('button', { name: /^Cobrar/ }))
    await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent(/no sabemos si/i))

    await userEvent.keyboard('{Escape}')
    // Sigue abierto, con el reintento a la vista.
    await expect(screen.getByRole('dialog')).toBeInTheDocument()
    await expect(dialog.getByRole('button', { name: /Reintentar cobro/ })).toBeVisible()
  },
}

/** Tocar el fondo nunca cierra: un toque de más no puede borrar un ticket armado. */
export const TocarAfueraNoCierra: Story = {
  play: async ({ canvasElement }) => {
    const product = PRODUCTS[0]!
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Abrir venta' }))
    const dialog = await openDialog()
    await userEvent.click(dialog.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await expect(dialog.getAllByText('×1')[0]).toBeVisible()

    const overlay = document.querySelector('[data-state="open"].fixed.inset-0')
    if (!(overlay instanceof HTMLElement)) throw new Error('no se encontró el overlay del diálogo')
    await userEvent.click(overlay, { pointerEventsCheck: 0 })

    await expect(screen.getByRole('dialog')).toBeInTheDocument()
    await expect(dialog.getAllByText('×1')[0]).toBeVisible()
  },
}
