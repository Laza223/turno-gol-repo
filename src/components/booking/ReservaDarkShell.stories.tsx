import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CheckCircle2 } from 'lucide-react'
import ReservaDarkShell from './ReservaDarkShell'

/**
 * Cascarón compartido por éxito/pendiente/error de reserva (y sus loading.tsx):
 * theme-adaptive vía CSS (`.reserva-shell`/`.reserva-glow-*` en globals.css,
 * no clases Tailwind con dark:) — en light se vuelve transparente, en dark es
 * un slab #020617. Un solo estado visual; se muestra con contenido real
 * (el bloque de éxito de reserva/exito/page.tsx) para que el glow se vea con
 * algo encima, en vez de una story vacía.
 */
const meta = {
  title: 'Player/BookingSuccess/ReservaDarkShell',
  component: ReservaDarkShell,
  parameters: { layout: 'fullscreen' },
  args: {
    children: (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
          <span className="reserva-success-badge relative flex h-20 w-20 items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-10 w-10" aria-hidden />
          </span>
        </div>
        <h1 className="font-display text-3xl font-black italic tracking-tight text-foreground">
          ¡Reserva <span className="hero-accent-text">confirmada!</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Complejo Fénix · Cancha 1
          <br />
          Sábado 14 de marzo · 16:00–17:00
        </p>
      </div>
    ),
  },
} satisfies Meta<typeof ReservaDarkShell>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
