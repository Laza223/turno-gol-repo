import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { InviteStaffButton } from './InviteStaffButton'

/**
 * En la página real (equipo/page.tsx) el botón cuelga del prop `actions` de
 * `SettingsTabs`, que lo porta a `AdminHeaderSlot` — el hueco de la barra
 * superior de 60px (`bg-card`, MASTER §6.8), no un `PageHeader`. Ese patrón
 * de contenedor se cayó cuando la vista migró al armazón nuevo (rediseño de
 * Configuración, 2026-09); se reproduce acá como una barra liviana en vez del
 * portal real (Storybook no monta `#admin-header-slot`).
 */
const meta = {
  title: 'Admin/Staff/InviteStaffButton',
  component: InviteStaffButton,
  parameters: { layout: 'padded' },
  args: {
    inviteAction: fn(async () => ({ success: true as const })),
  },
  decorators: [
    (Story) => (
      <div className="flex h-[60px] items-center gap-3 border-b border-border bg-card px-4">
        <span className="min-w-0 flex-1" />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InviteStaffButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Empty state (staff/page.tsx): label override para no repetir el texto del botón del PageHeader. */
export const LabelDeEmptyState: Story = {
  args: { label: 'Invitar al primer miembro' },
}

export const AbreElDialogo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /agregar miembro del equipo/i }))
    // InviteStaffDialog es un dynamic(ssr:false): findByRole espera el chunk async.
    await expect(
      await within(document.body).findByRole('heading', { name: /invitar miembro del equipo/i }),
    ).toBeInTheDocument()
  },
}
