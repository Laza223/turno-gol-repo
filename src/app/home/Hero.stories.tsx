import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { cityCounts } from '@/test/fixtures/tenant'
import { Hero } from './Hero'

/**
 * `page.tsx` (HomePage) envuelve todas las secciones de la landing en
 * `<div className="landing-hero min-h-dvh text-foreground">` — esa clase es la
 * que pinta el degradé claro / el navy #020617 oscuro (mismo fondo hardcodeado
 * que `(business)/para-complejos`, donde `emerald-400` es el idiom correcto).
 * Reproducirlo acá no es decoración: sin él el hero se ve sobre `bg-background`
 * y el contraste medido no es el real.
 */
const meta = {
  title: 'Public/Landing/Hero',
  component: Hero,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="landing-hero min-h-dvh text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Hero>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { cities: cityCounts() },
}

/** `loadCities()` degrada a `[]` si `listPublicCities()` tira — el combobox queda sin opciones. */
export const SinCiudades: Story = {
  args: { cities: [] },
}
