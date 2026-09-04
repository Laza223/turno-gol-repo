import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import FavoriteButton from './FavoriteButton'

/**
 * `usePortalSession` (favoriteTenantIds) se siembra vía `initialValue=` (ver
 * el comentario en PortalSessionProvider.tsx). El fetch a
 * /api/player/favorites/toggle se mockea con `parameters.fetchMock` (decorator
 * global `withFetch`, ver .storybook/decorators/with-fetch.tsx).
 */
const meta = {
  title: 'Player/FavoriteButton',
  component: FavoriteButton,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <PortalSessionProvider
        initialValue={{ session: null, staffPanelPath: null, favoriteTenantIds: new Set() }}
      >
        <Story />
      </PortalSessionProvider>
    ),
  ],
  args: { tenantId: 'tenant-1' },
} satisfies Meta<typeof FavoriteButton>

export default meta
type Story = StoryObj<typeof meta>

export const OverlayNoFavorito: Story = {}

export const OverlayFavorito: Story = {
  args: { initialFavorited: true },
}

export const InlineNoFavorito: Story = {
  args: { variant: 'inline' },
}

export const InlineFavorito: Story = {
  args: { variant: 'inline', initialFavorited: true },
}

/** Click optimista: togglea al instante a "Guardado" sin esperar la respuesta. */
export const ToggleOptimista: Story = {
  args: { variant: 'inline' },
  parameters: {
    fetchMock: [{ match: '/api/player/favorites/toggle', json: { data: { favorited: true } } }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Variant 'inline': sin aria-label, el nombre accesible es el texto visible
    // ("Guardar"/"Guardado"), no "Guardar en favoritos" (eso es del overlay).
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Guardado' })).toBeInTheDocument(),
    )
  },
}

/** Error de red: revierte el estado optimista y muestra un toast destructivo. */
export const ErrorDeRed: Story = {
  args: { variant: 'inline' },
  parameters: {
    fetchMock: [{ match: '/api/player/favorites/toggle', json: { error: 'fail' }, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar' }))
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() =>
      expect(body.getByText('No pudimos actualizar tus favoritos.')).toBeInTheDocument(),
    )
    await expect(canvas.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  },
}
