import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { expectGone } from '@/test/expect-gone'
import { abonado, abonadoCanceled, abonadoPaused, abonados } from '@/test/fixtures'
import { AbonadosList } from './AbonadosList'

/**
 * pauseAction/reactivateAction/cancelAction/previewSlotsAction llegan por
 * prop (ver el comentario en AbonadosList.tsx): './actions' y
 * './nuevo/actions' son `'use server'`.
 */
const meta = {
  title: 'Admin/Abonados/AbonadosList',
  component: AbonadosList,
  parameters: { layout: 'padded' },
  args: {
    abonados: abonados(),
    pauseAction: fn(async () => ({ success: true as const, abonado: abonado() })),
    reactivateAction: fn(async () => ({ success: true as const, abonado: abonado(), slotsGenerated: 8 })),
    cancelAction: fn(async () => ({ success: true as const, abonado: abonadoCanceled() })),
    previewSlotsAction: fn(async () => ({
      success: true as const,
      dates: ['2026-03-17', '2026-03-24', '2026-03-31'],
      conflicts: [],
    })),
  },
} satisfies Meta<typeof AbonadosList>

export default meta
type Story = StoryObj<typeof meta>

export const ConAbonados: Story = {
  play: async ({ canvasElement }) => {
    // ResponsiveList (regla del propio componente) mantiene tabla Y cards
    // montadas a la vez — CSS decide cuál se ve, pero getByText no filtra por
    // visibilidad. Acotamos a la tabla (primera en el DOM, la visible en este
    // viewport) para no chocar con la card duplicada.
    const table = within(within(canvasElement).getByRole('table'))
    await expect(table.getByText('Julián Álvarez')).toBeVisible()
    await expect(table.getAllByText('Activo').length).toBeGreaterThan(0)
    await expect(table.getByText('Pausado')).toBeVisible()
    await expect(table.getByText('Cancelado')).toBeVisible()
  },
}

export const ListaVacia: Story = {
  args: { abonados: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin turnos fijos registrados')).toBeVisible()
  },
}

export const ListaVaciaConFiltro: Story = {
  args: { abonados: [], filterLabel: 'pausados' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin turnos fijos pausados')).toBeVisible()
  },
}

/** Pausar un abonado activo: confirmar dispara pauseAction y muestra el toast. */
export const PausarAbonado: Story = {
  args: { abonados: [abonado()] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Pausar' }))
    // El diálogo confirma con un botón que se llama IGUAL que el trigger de la
    // fila ("Pausar"): esperar el dialog y clickear DENTRO de él evita que
    // findByRole agarre el trigger de vuelta (que además queda disabled con el
    // dialog abierto, pero eso no lo saca del accessibility tree). AbonadoDialogs
    // entra por next/dynamic: timeout largo para no flakear bajo carga (batería
    // completa de stories, chunk más lento de cargar).
    const dialog = within(await body.findByRole('dialog', {}, { timeout: 15_000 }))
    await waitFor(() => expect(dialog.getByRole('heading', { name: 'Pausar turno fijo' })).toBeVisible())
    await userEvent.click(dialog.getByRole('button', { name: 'Pausar' }))

    await expect(args.pauseAction).toHaveBeenCalledWith(abonado().id)
    const toastText = await body.findByText('Abonado pausado correctamente.')
    await expect(toastText).toBeVisible()
    // El toast (variant success, 4s de duración) sobrevive al cambio de story:
    // cerrarlo acá evita que la siguiente story lo agarre a mitad de la
    // animación de salida (color transitorio => falso positivo de axe).
    await userEvent.click(body.getByRole('button', { name: 'Cerrar' }))
    await expectGone(() => body.queryByText('Abonado pausado correctamente.'))
  },
}

/** Reactivar un pausado: carga el preview de fechas y muestra libres/ocupadas. */
export const ReactivarConVistaPrevia: Story = {
  args: {
    abonados: [abonadoPaused()],
    previewSlotsAction: fn(async () => ({
      success: true as const,
      dates: ['2026-03-16', '2026-03-23', '2026-03-30'],
      conflicts: ['2026-03-23'],
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Reactivar' }))
    // AbonadoDialogs entra por next/dynamic: timeout largo (ver comentario en
    // "Pausar Abonado").
    const dialog = within(await body.findByRole('dialog', {}, { timeout: 15_000 }))
    // El "2" va en un <strong> aparte: getByText por defecto solo mira los text
    // nodes DIRECTOS de un elemento (no agrega texto de hijos), así que hay que
    // matchear el inicio y verificar el contenido completo con toHaveTextContent.
    await waitFor(() => expect(dialog.getByText(/se generarán/i)).toBeVisible())
    await expect(dialog.getByText(/se generarán/i)).toHaveTextContent(
      'Se generarán 2 turnos futuros (1 fecha ya ocupada se va a saltar).',
    )
    await expect(dialog.getByText('Ocupado')).toBeVisible()
  },
}

/** Cancelar exige escribir la frase de confirmación antes de habilitar el botón. */
export const CancelarRequierePhrase: Story = {
  args: { abonados: [abonado()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const confirmBtn = await body.findByRole('button', { name: 'Cancelar turno fijo' })
    await expect(confirmBtn).toBeDisabled()

    await userEvent.type(body.getByLabelText(/escribí/i), 'CANCELAR')
    await expect(confirmBtn).toBeEnabled()
  },
}
