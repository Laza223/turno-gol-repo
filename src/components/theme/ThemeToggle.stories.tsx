import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
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
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
}

export const SeleccionaOscuro: Story = {
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Oscuro' }))
    await expect(canvas.getByRole('radio', { name: 'Oscuro' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(canvas.getByRole('radio', { name: 'Claro' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  },
}

export const SeleccionaSistema: Story = {
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Sistema' }))
    await expect(canvas.getByRole('radio', { name: 'Sistema' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  },
}

/**
 * Variante del portal (La Reserva): segmentos de 44 px y 14 px, planos. La elegida se marca con
 * relleno `accent` + semibold, sin borde verde; el verde (anillo `primary` de 2 px) es solo del
 * foco, así que elegida y enfocada nunca se ven iguales. El panel sigue con la de siempre.
 */
export const Portal: Story = {
  args: { variant: 'portal' },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const radios = within(canvasElement).getAllByRole('radio')
    const relleno = (r: HTMLElement) => getComputedStyle(r).backgroundColor !== 'rgba(0, 0, 0, 0)'
    const anillo = (r: HTMLElement) => getComputedStyle(r).boxShadow !== 'none'
    for (const radio of radios) {
      await expect(radio.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
      await expect(getComputedStyle(radio).fontSize).toBe('14px')
    }
    await userEvent.click(within(canvasElement).getByRole('radio', { name: 'Oscuro' }))
    const marcados = radios.filter((r) => r.getAttribute('aria-checked') === 'true')
    await expect(marcados).toHaveLength(1)
    // Visualmente activo = relleno + semibold + borde sin color: exactamente la elegida.
    // Con `waitFor`: en CI (shard 2/3 dark, PR #497) el botón ya tenía las clases activas y el
    // estilo computado todavía no — leído al toque del click, sin dejar asentar el render.
    await waitFor(() =>
      expect(
        radios.filter(
          (r) =>
            relleno(r) &&
            getComputedStyle(r).fontWeight === '600' &&
            getComputedStyle(r).borderTopColor === 'rgba(0, 0, 0, 0)',
        ),
      ).toEqual(marcados),
    )
    // Con el foco en OTRO segmento: el enfocado lleva anillo y sin relleno, la elegida no lleva anillo.
    const otro = radios.find((r) => !marcados.includes(r))!
    await userEvent.tab()
    otro.focus({ focusVisible: true } as FocusOptions)
    await expect(anillo(otro)).toBe(true)
    await expect(relleno(otro)).toBe(false)
    await expect(anillo(marcados[0]!)).toBe(false)
    await expect(relleno(marcados[0]!)).toBe(true)
  },
}
