import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { player } from '@/test/fixtures/player'
import { paintedContrast } from '@/test/contrast'
import { ConfiguracionView } from './ConfiguracionView'
import type { UpdateProfileResult } from './actions'
import type { FavoriteRow } from './FavoritesList'

const base = player()

const fav = (n: number, name = `Complejo ${n}`, city = 'Rosario'): FavoriteRow => ({
  id: `tenant-${n}`,
  slug: `complejo-${n}`,
  name,
  city,
})

/**
 * Las dos Server Actions entran por prop: importarlas como valor arrastra drizzle/postgres y
 * rompe el bundle de browser. El decorator reproduce el fondo del portal (en producción lo
 * pone `(player)/layout.tsx`) sin el cascarón, que también arrastra `signOutAction`.
 */
const meta = {
  title: 'Player/Configuracion/ConfiguracionView',
  component: ConfiguracionView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/configuracion' } },
  },
  args: {
    profile: {
      firstName: base.firstName,
      lastName: base.lastName,
      phone: base.phone ?? '',
      preferredArea: 'Palermo',
    },
    email: base.email,
    favorites: [fav(1, 'Complejo Fénix', 'Rosario'), fav(2, 'Canchas del Sur', 'Funes')],
    activity: { played: 12, venues: 3, streakWeeks: 4 },
    updateProfileAction: fn(async (): Promise<UpdateProfileResult> => ({ success: true })),
    signOutAction: fn(async () => {}),
  },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfiguracionView>

export default meta
type Story = StoryObj<typeof meta>

/** La Cuenta completa: los bloques en su orden, cada uno con su encabezado. */
export const Completa: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument()
    const titulos = canvas.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    await expect(titulos).toEqual([
      'Quién sos',
      'Tus datos',
      'Favoritos',
      'Tu actividad',
      'Tema y sesión',
      'Tus datos personales',
      'Darte de baja',
    ])
    // Los bloques a los que redirige /perfil existen.
    for (const id of ['tus-datos', 'favoritos', 'actividad']) {
      await expect(canvasElement.querySelector(`#${id}`)).not.toBeNull()
    }
    await expect(canvas.getByText(base.email)).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Descargar mis datos' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Salir' })).toBeInTheDocument()
    await expect(canvas.getByRole('radio', { name: 'Oscuro' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Eliminar la cuenta' })).toHaveAttribute(
      'href',
      '/eliminar-cuenta',
    )
  },
}

/** Sin interruptores de avisos: una línea dice qué mails llegan siempre. */
export const SinInterruptoresDeAvisos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('switch')).not.toBeInTheDocument()
    await expect(canvas.queryByText(/notificaciones push/i)).not.toBeInTheDocument()
    await expect(
      canvas.getByText(/Te mandamos siempre un mail cuando se confirma o se cancela una reserva/),
    ).toBeInTheDocument()
  },
}

/** Una cuenta recién creada: sin apellido, teléfono ni zona, sin favoritos y sin partidos. */
export const Vacia: Story = {
  args: {
    profile: { firstName: 'Lucía', lastName: '', phone: '', preferredArea: '' },
    email: 'lucia@example.com',
    favorites: [],
    activity: { played: 0, venues: 0, streakWeeks: 0 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/Apellido/)).toHaveValue('')
    await expect(canvas.getByRole('link', { name: 'Explorar complejos' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Reservar una cancha' })).toBeInTheDocument()
  },
}

/** Nombre y email largos: parten de renglón y no ensanchan la página. */
export const NombreLargo: Story = {
  args: {
    profile: {
      firstName: 'María de los Ángeles Guadalupe',
      lastName: 'Fernández de Kirchner Rodríguez Larreta',
      phone: '',
      preferredArea: '',
    },
    email:
      'maria.de.los.angeles.guadalupe.fernandez.de.kirchner.rodriguez@dominio-muy-largo.com.ar',
  },
  play: async ({ canvasElement }) => {
    const raiz = canvasElement.ownerDocument.documentElement
    await expect(raiz.scrollWidth).toBeLessThanOrEqual(raiz.clientWidth)
  },
}

export const SinFavoritos: Story = {
  args: { favorites: [] },
}

export const CincuentaFavoritos: Story = {
  args: { favorites: Array.from({ length: 50 }, (_, i) => fav(i + 1)) },
  play: async ({ canvasElement }) => {
    const filas = canvasElement.querySelectorAll('#favoritos li')
    await expect(filas).toHaveLength(50)
  },
}

/** El error de guardado va junto a su campo. */
export const ErrorDeGuardado: Story = {
  args: {
    updateProfileAction: fn(async () => ({
      success: false as const,
      error: 'Teléfono muy corto',
      field: 'phone' as const,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Teléfono muy corto')
  },
}

/** La descarga falla: el error se dice una vez, junto al botón. */
export const ErrorDeExport: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/data-export', json: { error: 'server_error' }, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Descargar mis datos' }))
    await waitFor(() => expect(canvas.getByRole('alert')).toBeInTheDocument())
    await expect(canvas.getByRole('alert')).toHaveTextContent(/No se pudo generar la exportación/)
  },
}

/** Contraste MEDIDO (lo que se pinta) de los textos de la página. Corre en claro y en oscuro. */
export const ContrasteMedido: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const medidos: Array<[string, HTMLElement]> = [
      ['email', canvas.getByText(base.email)],
      ['aviso del email', canvas.getByText('El email no se puede cambiar.')],
      ['mails siempre', canvas.getByText(/Te mandamos siempre un mail/)],
      ['favorito (ciudad)', canvas.getAllByText('Rosario')[0]!],
      ['quitar', canvas.getByRole('button', { name: 'Quitar Complejo Fénix de favoritos' })],
      ['actividad', canvas.getByText('Partidos jugados')],
      ['tema inactivo', canvas.getByRole('radio', { name: 'Claro' })],
      ['salir', canvas.getByRole('button', { name: 'Salir' })],
      ['descargar', canvas.getByRole('button', { name: 'Descargar mis datos' })],
      ['ley', canvas.getByText(/Es tu derecho de acceso/)],
      ['eliminar', canvas.getByRole('link', { name: 'Eliminar la cuenta' })],
      ['guardar', canvas.getByRole('button', { name: 'Guardar cambios' })],
    ]
    for (const [nombre, el] of medidos) {
      const ratio = await paintedContrast(el)
      await expect(ratio, nombre).toBeGreaterThanOrEqual(4.5)
    }
  },
}
