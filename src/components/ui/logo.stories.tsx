import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Logo } from './logo'

/**
 * Wordmark de texto puro (sin SVG ni imagen). Aparece en el header/footer
 * públicos y en el nav admin/jugador — todos sobre superficies claras u
 * oscuras según el tema activo, resuelto por los tokens `text-foreground` /
 * `emerald-700 dark:emerald-400`, así que no necesita un contenedor especial.
 */
const meta = {
  title: 'Design System/Logo',
  component: Logo,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Logo>

export default meta
type Story = StoryObj<typeof meta>

export const Horizontal: Story = { args: { variant: 'horizontal' } }

export const Vertical: Story = { args: { variant: 'vertical' } }

/** `icon`/`vector`: solo las iniciales "TG", para espacios angostos (favicon-like, nav colapsado). */
export const Icono: Story = { args: { variant: 'icon' } }
