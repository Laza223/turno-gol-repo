import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { RivalFormResult } from '../actions'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { ScheduleSource } from '@/lib/schedule/open-status'
import { DAY_KEYS } from '@/shared/time/week-days'
import { NewMatchForm } from './NewMatchForm'

// Reloj congelado de las stories: sábado 2026-03-14, 15:30 ART.
const TODAY = '2026-03-14'

/** Todos los días abre y cierra igual; `closedDay` lo deja cerrado. */
const week = (open: string, close: string, closedDay?: string): ScheduleSource => ({
  openingHours: Object.fromEntries(
    DAY_KEYS.map((k) => [k, { open, close, closed: k === closedDay }]),
  ) as ScheduleSource['openingHours'],
  closedDates: [],
  closesNextDay: false,
})

const tenants = [
  { id: 't1', name: 'El Vagón', city: 'Luján', slug: 'el-vagon', schedule: null },
  { id: 't2', name: 'Open Door', city: 'Pilar', slug: 'open-door', schedule: null },
]

const meta = {
  title: 'Player/Rival/NewMatchForm',
  component: NewMatchForm,
  parameters: { layout: 'padded' },
  args: {
    tenants,
    bookings: [],
    prefill: null,
    today: TODAY,
    nowTime: '15:30',
    action: fn(async (): Promise<RivalFormResult> => ({ success: true })),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-lg bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NewMatchForm>

export default meta
type Story = StoryObj<typeof meta>

export const SinReserva: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // "Partido completo" por defecto: el cupo arranca en formato x 2 y no hay nada del tablón.
    await expect(canvas.getByRole('radio', { name: 'Partido completo' })).toBeChecked()
    await expect(canvas.getByRole('status')).toHaveTextContent('10')
    await expect(canvas.queryByText('Tablón')).toBeNull()
    await expect(canvas.queryByLabelText('Tu WhatsApp')).toBeNull()
    // Los tres bloques, con título.
    await expect(canvas.getByRole('heading', { name: 'Dónde y cuándo' })).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'El partido' })).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'La cancha' })).toBeInTheDocument()
    // Sin reserva, la cancha se declara con la casilla y el form dice que es obligatoria.
    await expect(canvas.getByRole('checkbox', { name: 'Ya tengo la cancha' })).not.toBeChecked()
    await expect(canvas.getByText(/sin cancha no hay partido/)).toBeInTheDocument()
    // El cupo se ve como dato ("Juegan 10"); el stepper abre con "Cambiar".
    await userEvent.click(canvas.getByRole('button', { name: 'Cambiar cuántos juegan' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Uno más' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('11')
  },
}

export const EquipoBuscaRival: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Mi equipo busca rival' }))
    // Sin stepper (no hay controles muertos): el cupo es el formato.
    await expect(canvas.queryByRole('status')).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Uno más' })).toBeNull()
    await expect(canvas.getByText('Tu equipo: 5')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Ya tengo la cancha' }))
    await userEvent.click(canvas.getByRole('radio', { name: '20:00' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Armar el partido' }))
    await waitFor(() => expect(args.action).toHaveBeenCalled())
    const fd = (args.action as ReturnType<typeof fn>).mock.calls[0]![1] as FormData
    await expect(fd.get('mode')).toBe('rival')
    await expect(fd.get('capacity')).toBe('5')
    await expect(fd.get('time')).toBe('20:00')
  },
}

export const HoraRapidaYOtraHora: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Las cuatro habituales a la vista; el resto, a un toque.
    for (const t of ['19:00', '20:00', '21:00', '22:00']) {
      await expect(canvas.getByRole('radio', { name: t })).toBeInTheDocument()
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Otra hora' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Elegí otra hora' }))
    await userEvent.click(
      await within(document.body).findByRole('menuitemradio', { name: '18:30' }),
    )
    await expect(canvas.getByRole('button', { name: 'Otra: 18:30' })).toBeInTheDocument()
  },
}

