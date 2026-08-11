import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { canteenProducts } from '@/test/fixtures'
import { TicketPanel } from './TicketPanel'
import type { CreateTabActionResult, SellTicketActionResult } from './actions'

const PRODUCTS = canteenProducts()

const meta = {
  title: 'Admin/Caja/Cantina/TicketPanel',
  component: TicketPanel,
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
  },
} satisfies Meta<typeof TicketPanel>

export default meta
type Story = StoryObj<typeof meta>

export const ConProductos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const p of PRODUCTS) {
      // Con ≤6 productos, cada uno aparece 2 veces (Recientes + Catálogo) —
      // getAllByRole()[0] en vez de getByRole (ambiguo).
      await expect(canvas.getAllByRole('button', { name: new RegExp(p.name) })[0]).toBeVisible()
    }
    await expect(canvas.getByText('Tocá un producto o servicio para empezar')).toBeVisible()
  },
}

export const SinProductos: Story = {
  args: { products: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/cargá tus productos/i)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Configurar productos' }))
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith('/caja/productos?configureCanteen=true'),
    )
  },
}

/**
 * Regla de oro (Fase 3): venta de 1 ítem = 2 taps — tap producto, tap Cobrar.
 * Sin diálogo intermedio (a diferencia de la vieja CanteenQuickSale).
 */
export const VentaDeUnItem: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const product = PRODUCTS[0]!

    // Con ≤6 productos, cada uno aparece 2 veces (Recientes + Catálogo) —
    // getAllByRole()[0] en vez de getByRole (ambiguo).
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    // Mismo motivo: la badge "×1" se pinta en las dos secciones a la vez.
    await expect(canvas.getAllByText('×1')[0]).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))

    await waitFor(() =>
      expect(args.sellTicketAction).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [{ productId: product.id, qty: 1 }],
          method: 'cash',
        }),
      ),
    )
    // Éxito: el ticket se vacía (vuelve el hint) — listo para la próxima venta.
    await waitFor(() =>
      expect(canvas.getByText('Tocá un producto o servicio para empezar')).toBeVisible(),
    )
  },
}

/** Dos productos distintos en un mismo ticket: un solo Cobrar cobra todo junto. */
export const VentaMultiItem: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const [productA, productB] = PRODUCTS

    // Anclado a ^: con una línea ya en el ticket, "Restar/Sumar uno a {nombre}"
    // y "Quitar {nombre} del ticket" también matchean el nombre suelto y
    // getByRole se vuelve ambiguo. Además, con ≤6 productos cada uno aparece
    // 2 veces (Recientes + Catálogo) — getAllByRole()[0] en vez de getByRole.
    await userEvent.click(
      canvas.getAllByRole('button', { name: new RegExp(`^${productA!.name}`) })[0]!,
    )
    await userEvent.click(
      canvas.getAllByRole('button', { name: new RegExp(`^${productA!.name}`) })[0]!,
    )
    await userEvent.click(
      canvas.getAllByRole('button', { name: new RegExp(`^${productB!.name}`) })[0]!,
    )
    // Mismo motivo: la badge "×N" se pinta en las dos secciones a la vez.
    await expect(canvas.getAllByText('×2')[0]).toBeVisible()
    await expect(canvas.getAllByText('×1')[0]).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Transferencia' }))
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))

    await waitFor(() =>
      expect(args.sellTicketAction).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { productId: productA!.id, qty: 2 },
            { productId: productB!.id, qty: 1 },
          ],
          method: 'transfer',
        }),
      ),
    )
  },
}

/** El botón "−" no baja de 1; "Quitar" (tacho) saca la línea entera. */
export const QuitarLinea: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const product = PRODUCTS[0]!

    // Con ≤6 productos, cada uno aparece 2 veces (Recientes + Catálogo).
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await expect(canvas.getAllByText('×1')[0]).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: `Quitar ${product.name} del ticket` }))
    await expect(canvas.getByText('Tocá un producto o servicio para empezar')).toBeVisible()
  },
}

/** La venta falla del lado del servidor: error inline, el ticket NO se vacía. */
export const ErrorDeVenta: Story = {
  args: {
    sellTicketAction: fn(async (): Promise<SellTicketActionResult> => ({
      success: false,
      error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const product = PRODUCTS[0]!

    // Con ≤6 productos, cada uno aparece 2 veces (Recientes + Catálogo).
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya fue cerrada/i)
    // El ticket sigue con la línea cargada (no se pierde el trabajo del cajero).
    await expect(canvas.getAllByText('×1')[0]).toBeVisible()
  },
}

/**
 * Fase 4: el mismo ticket se anota como fiado en vez de cobrarlo — key de
 * idempotencia propia, distinta de la del ticket cobrado.
 */
export const AnotarComoFiado: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const product = PRODUCTS[0]!

    // Con ≤6 productos, cada uno aparece 2 veces (Recientes + Catálogo).
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await userEvent.click(canvas.getByRole('button', { name: 'Anotar como fiado' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Nombre'), 'Capitán equipo 22hs')
    await userEvent.click(dialog.getByRole('button', { name: /^Anotar fiado/ }))

    await waitFor(() =>
      expect(args.createTabAction).toHaveBeenCalledWith(
        expect.objectContaining({
          debtorName: 'Capitán equipo 22hs',
          lines: [{ productId: product.id, qty: 1 }],
        }),
      ),
    )
    // Éxito: el ticket se vacía, igual que tras cobrar.
    await waitFor(() =>
      expect(canvas.getByText('Tocá un producto o servicio para empezar')).toBeVisible(),
    )
  },
}

/** Nombre vacío: el fiado no se manda, se muestra el error inline. */
export const AnotarFiadoSinNombre: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const product = PRODUCTS[0]!

    // Con ≤6 productos, cada uno aparece 2 veces (Recientes + Catálogo).
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await userEvent.click(canvas.getByRole('button', { name: 'Anotar como fiado' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: /^Anotar fiado/ }))

    await expect(await dialog.findByRole('alert')).toHaveTextContent(/nombre/i)
    await expect(args.createTabAction).not.toHaveBeenCalled()
  },
}

/**
 * Caja de hoy cerrada: cobrar queda deshabilitado con hint visible; anotar
 * como fiado sigue activo (createTab no toca caja).
 */
export const CajaCerrada: Story = {
  args: { saleDisabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const product = PRODUCTS[0]!

    // Con ≤6 productos, cada uno aparece 2 veces (Recientes + Catálogo).
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)

    await expect(canvas.getByRole('button', { name: /^Cobrar/ })).toBeDisabled()
    await expect(canvas.getByText(/caja cerrada/i)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Anotar como fiado' })).toBeEnabled()
  },
}
