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
 * `children` se renderiza dos veces a propósito (aside desktop / Sheet
 * mobile) — mismo patrón que el indicador de progreso de `WizardShell`. El
 * botón mobile es `lg:hidden`: viewport mobile forzado, porque en el canvas
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

/** Mobile: solo el botón; la vista previa no está montada hasta pedirla. */
export const BotonCerrado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /ver vista previa/i })).toBeVisible()
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  },
}

/** Tocar el botón abre el Sheet inferior con el título y el contenido. */
export const SheetAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /ver vista previa/i }))
    const dialog = await within(document.body).findByRole('dialog', { name: /tu complejo/i })
    await expect(within(dialog).getByText('Contenido de ejemplo')).toBeVisible()
  },
}
