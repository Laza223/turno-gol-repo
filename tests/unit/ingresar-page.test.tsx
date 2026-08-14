// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// React 19: useFormState (react-dom) pasó a ser useActionState (react), así que
// el mock tiene que ir a 'react'. useFormStatus NO se movió: sigue en react-dom.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
  }
})
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  }
})

const searchStr = vi.fn(() => '')
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchStr()),
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, never>)} />
  },
}))

vi.mock('@/app/(auth)/ingresar/actions', () => ({
  playerLoginAction: vi.fn(),
  startGoogleLoginFromIngresar: vi.fn(),
}))

import IngresarPage from '@/app/(auth)/ingresar/page'

beforeEach(() => searchStr.mockReturnValue(''))
afterEach(() => cleanup())

describe('IngresarPage — acceso jugador', () => {
  it('renderiza el form de email con el submit "Enviarme el enlace"', () => {
    render(<IngresarPage />)
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /enviarme el enlace/i })).toBeTruthy()
  })

  it('muestra el aviso de cuenta eliminada con ?deleted=1', () => {
    searchStr.mockReturnValue('deleted=1')
    render(<IngresarPage />)
    expect(screen.getByText(/tu cuenta fue eliminada/i)).toBeTruthy()
  })

  it('ofrece reservar en Explorar para primera vez', () => {
    render(<IngresarPage />)
    const link = screen.getByRole('link', { name: /Descubrí complejos/i })
    expect(link.getAttribute('href')).toBe('/explorar')
  })
})
