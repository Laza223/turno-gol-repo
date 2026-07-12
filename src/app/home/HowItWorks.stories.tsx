import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HowItWorks } from './HowItWorks'

/**
 * 100% estática (3 pasos fijos, sin props) — un único estado real.
 *
 * `.card-ghost-number` es el numeral gigante ("01"/"02"/"03") que decora cada
 * card de fondo: `text-foreground/[.05]` (5% de opacidad, ~1.11:1 sobre blanco)
 * y `aria-hidden="true"`. axe igual lo mide como texto (aria-hidden no lo saca
 * del chequeo de contraste, que es sobre percepción visual, no sobre el árbol
 * de accesibilidad). Es un watermark decorativo — texto "incidental" bajo la
 * excepción de WCAG 1.4.3 (texto que es puramente decoración y no transmite
 * información) — no un bug de legibilidad: si se le sube el contraste deja de
 * ser un watermark sutil y pasa a competir con el título real de la card.
 * Excluido puntualmente de ESTA story, no de la regla global.
 */
const meta = {
  title: 'Public/Landing/HowItWorks',
  component: HowItWorks,
  parameters: {
    layout: 'fullscreen',
    a11y: { context: { exclude: [['.card-ghost-number']] } },
  },
  decorators: [
    (Story) => (
      <div className="landing-hero min-h-dvh text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HowItWorks>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
