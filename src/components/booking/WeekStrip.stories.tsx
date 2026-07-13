import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { WeekStrip } from './WeekStrip'

/**
 * Tira semanal de navegación de la grilla. Vive dentro de GridToolbar (que le
 * da el `space-y-3` alrededor); acá se reproduce sola porque no depende de
 * ningún estilo del padre para verse completa.
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

/** El día seleccionado ES hoy: un solo chip lleva el fondo `bg-primary`. */
export const HoySeleccionado: Story = {}

/** Se navegó a otro día de la misma semana: hoy queda marcado con el anillo, sin ser el seleccionado. */
export const OtroDiaSeleccionado: Story = {
  args: { date: '2026-03-17' }, // martes de la misma semana
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
  // Semana del 2026-03-21 (sábado, misma semana-day-of-week que FROZEN_NOW):
  // su lunes es el 16 — con el default '2026-03-14' (lunes 9) el botón "Lun 16"
  // no existe en la tira y el getByRole nunca matchea.
  args: { date: '2026-03-21' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Lun 16/ }))
    await expect(args.onNavigate).toHaveBeenCalledWith('2026-03-16')
  },
}
