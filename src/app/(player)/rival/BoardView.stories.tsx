import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type { GateState } from '@/app/(public)/[slug]/reservar/actions'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import type { RivalFormResult } from './actions'
import { BoardView } from './BoardView'

// Reloj congelado de las stories: sábado 2026-03-14, 15:30 ART.
const NOW = new Date('2026-03-14T18:30:00Z')

const item = (o: Partial<RivalBoardItem> & { id: string }): RivalBoardItem => ({
  tenantId: 't1',
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  startsAt: new Date('2026-03-14T23:00:00Z'), // hoy 20:00
  format: 5,
  capacity: 10,
  level: 'parejo',
  seeking: 'players',
  seekingPosition: 'any',
  confirmedCount: 7,
  hasStamp: true,
  ...o,
})

const items: RivalBoardItem[] = [
  item({ id: 'a' }),
  item({ id: 'b', confirmedCount: 9, startsAt: new Date('2026-03-14T22:00:00Z'), hasStamp: false }),
  item({
    id: 'c',
    tenantId: 't2',
    tenantName: 'Open Door',
    seekingPosition: 'goalkeeper',
    startsAt: new Date('2026-03-15T22:00:00Z'),
    level: 'picante',
  }),
  item({
    id: 'd',
    seeking: 'rival',
    seekingPosition: null,
    capacity: 5,
    confirmedCount: 5,
    startsAt: new Date('2026-03-18T22:30:00Z'),
    level: 'tranqui',
  }),
]

/** Las actions del ingreso entran por prop: `login-actions` es `'use server'` (ver RivalEntryGate). */
const idle = async (): Promise<GateState> => ({ status: 'idle' })

const tenants = [
  { id: 't1', name: 'El Vagón' },
  { id: 't2', name: 'Open Door' },
]

const meta = {
  title: 'Player/Rival/BoardView',
  component: BoardView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/rival/tablon' } },
  },
  args: {
    items,
    tenants,
    selectedTenantId: null,
    nextHref: null,
    now: NOW,
    alert: {
      alertTenants: tenants,
      signedIn: true,
      subscribed: [],
      subscribeAction: fn(async (): Promise<RivalFormResult> => ({ success: true })),
      unsubscribeAction: fn(async (): Promise<RivalFormResult> => ({ success: true })),
    },
    entry: { sendMagicLink: fn(idle), startGoogle: fn(idle) },
  },
} satisfies Meta<typeof BoardView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Hoy' })).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'Mañana' })).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'Próximos días' })).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'Sumate a un partido' })).toBeInTheDocument()
    await expect(canvas.getByText('Faltan 3')).toBeInTheDocument()
    await expect(canvas.getByText('Falta 1')).toBeInTheDocument()
    await expect(canvas.getByText('Se busca arquero')).toBeInTheDocument()
    await expect(canvas.getByText('Busca rival')).toBeInTheDocument()
    // Cada tarjeta es un link al partido por id, con nombre accesible claro; sin "Ver más".
    await expect(
      canvas.getByRole('link', { name: /^Faltan 3 en El Vagón, Hoy 20:00/ }),
    ).toHaveAttribute('href', '/rival/partido/a')
    await expect(canvas.getByRole('link', { name: /^Busca rival en El Vagón/ })).toBeInTheDocument()
    await expect(canvas.queryByRole('link', { name: 'Ver más partidos' })).toBeNull()
    // La hora manda y el día no se repite bajo "Hoy"/"Mañana"; bajo "Próximos días" sí sale.
    await expect(canvas.getAllByText('20:00')).toHaveLength(1)
    await expect(canvas.queryByText('Hoy 20:00')).toBeNull()
    await expect(canvas.getByText('Miércoles 18')).toBeInTheDocument()
    // El cupo va en el nombre accesible (la tira de camisetas es decorativa).
    await expect(
      canvas.getByRole('link', { name: /^Faltan 3 en El Vagón.*, 7 de 10 confirmados$/ }),
    ).toBeInTheDocument()
  },
}

/** Sin sesión, "Armar un partido" abre el ingreso de RIVAL (no manda a /ingresar). */
export const SinSesion: Story = {
  args: { alert: { ...meta.args.alert, signedIn: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Armar un partido' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Armar un partido' }))
    const dialog = await screen.findByRole('dialog')
    await expect(dialog.querySelector('input[name="next"]')).toHaveValue('/rival/nuevo')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

export const ConVerMas: Story = {
  args: { nextHref: '/rival/tablon?despues=2026-03-18T22%3A30%3A00.000Z_d' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ver más partidos' })).toHaveAttribute(
      'href',
      '/rival/tablon?despues=2026-03-18T22%3A30%3A00.000Z_d',
    )
  },
}

export const FiltradoPorComplejo: Story = {
  args: { items: items.filter((i) => i.tenantId === 't2'), selectedTenantId: 't2' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Open Door' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(canvas.queryByText('Faltan 3')).toBeNull()
  },
}

export const Vacio: Story = {
  args: { items: [], tenants: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Por ahora no hay partidos en el tablón.' }),
    ).toBeInTheDocument()
    await expect(canvas.getByText(/Armá el tuyo y publicalo/)).toBeInTheDocument()
    // Un solo camino para armar: el verde de arriba.
    await expect(canvas.getAllByRole('link', { name: 'Armar un partido' })).toHaveLength(1)
  },
}

export const VacioConAviso: Story = {
  args: { items: [], tenants: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Avisame de partidos en')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Avisarme por mail' })).toBeEnabled()
  },
}

/** Complejo elegido sin partidos: en vez de un callejón, el aviso con ese complejo ya elegido. */
export const FiltradoSinPartidos: Story = {
  args: { items: [], selectedTenantId: 't2' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Este complejo no tiene partidos publicados por ahora.'),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Avisame de partidos en' })).toHaveTextContent(
      'Open Door',
    )
    await expect(canvas.getByRole('button', { name: 'Avisarme por mail' })).toBeEnabled()
  },
}
