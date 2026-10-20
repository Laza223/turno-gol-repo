import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { paintedContrast } from '@/test/contrast'
import { PortalWorld } from '@/components/world/PortalWorld'
import { EliminarCuentaView } from './EliminarCuentaView'

/** El decorator reproduce el mundo de La Reserva (en producción lo pone `(player)/layout.tsx`). */
const meta = {
  title: 'Player/EliminarCuenta/EliminarCuentaView',
  component: EliminarCuentaView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/eliminar-cuenta' } },
  },
  args: {
    confirmEmail: 'tomas.ibanez@example.com',
    action: fn(async () => ({ success: true as const })),
  },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof EliminarCuentaView>

export default meta
type Story = StoryObj<typeof meta>

/** Sin reservas por jugar: no hay aviso. Una sola explicación y un solo botón de alarma. */
export const SinReservasFuturas: Story = {
  args: { futureConfirmedCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Eliminar mi cuenta' }),
    ).toBeVisible()
    await expect(canvas.getByText(/Esta acción es irreversible/)).toBeVisible()
    await expect(canvas.queryByText(/por jugar/)).not.toBeInTheDocument()
    // La ley se nombra una sola vez, y sin jerga de artículos.
    await expect(canvas.getAllByText(/Ley 25\.326/)).toHaveLength(1)
    await expect(canvas.queryByText(/AFIP|Art\./)).not.toBeInTheDocument()
    // Descargar los datos está ahí mismo.
    await expect(canvas.getByRole('button', { name: 'Descargar mis datos' })).toBeVisible()
  },
}

/** 1 reserva: singular, y la concordancia es con el número. */
export const UnaReservaFutura: Story = {
  args: { futureConfirmedCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Tenés 1 reserva confirmada por jugar' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
  },
}

/** 3 reservas: plural. */
export const VariasReservasFuturas: Story = {
  args: { futureConfirmedCount: 3 },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', {
        level: 2,
        name: 'Tenés 3 reservas confirmadas por jugar',
      }),
    ).toBeInTheDocument()
  },
}

/** El botón de alarma no ocupa todo el ancho, no tiene sombra y no queda pegado al texto. */
export const BotonDeAlarma: Story = {
  args: { futureConfirmedCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const boton = canvas.getByRole('button', { name: 'Eliminar mi cuenta' })
    const caja = boton.getBoundingClientRect()
    const columna = boton.parentElement!.getBoundingClientRect()
    await expect(caja.width).toBeLessThan(columna.width)
    await expect(caja.height).toBeGreaterThanOrEqual(44)
    // Tailwind deja las capas de ring/shadow en transparente: lo que cuenta es que ninguna se vea.
    const sombra = getComputedStyle(boton)
      .boxShadow.replaceAll('rgba(0, 0, 0, 0) 0px 0px 0px 0px', '')
      .replaceAll(',', '')
      .trim()
    await expect(['', 'none']).toContain(sombra)
    const descarga = canvas.getByRole('button', { name: 'Descargar mis datos' })
    await expect(caja.top - descarga.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(32)
  },
}

/** Error de la descarga de los datos, ahí mismo. */
export const ErrorDeExport: Story = {
  args: { futureConfirmedCount: 0 },
  parameters: {
    fetchMock: [{ match: '/api/player/data-export', json: { error: 'server_error' }, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Descargar mis datos' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      /No se pudo generar la exportación/,
    )
  },
}

/** Contraste MEDIDO de los textos y del botón de alarma. Corre en claro y en oscuro. */
export const ContrasteMedido: Story = {
  args: { futureConfirmedCount: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const medidos: Array<[string, HTMLElement]> = [
      ['irreversible', canvas.getByText(/Esta acción es irreversible/)],
      ['se borran', canvas.getByText(/tu vínculo con los complejos/)],
      ['ley', canvas.getByText(/Ley 25\.326/)],
      ['aviso de reservas', canvas.getByText(/quedan sin titular/)],
      ['ver reservas', canvas.getByRole('link', { name: 'Ver mis reservas' })],
      ['descargar', canvas.getByRole('button', { name: 'Descargar mis datos' })],
      ['eliminar', canvas.getByRole('button', { name: 'Eliminar mi cuenta' })],
    ]
    for (const [nombre, el] of medidos) {
      const ratio = await paintedContrast(el)
      await expect(ratio, nombre).toBeGreaterThanOrEqual(4.5)
    }
  },
}
