import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures'
import { OpenDayCard } from './OpenDayCard'
import type { OpenDayActionResult } from '../actions'

/**
 * openDayAction es UPSERT (migr. 049): el mismo diálogo sirve para "Abrir
 * caja" (sin fila previa) y "Corregir" el fondo (fila existente) — dos
 * stories, un componente. Radix Dialog porta a `document.body` (regla 2).
 */
const meta = {
  title: 'Admin/Caja/OpenDayCard',
  component: OpenDayCard,
  parameters: { layout: 'padded' },
  args: {
    date: artDateString(),
    open: null,
    openDayAction: fn(
      async (): Promise<OpenDayActionResult> => ({ success: true, openingCash: 100000 }),
    ),
  },
} satisfies Meta<typeof OpenDayCard>

export default meta
type Story = StoryObj<typeof meta>

/** Sin apertura previa: card discreta invita a declarar el fondo inicial. */
export const SinApertura: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¿Con cuánto efectivo arranca el día?')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Abrir caja' })).toBeVisible()
  },
}

/** Abrir caja: completa el fondo, guarda, y dispara la action con los centavos redondeados. */
export const AbrirCaja: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir caja' }))

    const dialog = within(await body.findByRole('dialog'))
    await waitFor(() => expect(dialog.getByLabelText(/fondo inicial/i)).toBeVisible())
    await userEvent.type(dialog.getByLabelText(/fondo inicial/i), '1000')
    await userEvent.click(dialog.getByRole('button', { name: 'Abrir caja' }))

    await expect(args.openDayAction).toHaveBeenCalledWith({
      date: args.date,
      openingCash: 100000,
      note: undefined,
    })
    await waitFor(() => expect(body.getByText(/Caja abierta/)).toBeVisible())
  },
}

/** Monto vacío: error inline, sin llamar la action (acepta 0, pero no vacío). */
export const MontoVacio: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir caja' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Abrir caja' }))

    await expect(await dialog.findByRole('alert')).toHaveTextContent(/monto válido/i)
    await expect(args.openDayAction).not.toHaveBeenCalled()

    // Cerrar el diálogo antes del afterEach de axe: en batch, un portal Radix
    // abierto se apila con el de la story siguiente y axe mide contraste
    // contra el overlay (falso positivo; la story aislada pasa).
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() =>
      expect(body.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  },
}

/** Con apertura ya guardada: la card muestra el fondo + nota, y "Corregir" precarga el mismo diálogo. */
export const ConApertura: Story = {
  args: {
    open: {
      id: 'open-1',
      tenantId: 't-1',
      date: new Date(),
      openingCash: 500000,
      note: 'Vuelto del día anterior',
      openedBy: 's-1',
      openedAt: new Date(),
      updatedAt: new Date(),
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await expect(canvas.getByText(/Fondo inicial:/)).toBeVisible()
    await expect(canvas.getByText('$ 5.000,00')).toBeVisible()
    await expect(canvas.getByText('Vuelto del día anterior')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Corregir' }))
    const dialog = within(await body.findByRole('dialog'))
    // Radix anima la entrada (fade-in ~200ms): esperar a que asiente antes de
    // chequear visibilidad, si no toBeVisible() puede pescar opacity en 0.
    await waitFor(() => expect(body.getByRole('heading', { name: /Corregir fondo del/ })).toBeVisible())
    await waitFor(() => expect(dialog.getByLabelText(/fondo inicial/i)).toHaveValue('5.000'))
    await expect(dialog.getByLabelText(/nota/i)).toHaveValue('Vuelto del día anterior')

    await userEvent.clear(dialog.getByLabelText(/fondo inicial/i))
    await userEvent.type(dialog.getByLabelText(/fondo inicial/i), '6000')
    await userEvent.click(dialog.getByRole('button', { name: 'Guardar' }))

    await expect(args.openDayAction).toHaveBeenCalledWith({
      date: args.date,
      openingCash: 600000,
      note: 'Vuelto del día anterior',
    })
    await waitFor(() => expect(body.getByText('Fondo actualizado')).toBeVisible())
  },
}

/** La action rechaza (ej. día ya cerrado): mensaje inline, el diálogo sigue abierto. */
export const ErrorDeServidor: Story = {
  args: {
    openDayAction: fn(
      async (): Promise<OpenDayActionResult> => ({ success: false, error: 'Ese día ya está cerrado.' }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir caja' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.type(dialog.getByLabelText(/fondo inicial/i), '1000')
    await userEvent.click(dialog.getByRole('button', { name: 'Abrir caja' }))

    await expect(await dialog.findByRole('alert')).toHaveTextContent(/ya está cerrado/i)

    // Mismo cierre que MontoVacio: portal abierto + batch = falso positivo de axe.
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() =>
      expect(body.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  },
}
