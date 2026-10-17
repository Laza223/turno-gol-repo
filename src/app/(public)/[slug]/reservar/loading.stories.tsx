import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import CheckoutLoading from './loading'

const meta = {
  title: 'Player/Checkout/CheckoutLoading',
  component: CheckoutLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof CheckoutLoading>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Skeleton fijo de la pantalla de confirmar, en el mundo del portal. Mismo ritmo que la página real
 * (`page.tsx`) para que al cargar nada se mueva: la misma columna, 32 px entre bloques, 12 px bajo
 * el título de sección, 8 px hasta la regla de cancelación y 48 px al pie.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const column = canvasElement.querySelector<HTMLElement>('[aria-busy="true"]')!
    const style = getComputedStyle(column)
    await expect(style.maxWidth).toBe('560px')
    await expect(style.paddingBottom).toBe('48px')

    const gap = (a: Element, b: Element) =>
      b.getBoundingClientRect().top - a.getBoundingClientRect().bottom
    const [summary, payment, button] = [...column.lastElementChild!.children]
    await expect(gap(summary!, payment!)).toBeCloseTo(32, 1)
    await expect(gap(payment!, button!)).toBeCloseTo(32, 1)
    const [title, options, rule] = [...payment!.children]
    await expect(gap(title!, options!)).toBeCloseTo(12, 1)
    await expect(gap(options!, rule!)).toBeCloseTo(8, 1)
  },
}
