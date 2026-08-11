import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { TorneoForm } from './TorneoForm'
import type { TournamentActionResult } from '../actions'

const meta = {
  title: 'Admin/Torneos/TorneoForm',
  component: TorneoForm,
  parameters: { layout: 'padded' },
  args: {
    action: fn(async (): Promise<TournamentActionResult> => ({
      success: true,
      id: 'nuevo-torneo',
    })),
  },
} satisfies Meta<typeof TorneoForm>

export default meta
type Story = StoryObj<typeof meta>

/** Alta vacía: el botón arranca deshabilitado hasta que hay nombre. */
export const Vacio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /crear torneo/i })).toBeDisabled()
    // El default es 60 min = un partido por hora.
    await expect(canvas.getByLabelText(/duración de cada partido/i)).toHaveValue('60 minutos')
  },
}

/** Con el nombre cargado ya se puede crear. */
export const Completado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/nombre del torneo/i), 'Clausura 2026')
    await expect(canvas.getByRole('button', { name: /crear torneo/i })).toBeEnabled()
  },
}

/**
 * El cupo se protege con las restricciones NATIVAS del input (`type="number"`),
 * que son las que efectivamente frenan al usuario: el navegador bloquea el
 * submit antes de que corra la validación JS del componente (esa queda como
 * defensa, igual que el Zod de la Server Action y el CHECK de la DB).
 *
 * "Inscripción por equipo" NO comparte ese mecanismo: usa `MoneyInput`
 * (`src/components/ui/money-input.tsx`), que es `type="text"` a propósito
 * (formatea con separador de miles mientras se tipea) — nunca tiene un
 * atributo `min`/`max` nativo, ni siquiera cuando el caller le pasa
 * `minCents`/`maxCents` (esos solo alimentan el clamp on-blur en JS). Acá
 * `TorneoForm` ni le pasa `minCents`, así que no hay nada nativo que
 * consultar; el `toHaveAttribute('min', '0')` original testeaba un mecanismo
 * que este campo no tiene.
 */
export const RestriccionesNumericas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cupo = canvas.getByLabelText(/cupo de equipos/i)
    await expect(cupo).toHaveAttribute('min', '2')
    await expect(cupo).toHaveAttribute('max', '256')
  },
}

/** Error devuelto por el servidor (ej. el flag apagado para el complejo). */
export const ErrorDelServidor: Story = {
  args: {
    action: fn(async (): Promise<TournamentActionResult> => ({
      success: false,
      error: 'El módulo de Torneos no está habilitado en este complejo.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/nombre del torneo/i), 'Clausura 2026')
    await userEvent.click(canvas.getByRole('button', { name: /crear torneo/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/no está habilitado/i)
  },
}
