import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { InviteStaffDialog } from './InviteStaffDialog'

// StaffActionResult vive en './actions' ('use server'): las stories no pueden
// importar NADA de ahí, ni siquiera un `import type` (no-restricted-imports
// no distingue type-only para el patrón '**/actions'). Se deriva el tipo del
// propio prop del componente en vez de importarlo directo.
type InviteActionResult = Awaited<ReturnType<ComponentProps<typeof InviteStaffDialog>['inviteAction']>>

/**
 * `inviteAction` ya llegaba por PROP antes de esta auditoría — es el
 * template original de DI del repo (ver STORYBOOK_ARCHITECTURE.md).
 * Se monta ya abierto (`defaultOpen`), como lo hace InviteStaffButton.
 */
const meta = {
  title: 'Admin/Staff/InviteStaffDialog',
  component: InviteStaffDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    onClose: fn(),
  },
} satisfies Meta<typeof InviteStaffDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Roles fijos (STAFF_ROLES): Encargado (DEFAULT_INVITE_ROLE) preseleccionado. */
export const Default: Story = {
  args: { inviteAction: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const manager = canvas.getByRole('radio', { name: /encargado/i }) as HTMLInputElement
    await expect(manager.checked).toBe(true)
  },
}

export const Enviando: Story = {
  args: { inviteAction: fn(() => new Promise<InviteActionResult>(() => {})) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Rodrigo')
    await userEvent.type(canvas.getByLabelText('Apellido'), 'Fernández')
    await userEvent.type(canvas.getByLabelText('Email'), 'rodrigo@complejofenix.com.ar')
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar invitación' }))
    const pending = await canvas.findByRole('button', { name: 'Enviando…' })
    await expect(pending).toBeDisabled()
  },
}

export const ErrorDelServidor: Story = {
  args: {
    inviteAction: fn(async () => ({
      success: false as const,
      error: 'Este email ya es miembro activo del complejo.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Rodrigo')
    await userEvent.type(canvas.getByLabelText('Apellido'), 'Fernández')
    await userEvent.type(canvas.getByLabelText('Email'), 'rodrigo@complejofenix.com.ar')
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar invitación' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Este email ya es miembro activo del complejo.',
    )
  },
}

/** Éxito: toast + onClose (la action ya hizo revalidatePath('/staff') del lado server). */
export const Exito: Story = {
  args: { inviteAction: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Rodrigo')
    await userEvent.type(canvas.getByLabelText('Apellido'), 'Fernández')
    await userEvent.type(canvas.getByLabelText('Email'), 'rodrigo@complejofenix.com.ar')
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar invitación' }))
    await expect(
      await within(document.body).findByText('Invitación enviada'),
    ).toBeInTheDocument()
    await expect(args.onClose).toHaveBeenCalled()
  },
}
