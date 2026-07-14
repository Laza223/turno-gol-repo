import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import ThemeToggle from './ThemeToggle'

/**
 * `useTheme()` de next-themes: el preview global ya envuelve TODA story en un
 * `NextThemeProvider` (ver `.storybook/preview.tsx`), así que un segundo
 * provider acá adentro sería un no-op — `next-themes` detecta el contexto ya
 * presente y renderiza sus children en un Fragment sin aplicar sus propios
 * props (`forcedTheme`, `defaultTheme`). Los 3 estados se demuestran vía
 * interacción real (`play` hace click en cada opción del segmented control),
 * que sí muta el estado interno del provider real.
 */
const meta = {
  title: 'Design System/ThemeToggle',
  component: ThemeToggle,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ThemeToggle>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  decorators: [(Story) => <div className="w-72"><Story /></div>],
}

export const SeleccionaOscuro: Story = {
  decorators: [(Story) => <div className="w-72"><Story /></div>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Oscuro' }))
    await expect(canvas.getByRole('radio', { name: 'Oscuro' })).toHaveAttribute('aria-checked', 'true')
    await expect(canvas.getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'false')
  },
}

export const SeleccionaSistema: Story = {
  decorators: [(Story) => <div className="w-72"><Story /></div>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Sistema' }))
    await expect(canvas.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true')
  },
}
