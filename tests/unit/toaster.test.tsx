// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  renderHook,
  act,
} from '@testing-library/react'
import { Toaster } from '@/components/ui/toaster'
import { toast, useToast } from '@/hooks/use-toast'

afterEach(async () => {
  cleanup()
  // `toasts` es estado a nivel de módulo (no de componente): sin esto, el toast
  // de un test queda montado y lo agarra el `findByRole` del test siguiente.
  const { result, unmount } = renderHook(() => useToast())
  await act(async () => {
    result.current.toasts.forEach((t) => result.current.dismiss(t.id))
    // dismiss() remueve del array recién a los 200ms (animación de salida) —
    // esperar acá evita el warning de act() por ese setTimeout tardío.
    await new Promise((r) => setTimeout(r, 250))
  })
  unmount()
})

describe('Toaster — acción "Deshacer" (§6.2 clase A)', () => {
  it('renderiza el botón de acción con su label cuando el toast trae `action`', async () => {
    render(<Toaster />)
    const onClick = vi.fn()

    toast({ title: 'Día cerrado quitado', action: { label: 'Deshacer', onClick } })

    expect(await screen.findByRole('button', { name: 'Deshacer' })).toBeTruthy()
  })

  it('clickear la acción la ejecuta y descarta el toast', async () => {
    render(<Toaster />)
    const onClick = vi.fn()

    toast({ title: 'Sacado del plantel', action: { label: 'Deshacer', onClick } })

    const actionBtn = await screen.findByRole('button', { name: 'Deshacer' })
    fireEvent.click(actionBtn)

    expect(onClick).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByText('Sacado del plantel')).toBeNull()
    })
  })

  it('un toast sin `action` no renderiza botón de acción', async () => {
    render(<Toaster />)

    toast({ title: 'Producto pausado' })

    await screen.findByText('Producto pausado')
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
  })
})
