// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

/**
 * Segunda instancia de la misma clase que el bug de `/settings/reservas`
 * (2026-08-18): un grupo de Radix dentro de un `<form action={serverAction}>`
 * con el valor en el estado del padre. React 19 resetea el form al terminar la
 * action y Radix aprovecha ese `reset` para volver al valor DE MONTAJE, pisando
 * lo que el usuario acababa de guardar. Ver `radix-form-detach.ts`.
 */

const formState = vi.fn()
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: (_action: unknown, initial: unknown) => [
      formState() ?? initial,
      vi.fn(),
      false,
    ],
  }
})
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  }
})

import { AvisosForm } from '@/app/(admin)/settings/avisos/AvisosForm'

const SIN_EMAIL = { daily_summary_email_opt_in: false } as unknown as TenantSettings
const noopAction = vi.fn(async () => ({ success: true as const }))

afterEach(() => cleanup())

describe('AvisosForm — el reset del form no pisa la selección', () => {
  it('mantiene "Recibir por email" después de que React resetea el form', () => {
    formState.mockReturnValue({ success: true })
    const { container } = render(<AvisosForm s={SIN_EMAIL} action={noopAction} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Recibir por email' }))
    expect(screen.getByRole('radio', { name: 'Recibir por email' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    fireEvent.reset(container.querySelector('form')!)

    expect(screen.getByRole('radio', { name: 'Recibir por email' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(container.querySelector('input[name="dailySummaryEmailOptIn"]')).toHaveValue('true')
  })
})
