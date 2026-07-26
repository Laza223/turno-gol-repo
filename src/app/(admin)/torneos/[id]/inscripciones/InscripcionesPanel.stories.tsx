import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { inscriptionRows } from '@/test/fixtures'
import { InscripcionesPanel } from './InscripcionesPanel'
import type { TournamentActionResult } from '../../actions'

const ok = () => fn(async (): Promise<TournamentActionResult> => ({ success: true }))

const meta = {
  title: 'Admin/Torneos/InscripcionesPanel',
  component: InscripcionesPanel,
  parameters: { layout: 'padded' },
  args: { rows: inscriptionRows(), registerAction: ok() },
} satisfies Meta<typeof InscripcionesPanel>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Los tres estados de cobro conviven en la misma lista.
 *
 * Los montos se matchean con regex: `formatArs` (el de `@/lib/format`, el
 * mismo que usa Caja) mete un espacio duro entre el signo y el número.
 */
export const ConDeuda: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Pagado')).toBeVisible()
    await expect(canvas.getByText(/Debe\s\$\s?25\.000/)).toBeVisible()
    await expect(canvas.getByText(/Debe\s\$\s?45\.000/)).toBeVisible()
    // Total a cobrar / cobrado / pendiente.
    await expect(canvas.getByText(/^\$\s?135\.000$/)).toBeVisible()
    await expect(canvas.getByText(/^\$\s?65\.000$/)).toBeVisible()
    await expect(canvas.getByText(/^\$\s?70\.000$/)).toBeVisible()
  },
}

/** Al que ya pagó no se le puede volver a cobrar. */
export const PagadoNoSeCobra: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const buttons = canvas.getAllByRole('button', { name: /cobrar/i })
    await expect(buttons[0]).toBeDisabled()
    await expect(buttons[1]).toBeEnabled()
  },
}

/** El formulario se abre con el saldo pendiente ya cargado. */
export const FormularioPrecargado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: /cobrar/i })[1]!)
    // $25.000 pendientes → 25000 en el input (pesos, no centavos).
    await expect(await canvas.findByLabelText('Monto')).toHaveValue('25000')
    await expect(canvas.getByRole('button', { name: 'Efectivo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** El error del servidor se muestra arriba y el formulario queda abierto. */
export const ErrorDelServidor: Story = {
  args: {
    registerAction: fn(
      async (): Promise<TournamentActionResult> => ({
        success: false,
        error: 'La caja de hoy ya fue cerrada. Registrá el cobro mañana o como ajuste en Caja.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: /cobrar/i })[1]!)
    await userEvent.click(await canvas.findByRole('button', { name: /registrar cobro/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/caja de hoy ya fue cerrada/i)
  },
}

/** Un torneo sin arancel: se ven los equipos pero no hay nada que cobrar. */
export const SinArancel: Story = {
  args: {
    rows: inscriptionRows().map((r) => ({ ...r, fee: 0, paid: 0, pending: 0, payments: 0 })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Sin arancel')).toHaveLength(3)
    for (const b of canvas.getAllByRole('button', { name: /cobrar/i })) {
      await expect(b).toBeDisabled()
    }
  },
}

export const Vacio: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay equipos anotados.')).toBeVisible()
  },
}
