import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Logo } from './logo'

/**
 * Logotipo "TURNOGOL" (Archivo 900 itálica; el isotipo TG es `LogoMark`). Aparece en el header/footer
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

/** `icon`: el isotipo TG (SVG de la marca), para espacios angostos como el riel del panel. */
export const Icono: Story = { args: { variant: 'icon' } }
