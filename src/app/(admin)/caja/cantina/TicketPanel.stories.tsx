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
      // getAllByRole()[0] en vez de getByRole: el nombre suelto también
      // matchea los botones de +/- del ticket, así que el matcher es ambiguo.
      await expect(canvas.getAllByRole('button', { name: new RegExp(p.name) })[0]).toBeVisible()
    }
    await expect(canvas.getByText('Buscá o tocá un producto para empezar')).toBeVisible()
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

    // getAllByRole()[0] en vez de getByRole: el nombre suelto también
    // matchea los botones de +/- del ticket, así que el matcher es ambiguo.
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
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
      expect(canvas.getByText('Buscá o tocá un producto para empezar')).toBeVisible(),
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
    // una sola vez desde que se eliminó "Recientes".
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

    // Un solo botón por producto desde que se eliminó "Recientes".
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await expect(canvas.getAllByText('×1')[0]).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: `Quitar ${product.name} del ticket` }))
    await expect(canvas.getByText('Buscá o tocá un producto para empezar')).toBeVisible()
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

    // Un solo botón por producto desde que se eliminó "Recientes".
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

    // Un solo botón por producto desde que se eliminó "Recientes".
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await userEvent.click(canvas.getByRole('button', { name: 'Anotar como fiado' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('¿A nombre de quién?'), 'Capitán equipo 22hs')
    // El diálogo pide UNA sola cosa: el campo de nota libre se retiró (Ley
    // 25.326, misma razón que `abonados.notes`).
    await expect(dialog.queryByLabelText(/nota/i)).not.toBeInTheDocument()
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
      expect(canvas.getByText('Buscá o tocá un producto para empezar')).toBeVisible(),
    )
  },
}

/** Nombre vacío: el fiado no se manda, se muestra el error inline. */
export const AnotarFiadoSinNombre: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const product = PRODUCTS[0]!

    // Un solo botón por producto desde que se eliminó "Recientes".
    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await userEvent.click(canvas.getByRole('button', { name: 'Anotar como fiado' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: /^Anotar fiado/ }))

    await expect(await dialog.findByRole('alert')).toHaveTextContent(/nombre/i)
    await expect(args.createTabAction).not.toHaveBeenCalled()
  },
}

/**
 * Vender sin tocar el mouse: escribir parte del nombre y Enter agrega el primer
 * resultado y limpia el buscador para el próximo. Sin acentos ni mayúsculas:
 * "AGUA" encuentra "Agua mineral 500ml".
 */
export const BuscarYEnter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const search = canvas.getByRole('searchbox', { name: /Buscar producto o servicio/ })

    await userEvent.type(search, 'AGUA')
    // El filtro deja solo lo que coincide: Gatorade desaparece de la lista.
    await expect(canvas.queryAllByRole('button', { name: /^Gatorade/ })).toHaveLength(0)

    await userEvent.keyboard('{Enter}')
    await expect(canvas.getAllByText('×1')[0]).toBeVisible()
    await expect(search).toHaveValue('')
    // Con el buscador limpio vuelve el catálogo entero.
    await expect(canvas.getAllByRole('button', { name: /^Gatorade/ })[0]).toBeVisible()
  },
}

/**
 * Los grupos salen de lo que la base ya distingue (con stock / sin stock), no
 * de una columna de categoría. "Servicios" deja solo lo que no lleva stock.
 */
export const FiltroPorGrupo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const service = PRODUCTS.find((p) => p.stock === null)!
    const tracked = PRODUCTS.find((p) => p.stock !== null)!

    await userEvent.click(canvas.getByRole('button', { name: 'Servicios' }))
    await expect(canvas.getByRole('button', { name: 'Servicios' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      canvas.getAllByRole('button', { name: new RegExp(`^${service.name}`) })[0],
    ).toBeVisible()
    await expect(
      canvas.queryAllByRole('button', { name: new RegExp(`^${tracked.name}`) }),
    ).toHaveLength(0)
  },
}

/**
 * La columna de Hoy (`layout="rail"`): 380 px, UNA sola columna. Catálogo arriba y
 * ticket siempre a la vista debajo — sin depender de un breakpoint —, un solo botón
 * de cobrar (no hay barra pegada abajo, que en una columna no tiene sentido).
 */
export const Columna: Story = {
  args: { layout: 'rail' },
  decorators: [
    (Story) => (
      <div style={{ width: 380 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const product = PRODUCTS[0]!

    // El ticket está a la vista sin tocar nada.
    await expect(canvas.getByText('Buscá o tocá un producto para empezar')).toBeVisible()
    // Sin foco automático: el buscador no le roba el foco a quien cobra un turno al lado.
    await expect(canvas.getByRole('searchbox')).not.toHaveFocus()

    await userEvent.click(canvas.getAllByRole('button', { name: new RegExp(product.name) })[0]!)
    await expect(canvas.getAllByText('×1')[0]).toBeVisible()

    // UN solo botón de cobrar.
    await userEvent.click(canvas.getByRole('button', { name: /^Cobrar/ }))
    await waitFor(() =>
      expect(args.sellTicketAction).toHaveBeenCalledWith(
        expect.objectContaining({ lines: [{ productId: product.id, qty: 1 }], method: 'cash' }),
      ),
    )
  },
}
