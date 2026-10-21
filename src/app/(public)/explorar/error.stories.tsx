import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import ExplorarError from './error'

/**
 * Error boundary de /explorar. La salida secundaria es la home, no `/explorar`. Reporta a Sentry
 * en un `useEffect`; sin DSN en Storybook es un no-op.
 */
const meta = {
  title: 'Player/Explorar/Error',
  component: ExplorarError,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } },
  },
  args: { reset: fn() },
} satisfies Meta<typeof ExplorarError>

export default meta
type Story = StoryObj<typeof meta>

export const ConDigest: Story = {
  args: { error: Object.assign(new Error('DB connection timeout'), { digest: '3f9a21bc' }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'No pudimos cargar los complejos' }),
    ).toBeInTheDocument()
    await expect(canvas.getByText('3f9a21bc')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/')
    await userEvent.click(canvas.getByRole('button', { name: 'Reintentar' }))
    await expect(args.reset).toHaveBeenCalledTimes(1)
  },
}

export const SinDigest: Story = {
  args: { error: new Error('Unexpected render error') },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/Código de referencia/)).not.toBeInTheDocument()
  },
}
