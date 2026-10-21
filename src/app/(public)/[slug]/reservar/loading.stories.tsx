import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import CheckoutLoading from './loading'

const meta = {
  title: 'Player/Checkout/CheckoutLoading',
  component: CheckoutLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CheckoutLoading>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Skeleton fijo de la pantalla de confirmar, sobre el cascarón de La Previa. Mismo ritmo que la
 * página real (`page.tsx`) para que al cargar nada se mueva: la misma columna, 32 px entre bloques,
 * 8 px entre el botón y la regla de cancelación y 48 px al pie.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const column = canvasElement.querySelector<HTMLElement>('[aria-busy="true"]')!
    const style = getComputedStyle(column)
    await expect(style.maxWidth).toBe('560px')
    await expect(style.paddingBottom).toBe('48px')

    const gap = (a: Element, b: Element) =>
      b.getBoundingClientRect().top - a.getBoundingClientRect().bottom
    const [summary, action] = [...column.lastElementChild!.children]
    await expect(gap(summary!, action!)).toBeCloseTo(32, 1)
    const [button, rule] = [...action!.children]
    await expect(gap(button!, rule!)).toBeCloseTo(8, 1)
  },
}
