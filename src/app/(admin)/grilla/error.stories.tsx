import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import GrillaError from './error'

/**
 * Error boundary de /grilla. Renderiza dentro del shell admin (la sidebar
 * queda), por eso ErrorState usa `variant="contained"` y no `full`. La card
 * es opaca (bg-card) — no depende del fondo detrás para el contraste.
 */
const meta = {
  title: 'Admin/Grilla/Error',
  component: GrillaError,
  parameters: { layout: 'fullscreen' },
  args: {
    reset: fn(),
  },
} satisfies Meta<typeof GrillaError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    error: Object.assign(new Error('relation "bookings" does not exist'), { digest: undefined }),
  },
}

/** Con digest de Next (build de producción con boundary instrumentado). */
export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('connection terminated unexpectedly'), {
      digest: '3821457690',
    }),
  },
}
