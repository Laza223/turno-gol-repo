import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import PlayerError from './error'

/**
 * Error boundary player-facing (mis-reservas y flujos de reserva). Reporta a
 * Sentry en un `useEffect`; sin DSN configurado en Storybook, `captureException`
 * es un no-op — no hace falta mockear el módulo.
 */
const meta = {
  title: 'Player/ErrorBoundary',
  component: PlayerError,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } },
  },
  args: {
    reset: fn(),
  },
} satisfies Meta<typeof PlayerError>

export default meta
type Story = StoryObj<typeof meta>

export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: '3f9a21bc' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No pudimos cargar tus reservas')).toBeInTheDocument()
    await expect(canvas.getByText('3f9a21bc')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Mis reservas' })).toHaveAttribute('href', '/mis-reservas')
  },
}

export const SinDigest: Story = {
  args: {
    error: new Error('Unexpected render error'),
  },
}