export const HorarioDelComplejo: Story = {
  args: {
    tenants: [
      {
        id: 't1',
        name: 'El Vagón',
        city: 'Luján',
        slug: 'el-vagon',
        schedule: week('17:00', '21:00'),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Cierra a las 21:00: el último turno de 60 min arranca a las 20:00.
    await expect(canvas.getByRole('radio', { name: '20:00' })).toBeInTheDocument()
    await expect(canvas.queryByRole('radio', { name: '21:00' })).toBeNull()
  },
}

export const DiaCerradoDelComplejo: Story = {
  args: {
    tenants: [
      {
        id: 't1',
        name: 'El Vagón',
        city: 'Luján',
        slug: 'el-vagon',
        schedule: week('10:00', '23:00', 'sat'),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // No se bloquea: avisa y deja elegir (puede tener la cancha por otro canal).
    await expect(canvas.getByText(/figura cerrado en TurnoGol/)).toBeInTheDocument()
    await expect(canvas.getByRole('radio', { name: '20:00' })).toBeInTheDocument()
  },
}

export const DespuesDeLas2330: Story = {
  args: { nowTime: '23:45' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Hoy ya no queda ninguna hora: el día arranca en mañana.
    await expect(canvas.getByRole('radio', { name: 'Dom 15' })).toBeChecked()
    await userEvent.click(canvas.getByRole('radio', { name: /Hoy/ }))
    await expect(canvas.getByText('Hoy ya no quedan horarios. Elegí otro día.')).toBeInTheDocument()
  },
}

export const RepetirConHoraVencida: Story = {
  args: {
    repeat: {
      tenantId: 't1',
      date: TODAY,
      time: '15:00',
      format: 5,
      capacity: 10,
      level: 'parejo',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // La hora precargada ya pasó: no viaja escondida, se avisa.
    await expect(
      canvas.getByText('Esa hora ya no está disponible. Elegí otra.'),
    ).toBeInTheDocument()
  },
}

export const NivelConAyuda: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Se juega en serio, sin pasarse/)).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('radio', { name: 'Picante' }))
    await expect(canvas.getByText(/Se juega a ganar/)).toBeInTheDocument()
  },
}

export const EnvioVacioConErroresPorCampo: Story = {
  args: {
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Elegí el complejo.',
      field: 'tenantId',
      fieldErrors: {
        tenantId: 'Elegí el complejo.',
        startsAt: 'Elegí la hora.',
        courtDeclared: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
      },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Armar el partido' }))
    // Todos los errores juntos, un solo alert y el foco en el primer campo con error.
    await expect(await canvas.findByText('Elegí la hora.')).toBeInTheDocument()
    await expect(canvas.getAllByRole('alert')).toHaveLength(1)
    await waitFor(() => expect(canvasElement.querySelector('#rival-complejo')).toHaveFocus())
    await expect(canvasElement.querySelector('#rival-complejo')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    // Editar un campo limpia su error.
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Ya tengo la cancha' }))
    await expect(canvas.queryByText(/no se arman partidos sin cancha/)).toBeNull()
  },
}

export const ConReservaVinculada: Story = {
  args: {
    // Sábado 21:00 ART = 00:00 UTC del domingo.
    bookings: [{ tenantId: 't1', startsAt: '2026-03-15T00:00:00.000Z' }],
    prefill: { tenantId: 't1', date: '2026-03-14', time: '21:00', format: 7 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Viene de tu reserva')).toBeInTheDocument()
    await expect(canvas.getByText('Reservada en TurnoGol')).toBeInTheDocument()
    await expect(canvas.queryByRole('checkbox')).toBeNull()
    // El formato de la reserva (Fútbol 7) fija el cupo en 14.
    await expect(canvas.getByRole('status')).toHaveTextContent('14')
  },
}

export const ErrorDeDominio: Story = {
  args: {
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Ya tenés 3 partidos armados. Cancelá uno o esperá a que se juegue para armar otro.',
      code: 'rival_limit_active',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Armar el partido' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ya tenés 3 partidos armados')
    // Con el tope hay una salida: ir a resolverlo.
    await expect(canvas.getByRole('link', { name: 'Ver mis partidos' })).toHaveAttribute(
      'href',
      '/rival/mis-partidos',
    )
  },
}

export const FalloDeRed: Story = {
  args: {
    action: fn(async (): Promise<RivalFormResult> => {
      throw new Error('fetch failed')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '21:00' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Armar el partido' }))
    // Crear no es idempotente: no se sabe si se armó. Se dice y se deja lo cargado.
    await expect(await canvas.findByRole('alert')).toHaveTextContent('No pudimos confirmar')
    await expect(canvas.getByRole('radio', { name: '21:00' })).toBeChecked()
  },
}

export const ReservaBloqueadaConErrorDeFecha: Story = {
  args: {
    bookings: [{ tenantId: 't1', startsAt: '2026-03-15T00:00:00.000Z' }],
    prefill: { tenantId: 't1', date: '2026-03-14', time: '21:00', format: 7 },
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Solo se puede armar hasta 7 días adelante.',
      field: 'startsAt',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Con la reserva fijada no hay campo donde pintar el error: tiene que salir arriba del botón.
    await userEvent.click(canvas.getByRole('button', { name: 'Armar el partido' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('hasta 7 días adelante')
  },
}
