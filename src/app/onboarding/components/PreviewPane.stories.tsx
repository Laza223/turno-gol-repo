import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PreviewPane } from './PreviewPane'

function Contenido() {
  return (
    <div className="card-premium rounded-2xl p-4">
      <p className="text-sm text-foreground">Contenido de ejemplo</p>
    </div>
  )
}

/**
 * `children` se renderiza dos veces a propósito (aside desktop / barra
 * mobile) — mismo patrón que el indicador de progreso de `WizardShell`. La
 * barra mobile es `lg:hidden`: viewport mobile forzado, porque en el canvas
 * ancho de Storybook `getByRole('button')` no la encontraría (oculta por
 * `display:none` al breakpoint desktop — no es solo CSS, sale del árbol de
 * accesibilidad).
 */
const meta = {
  title: 'Onboarding/PreviewPane',
  component: PreviewPane,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile-primary' },
  },
  args: { title: 'Tu complejo', children: <Contenido /> },
} satisfies Meta<typeof PreviewPane>

export default meta
type Story = StoryObj<typeof meta>

/** Barra mobile colapsada por defecto: no le tapa el form a nadie sin que lo pida. */
export const ColapsadaPorDefecto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: /tu complejo/i })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  },
}

/** Tocar la barra la expande: el contenido pasa a estar a la vista. */
export const Expandida: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: /tu complejo/i })
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  },
}
