import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SettingsTabs } from './SettingsTabs'

/**
 * Tab bar única de /settings, compartida por las 4 páginas de Configuración.
 * Cada página real la renderiza justo debajo de un `<h1>Configuración</h1>`;
 * se reproduce ese título para fijar el ancho y el contexto visual real.
 */
const meta = {
  title: 'Admin/Settings/SettingsTabs',
  component: SettingsTabs,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsTabs>

export default meta
type Story = StoryObj<typeof meta>

export const Perfil: Story = { args: { active: '/settings/perfil' } }
export const Reservas: Story = { args: { active: '/settings/reservas' } }
export const Horarios: Story = { args: { active: '/settings/horarios' } }
export const Facturacion: Story = { args: { active: '/settings/facturacion' } }
export const Avisos: Story = { args: { active: '/settings/avisos' } }
