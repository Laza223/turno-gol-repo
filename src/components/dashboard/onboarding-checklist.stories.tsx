import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { ChecklistState } from '@/app/(admin)/dashboard/queries'
import { OnboardingChecklist } from './onboarding-checklist'

/**
 * `action` entra por prop (ver el comentario en onboarding-checklist.tsx):
 * `./actions` es `'use server'` y arrastra drizzle/postgres + `node:async_hooks`.
 * El TIPO se toma de `ComponentProps<typeof OnboardingChecklist>['action']` en
 * vez de `import type` directo desde `./actions`: el lint de stories bloquea
 * CUALQUIER import (valor o tipo) que matchee el patrón `**\/actions` — no
 * distingue `import type`, así que ni siquiera un type-only import pasa ahí.
 * `.card-premium` es una superficie opaca propia — se reproduce el fondo
 * `content-area-gradient` del dashboard igual que en la app real.
 */
type Action = ComponentProps<typeof OnboardingChecklist>['action']
type DismissAction = ComponentProps<typeof OnboardingChecklist>['onDismiss']

const markShared: Action = async () => ({ success: true })
const markSharedError: Action = async () => ({
  success: false,
  error: 'No pudimos guardar el paso ahora.',
})
const markDismissed: DismissAction = async () => ({ success: true })

const PENDING_STATE: ChecklistState = {
  accountCreated: true,
  complexData: true,
  hasCourts: true,
  hasSchedule: true,
  mpConnected: false,
  publicLinkShared: false,
  firstBookingReceived: false,
}

const meta = {
  title: 'Admin/Dashboard/OnboardingChecklist',
  component: OnboardingChecklist,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="content-area-gradient max-w-xl rounded-xl p-6">
        <Story />
      </div>
    ),
  ],
  // El estado plegado/desplegado persiste en localStorage (`minimized` lee
  // `tg-hint-checklist-minimized` post-mount): sin este reset, una story
  // "Completo" corrida antes deja la key en '1' y la siguiente story arranca
  // ya minimizada, aunque su `state` diga lo contrario.
  beforeEach: () => {
    window.localStorage.removeItem('tg-hint-checklist-minimized')
  },
  args: {
    tenantSlug: 'complejo-fenix',
    appUrl: 'https://turnogol.app',
    action: fn(markShared),
    onDismiss: fn(markDismissed),
  },
} satisfies Meta<typeof OnboardingChecklist>

export default meta
type Story = StoryObj<typeof meta>

/** Pasos pendientes (5/7): siempre visibles con su CTA, los completados plegados. */
export const Pendiente: Story = {
  args: { state: PENDING_STATE },
}

/** 100% completo: card minimizada a una sola fila. */
export const Completo: Story = {
  args: {
    state: {
      accountCreated: true,
      complexData: true,
      hasCourts: true,
      hasSchedule: true,
      mpConnected: true,
      publicLinkShared: true,
      firstBookingReceived: true,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Tu complejo está 100% listo!')).toBeInTheDocument()
  },
}

/** Copiar el link público: el botón pasa a "Copiado!" y persiste el paso. */
export const CopiarLink: Story = {
  args: { state: PENDING_STATE },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: fn(async () => {}) },
      configurable: true,
    })
    await userEvent.click(canvas.getByRole('button', { name: /copiar link/i }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Copiado!' })).toBeInTheDocument())
    await expect(args.action).toHaveBeenCalledOnce()
  },
}

/** El paso "link compartido" falla al persistir (rate limit, red): notice suave, no bloquea. */
export const ErrorAlPersistirPaso: Story = {
  args: {
    state: PENDING_STATE,
    action: fn(markSharedError),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: fn(async () => {}) },
      configurable: true,
    })
    await userEvent.click(canvas.getByRole('button', { name: /copiar link/i }))
    await waitFor(() =>
      expect(canvas.getByText('No pudimos guardar el paso ahora.')).toBeInTheDocument(),
    )
  },
}

/** Desplegar los pasos ya completados (plegados por default). */
export const VerCompletados: Story = {
  args: {
    state: { ...PENDING_STATE, hasCourts: true, hasSchedule: true, complexData: true, accountCreated: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: /pasos completados/i })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText('Cuenta creada')).toBeVisible()
  },
}

/**
 * Descarte manual: feedback transitorio "Descartado ✓" y persiste checklist_dismissed_at.
 * El botón "Descartar" es admin-only (`markChecklistDismissedAction`, ver el
 * comment de `handleDismiss` en onboarding-checklist.tsx): sin `staffRole:
 * 'admin'` en args, el componente ni siquiera lo renderiza.
 */
export const Descartar: Story = {
  args: { state: PENDING_STATE, staffRole: 'admin' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Descartar' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Descartado ✓' })).toBeInTheDocument(),
    )
    await expect(args.onDismiss).toHaveBeenCalledOnce()
  },
}
