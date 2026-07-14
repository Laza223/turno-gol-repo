import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import RootError from './error'

/**
 * Error boundary raíz (`src/app/error.tsx`). Next.js le pasa `{ error, reset }`
 * directamente — acá se los pasamos a mano, igual que a cualquier otro
 * `error.tsx` del árbol. `Sentry.captureException(error)` corre en un
 * `useEffect`; no hace falta mockear el módulo para que la story funcione (no
 * hay DSN configurado en Storybook, así que el SDK client-side no dispara red).
 */
const meta = {
  title: 'Layout/ErrorBoundary',
  component: RootError,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RootError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    error: Object.assign(new Error('Unhandled rejection en /explorar'), { digest: undefined }),
    reset: fn(),
  },
}

/** Con `digest`: el código de referencia que Next adjunta en producción. */
export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('Fallo al cargar disponibilidad'), { digest: 'a1b2c3d4' }),
    reset: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('a1b2c3d4')).toBeInTheDocument()
  },
}

/** "Reintentar" llama a `reset()` (el mecanismo de Next para re-renderizar el segmento). */
export const Reintentar: Story = {
  args: {
    error: Object.assign(new Error('Timeout de red'), { digest: undefined }),
    reset: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reintentar' }))
    await expect(args.reset).toHaveBeenCalledTimes(1)
  },
}
