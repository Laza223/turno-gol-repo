import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { canteenProducts } from '@/test/fixtures'
import { uid } from '@/test/fixtures/ids'
import type { SellTicketActionResult } from '../../caja/cantina/actions'
import { BookingCanteenDialog, type ListCanteenCatalog } from './BookingCanteenDialog'

const PRODUCTS = canteenProducts()

/**
 * Cantina cargada a un turno desde la grilla.
 *
 * Del catálogo cargado va SOLO el cierre del diálogo: el ticket es el
 * `TicketPanel` real de /caja/cantina, que ya tiene sus propias stories —
 * duplicarlo mediría dos veces lo mismo. Lo demás es el estado de error: el aviso
 * de que el catálogo no cargó aparece recién cuando la Server Action falla, así
 * que axe nunca lo veía.
 *
 * El `open` es una prop que decide el caller: acá no hay quien lo baje, así que
 * "no se cerró" se afirma con `onOpenChange` sin llamar, no con el diálogo en pantalla.
 */
const meta = {
  title: 'Admin/Grilla/BookingCanteenDialog',
  component: BookingCanteenDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onOpenChange: fn(),
    bookingId: uid(1001),
    displayName: 'Marcelo Ruiz',
    listCatalogAction: fn(async (): ReturnType<ListCanteenCatalog> => ({
      success: false,
      error: 'No pudimos cargar la cantina. Revisá tu conexión.',
    })),
    sellTicketAction: fn(async (): Promise<SellTicketActionResult> => ({
      success: true,
      total: 300000,
    })),
  },
} satisfies Meta<typeof BookingCanteenDialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El catálogo no cargó: se dice por qué en vez de quedar en "Cargando…" para
 * siempre, y no se ofrece vender sobre un stock que no se conoce.
 */
export const ErrorDeCatalogo: Story = {
  play: async ({ canvasElement }) => {
    // El diálogo va a un portal fuera del canvas.
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('alert')).toHaveTextContent(/No pudimos cargar la cantina/)
    await expect(body.queryByText('Cargando cantina…')).toBeNull()
  },
}

/**
 * El MISMO error, en tema oscuro.
 *
 * Antes de esta tanda el repo no tenía UNA sola story en dark (`globals.theme`
 * quedaba siempre en 'light'), así que axe venía midiendo medio design system.
 * Y el lado sin medir era justo donde el rojo del token se cae:
 * `text-destructive` es red-600 en los dos temas, y sobre la superficie oscura
 * daba 3.87:1.
 */
export const ErrorDeCatalogoOscuro: Story = {
  ...ErrorDeCatalogo,
  globals: { theme: 'dark' },
}

const withCatalog = {
  listCatalogAction: fn(async (): ReturnType<ListCanteenCatalog> => ({
    success: true,
    products: PRODUCTS,
  })),
}

async function openDialog() {
  const dialog = await screen.findByRole('dialog')
  // Entra con una animación de opacidad: se espera a que termine.
  await waitFor(() => expect(dialog).toBeVisible())
  return within(dialog)
}

/** Espera el catálogo y agrega el primer producto al ticket. */
async function addFirstProduct(dialog: ReturnType<typeof within>) {
  const button = await dialog.findAllByRole('button', { name: new RegExp(PRODUCTS[0]!.name) })
  await userEvent.click(button[0]!)
}

/** Control de las dos historias de abajo: sin venta pendiente, Esc sí pide cerrar. */
export const EscCierraSinVentaPendiente: Story = {
  args: withCatalog,
  play: async ({ args }) => {
    const dialog = await openDialog()
    await addFirstProduct(dialog)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  },
}

/**
 * Se corta la red a mitad de un cobro: no se sabe si entró. Cerrar el diálogo lo
 * desmonta y pierde la clave de reintento — al reabrir, cobrar de nuevo duplicaría
 * venta, stock y caja. Por eso Esc no cierra hasta resolver el reintento.
 */
export const NoSeCierraConUnaVentaSinConfirmar: Story = {
  args: {
    ...withCatalog,
    sellTicketAction: fn(async (): Promise<SellTicketActionResult> => {
      throw new Error('Failed to fetch')
    }),
  },
  play: async ({ args }) => {
    const dialog = await openDialog()
    await addFirstProduct(dialog)
    await userEvent.click(dialog.getByRole('button', { name: /^Cobrar/ }))
    await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent(/no sabemos si/i))

    await userEvent.keyboard('{Escape}')
    await userEvent.click(dialog.getByRole('button', { name: 'Cerrar' }))
    await expect(args.onOpenChange).not.toHaveBeenCalled()
    await expect(dialog.getByRole('button', { name: /Reintentar cobro/ })).toBeVisible()
  },
}

/** Tocar el fondo nunca cierra: un toque de más no puede borrar un ticket armado. */
export const TocarAfueraNoCierra: Story = {
  args: withCatalog,
  play: async ({ args }) => {
    const dialog = await openDialog()
    await addFirstProduct(dialog)
    await expect(dialog.getAllByText('×1')[0]).toBeVisible()

    const overlay = document.querySelector('[data-state="open"].fixed.inset-0')
    if (!(overlay instanceof HTMLElement)) throw new Error('no se encontró el overlay del diálogo')
    await userEvent.click(overlay, { pointerEventsCheck: 0 })

    await expect(args.onOpenChange).not.toHaveBeenCalled()
    await expect(dialog.getAllByText('×1')[0]).toBeVisible()
  },
}
