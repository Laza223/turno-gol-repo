import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import CheckoutLoading from './loading'

const meta = {
  title: 'Player/Checkout/CheckoutLoading',
  component: CheckoutLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="portal-ambient min-h-dvh text-portal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CheckoutLoading>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Esqueleto de la pantalla de confirmar, en vidrio (F5). Mismo ritmo que la página real
 * (`page.tsx`) para que al cargar nada se mueva: la columna de 480 px y 12 px entre bloques.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const column = canvasElement.querySelector<HTMLElement>('.rv-col')!
    await expect(
      getComputedStyle(column).maxWidth === 'none' ? column.offsetWidth : 0,
    ).toBeLessThanOrEqual(480)
    const stack = canvasElement.querySelector<HTMLElement>('[aria-busy="true"]')!
    await expect(getComputedStyle(stack).rowGap).toBe('12px')
    await expect(stack.querySelectorAll('.skeleton-glass').length).toBeGreaterThanOrEqual(4)
  },
}
