import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AccountMenu } from './AccountMenu'

/**
 * `signOutAction` entra por prop (ver el comentario en AccountMenu.tsx):
 * `@/modules/auth/sign-out.action` es `'use server'` y arrastra el cliente de
 * Supabase, lo que rompe el bundle de browser de Storybook. `ThemeToggle`
 * embebido usa `useTheme()` — cubierto por el `NextThemeProvider` global del
 * preview (ver ThemeToggle.stories.tsx).
 */
const meta = {
  title: 'Player/AccountMenu',
  component: AccountMenu,
  parameters: { layout: 'centered' },
  args: {
    firstName: 'Tomás',
    lastName: 'Ibáñez',
    email: 'tomas.ibanez@example.com',
    avatarUrl: null,
    signOutAction: fn(async () => {}),
  },
} satisfies Meta<typeof AccountMenu>

export default meta
type Story = StoryObj<typeof meta>

export const VariantSolid: Story = {}

export const VariantOverlay: Story = {
  args: { variant: 'overlay' },
  decorators: [
    (Story) => (
      <div className="rounded-full bg-slate-950 p-4">
        <Story />
      </div>
    ),
  ],
}

export const ConAvatar: Story = {
  args: { avatarUrl: '/bg-owner.png' },
}

export const MenuAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cuenta de Tomás' }))
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('menuitem', { name: /mis reservas/i })).toBeVisible()
    await expect(body.getByRole('menuitem', { name: /cuenta/i })).toBeVisible()
    await expect(body.getByText('Tema')).toBeVisible()
  },
}
