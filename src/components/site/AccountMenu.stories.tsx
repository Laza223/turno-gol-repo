import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { withPortalGlass } from '../../../.storybook/decorators/with-portal-glass'
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
  decorators: [withPortalGlass()],
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

/** El chip de la cuenta dentro de la píldora de la cabecera, sobre una foto. */
export const Default: Story = {}

export const ConAvatar: Story = {
  args: { avatarUrl: '/bg-owner.png' },
}

export const MenuAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El chip de la cuenta mide 44 px de alto.
    const disparador = canvas.getByRole('button', { name: 'Cuenta de Tomás' })
    await expect(disparador.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await userEvent.click(disparador)
    const body = within(canvasElement.ownerDocument.body)
    // Popover (no DropdownMenu): los items son links/botones normales, no
    // `menuitem` — ver el comentario en AccountMenu.tsx. `waitFor` porque el
    // panel recién montado puede seguir a mitad de la animación `animate-in`.
    await waitFor(() => expect(body.getByRole('link', { name: /mis reservas/i })).toBeVisible())
    await expect(body.getByRole('link', { name: /cuenta/i })).toBeVisible()
    await expect(body.getByText('Tema')).toBeVisible()
    // El ThemeToggle del menú es el de vidrio: segmentos de 44 px; "Tema" sin mayúsculas y el correo en 13 px o más.
    for (const radio of body.getAllByRole('radio')) {
      await expect(radio.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
    await expect(getComputedStyle(body.getByText('Tema')).textTransform).toBe('none')
    await expect(
      parseFloat(getComputedStyle(body.getByText('tomas.ibanez@example.com')).fontSize),
    ).toBeGreaterThanOrEqual(13)
    // Cada ítem mide 44 px y los destinos son los de siempre.
    for (const item of [
      body.getByRole('link', { name: /mis reservas/i }),
      body.getByRole('link', { name: /cuenta/i }),
      body.getByRole('button', { name: 'Salir' }),
    ]) {
      await expect(item.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
  },
}
