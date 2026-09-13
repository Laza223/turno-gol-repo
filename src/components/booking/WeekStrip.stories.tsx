import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { WeekStrip } from './WeekStrip'

/**
 * Tira semanal de navegación de la grilla. Vive en la barra superior del panel,
 * dentro de `GridHeaderBar`; acá se reproduce sola porque no depende de ningún
 * estilo del padre para verse completa.
 */
const meta = {
  title: 'Booking/Grid/WeekStrip',
  component: WeekStrip,
  parameters: { layout: 'padded' },
  args: {
    date: '2026-03-14', // sábado — FROZEN_NOW
    todayArt: '2026-03-14',
    onNavigate: fn(),
  },
} satisfies Meta<typeof WeekStrip>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El día seleccionado ES hoy: un solo chip lleva el fondo `bg-primary`. La
 * tira muestra 2 días antes del seleccionado (jue 12, vie 13) y el resto
 * adelante — nunca la semana calendario completa (antes arrancaba en lunes).
 */
export const HoySeleccionado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /Jue 12/ })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /Mié 18/ })).toBeInTheDocument()
    // Nada de lunes 9: esa semana calendario ya no se dibuja entera.
    await expect(canvas.queryByRole('button', { name: /Lun 9/ })).not.toBeInTheDocument()
  },
}

/** Se navegó a otro día: hoy queda marcado con el anillo, sin ser el seleccionado. */
export const OtroDiaSeleccionado: Story = {
  // domingo 15: con "2 días antes" la tira arranca el viernes 13 y el hoy (sáb 14) sigue visible.
  args: { date: '2026-03-15' },
}

/** `todayArt=''` — SSR antes de hidratar useArtNow(): ningún chip lleva el marcador "(hoy)". */
export const PreHidratacion: Story = {
  args: { todayArt: '' },
}

export const NavegarSemana: Story = {
  name: 'Chevron siguiente navega +7 días',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Semana siguiente' }))
    await expect(args.onNavigate).toHaveBeenCalledWith('2026-03-21')
  },
}

export const ClickEnDia: Story = {
  name: 'Click en un día de la tira navega a esa fecha',
  // Default '2026-03-14' (sábado): la tira arranca 2 días antes (jue 12), así
  // que el lunes 16 ya entra sin mover `date`.
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Lun 16/ }))
    await expect(args.onNavigate).toHaveBeenCalledWith('2026-03-16')
  },
}

/** El ícono de calendario abre un mini-calendario para saltar a cualquier fecha, sin repetir el chevron. */
export const AbrirCalendario: Story = {
  name: 'Ícono de calendario abre el mes y salta de fecha',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Elegir fecha' }))
    // El panel (PopoverContent) va portaled a document.body.
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByText('marzo de 2026')).toBeVisible())
    await userEvent.click(body.getByRole('button', { name: 'Mes siguiente' }))
    await waitFor(() => expect(body.getByText('abril de 2026')).toBeVisible())
    await userEvent.click(body.getByRole('button', { name: '10' }))
    await expect(args.onNavigate).toHaveBeenCalledWith('2026-04-10')
    // Elegir un día cierra el panel.
    await waitFor(() => expect(body.queryByText('abril de 2026')).not.toBeInTheDocument())
  },
}
