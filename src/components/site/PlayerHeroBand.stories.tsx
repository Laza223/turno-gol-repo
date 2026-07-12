import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import PlayerHeroBand from './PlayerHeroBand'

/** `.player-hero-band` es una superficie propia theme-adaptive (crema+glow en
 * light, slab nocturno en dark) — no requiere contenedor extra. */
const meta = {
  title: 'Player/PlayerHeroBand',
  component: PlayerHeroBand,
  parameters: { layout: 'padded' },
  args: {
    eyebrow: 'Mi perfil',
    title: 'Hola,',
    accent: 'Tomás',
    subtitle: 'Gestioná tus datos y tus reservas.',
  },
} satisfies Meta<typeof PlayerHeroBand>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Solo eyebrow, sin título — variante mínima (p. ej. header de una sub-sección). */
export const SoloEyebrow: Story = {
  args: { title: undefined, accent: undefined, subtitle: undefined },
}

export const ConChildren: Story = {
  args: {
    children: (
      <div className="mt-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
          TI
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Tomás Ibáñez</p>
          <p className="text-xs text-muted-foreground">tomas.ibanez@example.com</p>
        </div>
      </div>
    ),
  },
}

/** Título largo: el `clamp()` de tamaño evita que desborde en mobile. */
export const TituloLargo: Story = {
  args: {
    eyebrow: 'Configuración',
    title: 'Editá tu información personal y tus preferencias de contacto',
    accent: undefined,
    subtitle: undefined,
  },
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
}
