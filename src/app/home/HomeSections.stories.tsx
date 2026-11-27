import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { withHome } from '../../../.storybook/decorators/with-home'
import { ClosingCta } from './ClosingCta'
import { ReservaDibujo } from './ReservaDibujo'
import { RivalSection } from './RivalSection'

/**
 * Las secciones de la home debajo del hero: la ficha dibujada, Rival (solo con el flag `rival`) y
 * el cierre para complejos. Los dibujos llevan la etiqueta "Ejemplo" y el lector de pantalla oye
 * solo su descripción.
 */
const meta = {
  title: 'Public/Landing/Secciones',
  parameters: { layout: 'fullscreen' },
  decorators: [withHome],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const CELU = { viewport: { value: 'mobile-primary', isRotated: false } }
const COMPU = { viewport: { value: 'desktop', isRotated: false } }

/** Fecha fija: la fila de días sale de "hoy" y la story tiene que dar siempre lo mismo. */
const HOY = '2026-11-14'

export const ReservaEnUnaPantalla: Story = {
  globals: CELU,
  render: () => <ReservaDibujo today={HOY} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Reservás en una pantalla.',
    )
    await expect(
      canvas.getByRole('img', { name: /^Ejemplo de la página de un complejo/ }),
    ).toBeVisible()
    await expect(canvas.getByText('Ejemplo')).toBeVisible()
  },
}

export const ReservaEnUnaPantallaCompu: Story = {
  globals: COMPU,
  render: () => <ReservaDibujo today={HOY} />,
}

export const Rival: Story = {
  globals: CELU,
  render: () => <RivalSection />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: 'Ver partidos abiertos' })
    await expect(link).toHaveAttribute('href', '/rival')
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await expect(canvas.getByRole('img', { name: /^Ejemplo de RIVAL/ })).toBeVisible()
  },
}

export const RivalCompu: Story = {
  globals: COMPU,
  render: () => <RivalSection />,
}

export const CierreParaComplejos: Story = {
  globals: CELU,
  render: () => <ClosingCta />,
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: 'Ver TurnoGol para complejos' })
    await expect(link).toHaveAttribute('href', '/para-complejos')
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  },
}

export const CierreParaComplejosCompu: Story = {
  globals: COMPU,
  render: () => <ClosingCta />,
}
