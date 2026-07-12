import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from './button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './sheet'

/**
 * @radix-ui/react-dialog reexpuesto como drawer. `side="left"` reproduce el
 * sidebar mobile del admin (admin-sidebar.tsx, `hideClose` porque el propio
 * contenido trae su botón de cierre); `side="bottom"` es el bottom-sheet de
 * "Todos los filtros" en /explorar.
 */
const meta = {
  title: 'Design System/Sheet',
  component: Sheet,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Sheet>

export default meta
type Story = StoryObj<typeof meta>

export const SideLeft: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline">Abrir menú</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>TurnoGol</SheetTitle>
        </SheetHeader>
        <nav className="mt-4 flex flex-col gap-1 text-sm">
          <a className="rounded-lg px-3 py-2 hover:bg-accent" href="#dashboard">Dashboard</a>
          <a className="rounded-lg px-3 py-2 hover:bg-accent" href="#grilla">Grilla</a>
          <a className="rounded-lg px-3 py-2 hover:bg-accent" href="#reservas">Reservas</a>
        </nav>
      </SheetContent>
    </Sheet>
  ),
}

export const SideBottom: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline">Todos los filtros</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <p className="mt-3 text-sm text-muted-foreground">Localidad, fecha, horario y formato de cancha.</p>
      </SheetContent>
    </Sheet>
  ),
}

/** `hideClose`: sin la X built-in, porque `SheetHeader`/el contenido trae su propio cierre. */
export const SinBotonDeCierre: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline">Abrir menú</Button>
      </SheetTrigger>
      <SheetContent side="left" hideClose>
        <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
        <p className="text-sm text-muted-foreground">Sin X visible — el contenido maneja su propio cierre.</p>
      </SheetContent>
    </Sheet>
  ),
}

export const AbrirYCerrar: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Abrir menú</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>TurnoGol</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir menú' }))

    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
