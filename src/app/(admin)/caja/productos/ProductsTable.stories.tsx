import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { canteenProductsWithInactive } from '@/test/fixtures'
import { ProductsTable } from './ProductsTable'
import type { ProductActionResult, StockActionResult } from './actions'

const PRODUCTS = canteenProductsWithInactive()

/** Vive suelto sobre `bg-background` en caja/productos/page.tsx (define su propia superficie `bg-card`). */
const meta = {
  title: 'Admin/Caja/Productos/ProductsTable',
  component: ProductsTable,
  parameters: { layout: 'padded' },
  args: {
    products: PRODUCTS,
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
    for (const p of PRODUCTS) {
      await expect(canvas.getAllByText(p.name).length).toBeGreaterThan(0)
    }
    await expect(canvas.getByRole('button', { name: /agregar producto/i })).toBeVisible()
  },
}

/** Como manager: sin botón de alta y sin "Editar"/"Pausar" en el menú de fila. */
export const ComoManager: Story = {
  args: { canEditCatalog: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await expect(canvas.queryByRole('button', { name: /agregar producto/i })).toBeNull()

    const menuButtons = canvas.getAllByRole('button', { name: /Opciones para/i })
    await userEvent.click(menuButtons[0]!)
    // waitFor: el menuitem de Radix existe en el DOM un frame antes de ser
    // visible (animación del portal) — findByRole solo espera existencia y
    // toBeVisible pelado flakea (gotcha dropdown Radix headless del repo).
    await waitFor(async () => {
      await expect(await body.findByRole('menuitem', { name: 'Reponer' })).toBeVisible()
    })
    await expect(body.queryByRole('menuitem', { name: 'Editar' })).toBeNull()
    await expect(body.queryByRole('menuitem', { name: /pausar|reactivar/i })).toBeNull()
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

/** El menú de fila abre "Reponer" (StockEntryDialog) para cualquier rol operativo. */
export const AbreReposicion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const menuButtons = canvas.getAllByRole('button', { name: /Opciones para/i })
    await userEvent.click(menuButtons[0]!)
    await userEvent.click(await body.findByRole('menuitem', { name: 'Reponer' }))
    await expect(await body.findByRole('dialog')).toBeVisible()
  },
}
