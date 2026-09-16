import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { abonado, abonadoCanceled, abonadoPaused, abonados } from '@/test/fixtures'
import { AbonadosList } from './AbonadosList'

/**
 * reactivateAction/cancelAction/previewSlotsAction llegan por prop (ver el
 * comentario en AbonadosList.tsx): './actions' y './nuevo/actions' son
 * `'use server'`.
 */
const meta = {
  title: 'Admin/Abonados/AbonadosList',
  component: AbonadosList,
  parameters: { layout: 'padded' },
  args: {
    abonados: abonados(),
    reactivateAction: fn(async () => ({
      success: true as const,
      abonado: abonado(),
      slotsGenerated: 8,
    })),
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

    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar turno fijo' }))
    const confirmBtn = await body.findByRole('button', { name: 'Cancelar turno fijo' })
    await expect(confirmBtn).toBeDisabled()

    await userEvent.type(body.getByLabelText(/escribí/i), 'CANCELAR')
    await expect(confirmBtn).toBeEnabled()
  },
}
