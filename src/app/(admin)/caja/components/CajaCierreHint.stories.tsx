import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { CajaCierreHint } from './CajaCierreHint'

const HINT_KEY = 'tg-hint-caja-cierre'

/**
 * El hint lee localStorage en un useEffect (arranca oculto para evitar flash),
 * así que cada story fuerza el valor ANTES del mount desde el decorator —
 * misma superficie que la app: la Caja vive sobre `bg-background`, sin card.
 */
const meta = {
  title: 'Admin/Caja/CajaCierreHint',
  component: CajaCierreHint,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CajaCierreHint>

export default meta
type Story = StoryObj<typeof meta>

export const PrimeraVisita: Story = {
  decorators: [
    (Story) => {
      localStorage.removeItem(HINT_KEY)
      return <Story />
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('note')).toHaveTextContent(/cerrá la caja/i)
  },
}

/** "Entendido" oculta el hint y lo marca visto en localStorage — no vuelve a aparecer. */
export const DismissGuardaEnLocalStorage: Story = {
  decorators: [
    (Story) => {
      localStorage.removeItem(HINT_KEY)
      return <Story />
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Entendido' }))
    await waitFor(() => expect(canvas.queryByRole('note')).not.toBeInTheDocument())
    await expect(localStorage.getItem(HINT_KEY)).toBe('1')
  },
}

export const YaVisto: Story = {
  decorators: [
    (Story) => {
      localStorage.setItem(HINT_KEY, '1')
      return <Story />
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.queryByRole('note')).not.toBeInTheDocument())
  },
}
