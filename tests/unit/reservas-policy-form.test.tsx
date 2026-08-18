// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

// useActionState/useFormStatus son undefined en vitest: los mockeamos para
// testear la presentacion del feedback (#21).
//
// React 19: useFormState (react-dom) pasó a ser useActionState (react), así que
// el mock tiene que ir a 'react'. useFormStatus NO se movió: sigue en react-dom.
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

import { ReservasPolicyForm } from '@/app/(admin)/settings/reservas/ReservasPolicyForm'

const SETTINGS = {} as unknown as TenantSettings

// Ya no hace falta un vi.mock de '@/app/(admin)/settings/reservas/actions' para
// evitar que drizzle/postgres se carguen al importar el componente: la Server
// Action entra por prop, así que el componente directamente no la importa.
const noopAction = vi.fn(async () => ({ success: true as const }))

afterEach(() => cleanup())

describe('ReservasPolicyForm (#21)', () => {
  it('muestra el error cuando la action devuelve success:false', () => {
    formState.mockReturnValue({ success: false, error: 'PIN requerido.' })
    render(<ReservasPolicyForm s={SETTINGS} action={noopAction} />)
    expect(screen.getByRole('alert').textContent).toContain('PIN requerido.')
  })

  it('no muestra alerta de error cuando el estado es success', () => {
    formState.mockReturnValue({ success: true })
    render(<ReservasPolicyForm s={SETTINGS} action={noopAction} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/**
 * Bug reproducido en producción el 2026-08-18: el dueño elegía "Requerir seña"
 * + 100%, guardaba, la Server Action escribía bien en la base, y el form volvía
 * SOLO a "Sin seña" — así que concluía que no se había guardado y reintentaba
 * (dejando `deposit_percentage` en 0 de paso).
 *
 * Causa medida: React 19 resetea el `<form action={serverAction}>` cuando la
 * action termina, y `@radix-ui/react-radio-group` escucha ese `reset` para
 * volver su valor al que tenía AL MONTAR. Como el grupo es controlado, eso es
 * un `onValueChange` con el valor viejo que le pisa el estado al form. No tenía
 * nada que ver con el cache de `getStaffTenant`: en ese mismo render las props
 * del servidor ya traían el valor nuevo.
 *
 * El test dispara el `reset` a mano porque es exactamente lo que hace React al
 * terminar la action (`form.reset()`), y así no depende de simular el submit.
 */
describe('ReservasPolicyForm — el reset del form no pisa la selección', () => {
  const SIN_SENA = {
    requires_deposit: false,
    deposit_percentage: 0,
  } as unknown as TenantSettings

  const senaControl = () => screen.getByRole('radio', { name: 'Requerir seña' })

  it('mantiene "Requerir seña" después de que React resetea el form', () => {
    formState.mockReturnValue({ success: true })
    const { container } = render(<ReservasPolicyForm s={SIN_SENA} action={noopAction} />)

    fireEvent.click(senaControl())
    expect(senaControl()).toHaveAttribute('aria-checked', 'true')

    fireEvent.reset(container.querySelector('form')!)

    expect(senaControl()).toHaveAttribute('aria-checked', 'true')
    expect(container.querySelector('input[name="requiresDeposit"]')).toHaveValue('true')
  })

  it('mantiene el porcentaje elegido después del reset', () => {
    formState.mockReturnValue({ success: true })
    const { container } = render(<ReservasPolicyForm s={SIN_SENA} action={noopAction} />)

    fireEvent.click(senaControl())
    fireEvent.click(screen.getByRole('radio', { name: '100%' }))
    expect(container.querySelector('input[name="depositPercentage"]')).toHaveValue('100')

    fireEvent.reset(container.querySelector('form')!)

    expect(screen.getByRole('radio', { name: '100%' })).toHaveAttribute('aria-checked', 'true')
    expect(container.querySelector('input[name="depositPercentage"]')).toHaveValue('100')
  })
})
