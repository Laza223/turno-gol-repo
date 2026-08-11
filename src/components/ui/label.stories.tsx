import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Input } from './input'
import { Label } from './label'

/**
 * `<label>` nativo (pese al nombre, NO usa @radix-ui/react-label). Siempre
 * aparece emparejado a un control de formulario — la story lo reproduce con
 * un `Input` real vía `htmlFor`/`id`, que es como se usa en toda la app.
 */
const meta = {
  title: 'Design System/Label',
  component: Label,
  parameters: { layout: 'centered' },
  args: { children: 'Nombre del complejo' },
  decorators: [
    (Story) => (
      <div className="w-72 space-y-1.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <>
      <Label {...args} htmlFor="demo-label-input" />
      <Input id="demo-label-input" placeholder="Complejo San Martín" />
    </>
  ),
}

/**
 * `peer-disabled`: la opacidad baja cuando el input hermano (`peer`) está
 * disabled. Tailwind resuelve `peer` vía combinador de hermano siguiente
 * (`~`), así que el input `peer` tiene que ir ANTES del label en el DOM.
 */
export const ConInputDeshabilitado: Story = {
  render: (args) => (
    <>
      <Input id="demo-label-disabled" disabled defaultValue="No editable" className="peer mb-1.5" />
      <Label {...args} htmlFor="demo-label-disabled" />
    </>
  ),
}
