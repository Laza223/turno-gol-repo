import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
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
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Julián Álvarez')).toBeVisible()
    await expect(canvas.getAllByText('Activo').length).toBeGreaterThan(0)
    await expect(canvas.getByText('Pausado')).toBeVisible()
    await expect(canvas.getByText('Cancelado')).toBeVisible()
  },
}

export const ListaVacia: Story = {
  args: { abonados: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin abonados registrados')).toBeVisible()
  },
}

export const ListaVaciaConFiltro: Story = {
  args: { abonados: [], filterLabel: 'pausados' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin abonados pausados')).toBeVisible()
  },
}

/** Pausar un abonado activo: confirmar dispara pauseAction y muestra el toast. */
export const PausarAbonado: Story = {
  args: { abonados: [abonado()] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Pausar' }))
    await userEvent.click(await body.findByRole('button', { name: 'Pausar' }))

    await expect(args.pauseAction).toHaveBeenCalledWith(abonado().id)
    await expect(await body.findByText('Abonado pausado correctamente.')).toBeVisible()
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
    await expect(await body.findByText(/se generarán 2 turnos/i)).toBeVisible()
    await expect(body.getByText('Ocupado')).toBeVisible()
  },
}

/** Cancelar exige escribir la frase de confirmación antes de habilitar el botón. */
export const CancelarRequierePhrase: Story = {
  args: { abonados: [abonado()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    const confirmBtn = await body.findByRole('button', { name: 'Cancelar abonado' })
    await expect(confirmBtn).toBeDisabled()

    await userEvent.type(body.getByLabelText(/escribí/i), 'CANCELAR')
    await expect(confirmBtn).toBeEnabled()
  },
}
