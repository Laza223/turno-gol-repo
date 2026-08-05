import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { uid } from '@/test/fixtures'
import { AbonadoDialogs } from './AbonadoDialogs'

/**
 * Los 3 diálogos de acción de un abonado (pausar/reactivar/cancelar). Radix
 * Dialog porta el contenido a `document.body` con su propia superficie
 * (`bg-popover/95`), así que no depende del fondo de la página que lo abre —
 * no hace falta reproducir un contenedor especial acá (regla 2).
 */
const meta = {
  title: 'Admin/Abonados/AbonadoDialogs',
  component: AbonadoDialogs,
  parameters: { layout: 'padded' },
  args: {
    abonadoId: uid(501),
    dialog: null,
    cancelFromDate: '2026-03-21',
    onCancelFromDateChange: fn(),
    reactivatePreviewLoading: false,
    reactivatePreviewDates: [],
    reactivatePreviewConflicts: [],
    reactivatePreviewError: null,
    onClose: fn(),
    onConfirmPause: fn(async () => ({ success: true })),
    onConfirmReactivate: fn(async () => ({ success: true })),
    onConfirmCancel: fn(async () => ({ success: true })),
  },
} satisfies Meta<typeof AbonadoDialogs>

export default meta
type Story = StoryObj<typeof meta>

export const Pause: Story = {
  args: { dialog: 'pause' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    // El diálogo arranca abierto (args.dialog='pause' desde el mount, sin click
    // que dispare el delay natural del userEvent): la animación de entrada de
    // Radix (fade-in, ~200ms) todavía puede estar en curso cuando arranca el
    // play, así que hay que esperar a que termine antes de medir visibilidad.
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: 'Pausar turno fijo' })).toBeVisible(),
    )
    await expect(canvas.getByRole('button', { name: 'Pausar' })).toBeEnabled()
  },
}

export const ReactivateLoading: Story = {
  args: { dialog: 'reactivate', reactivatePreviewLoading: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    // Mismo motivo que "Pause": el diálogo arranca abierto sin click que dispare
    // el delay natural del userEvent, así que la animación de entrada de Radix
    // (fade-in, ~200ms) puede seguir en curso cuando arranca el play.
    await waitFor(() => expect(canvas.getByText('Cargando fechas disponibles…')).toBeVisible())
  },
}

export const ReactivateWithConflicts: Story = {
  args: {
    dialog: 'reactivate',
    reactivatePreviewDates: ['2026-03-17', '2026-03-24', '2026-03-31', '2026-04-07'],
    reactivatePreviewConflicts: ['2026-03-24'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    // toBeVisible() (no toHaveTextContent, que ignora opacidad) es lo que de
    // verdad consume la ventana de la animación de entrada.
    await waitFor(() => expect(canvas.getByText('Ocupado')).toBeVisible())
    await expect(canvas.getByText(/se generarán/i)).toHaveTextContent(
      'Se generarán 3 turnos futuros (1 fecha ya ocupada se va a saltar).',
    )
    await expect(canvas.getAllByText('Libre')).toHaveLength(3)
  },
}

export const ReactivateError: Story = {
  args: {
    dialog: 'reactivate',
    reactivatePreviewError: 'No se pudo conectar con el servidor.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/no se pudo conectar/i)
  },
}

/** Sin fechas futuras a generar (ej. el abonado ya venció). */
export const ReactivateNoSlots: Story = {
  args: { dialog: 'reactivate', reactivatePreviewDates: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(canvas.getByText(/no se encontraron fechas futuras/i)).toBeVisible())
  },
}

/** El botón "Cancelar turno fijo" queda deshabilitado hasta tipear la frase exacta. */
export const CancelRequiresPhrase: Story = {
  args: { dialog: 'cancel' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    const confirmBtn = canvas.getByRole('button', { name: 'Cancelar turno fijo' })
    await expect(confirmBtn).toBeDisabled()

    await userEvent.type(canvas.getByLabelText(/escribí/i), 'CANCELAR')
    await expect(confirmBtn).toBeEnabled()
  },
}
