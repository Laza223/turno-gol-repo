import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { VerifyView } from './page'

/**
 * Monta `VerifyView`, no el `export default` de page.tsx: en Next 16
 * `searchParams` es una Promise, así que la page es async — y un componente
 * async no se puede montar en el cliente ("Only Server Components can be async
 * at the moment"). La page resuelve la Promise y delega en `VerifyView`, que es
 * sincrónico y es lo que se testea acá.
 *
 * 100% presentacional pese a vivir en `page.tsx`: toda la lógica sale de
 * `searchParams`, sin fetch ni auth (ver isolationNotes en
 * docs/storybook/storybook-coverage.json). El estado `success` monta
 * <SuccessRedirect/> (client), que agenda un `window.location.assign(next)`
 * real a los 5s. No se stubea: `assign`/`replace`/`reload` son [Unforgeable]
 * en Location (own-property no configurable) — en un browser real (Playwright,
 * a diferencia de jsdom) NO se pueden espiar ni en la instancia ni en
 * `Location.prototype` (ahí ni siquiera existen como own property). El `play`
 * corre y desmonta en <100ms, muy por debajo del timeout de 5s, y el `useEffect`
 * de cleanup de <SuccessRedirect/> cancela el timer al desmontar la story.
 */
const meta = {
  title: 'Auth/VerifyPage',
  component: VerifyView,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof VerifyView>

export default meta
type Story = StoryObj<typeof meta>

export const Cargando: Story = {
  args: { searchParams: {} },
}

export const ExitoLogin: Story = {
  args: { searchParams: { status: 'success', intent: 'login', next: '/mis-reservas' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Listo!')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ir a mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
  },
}

export const ExitoSignup: Story = {
  args: { searchParams: { status: 'success', intent: 'signup', next: '/dashboard' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Bienvenido a TurnoGol!')).toBeInTheDocument()
  },
}

export const ExitoBooking: Story = {
  args: { searchParams: { status: 'success', intent: 'booking', next: '/complejo-fenix/reservar' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Cuenta confirmada!')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Continuar con mi reserva' })).toBeInTheDocument()
  },
}

export const ErrorExpirado: Story = {
  args: { searchParams: { error: 'expired' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Este enlace expiró. Generá uno nuevo desde Iniciar sesión.')).toBeInTheDocument()
  },
}

export const ErrorUsado: Story = {
  args: { searchParams: { error: 'used' } },
}

export const ErrorInvalido: Story = {
  args: { searchParams: { error: 'algo-no-mapeado' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Código sin entrada en ERROR_COPY: cae al copy de 'invalid' (fallback).
    await expect(canvas.getByText('No pudimos verificar el enlace. Probá de nuevo.')).toBeInTheDocument()
  },
}
