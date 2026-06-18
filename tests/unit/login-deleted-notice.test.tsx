// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// useFormState/useFormStatus son undefined en vitest: mockeamos react-dom.
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
    useFormState: (_action: unknown, initial: unknown) => [initial, vi.fn()],
  }
})

// Controla el query string visto por useSearchParams en cada test.
const searchStr = vi.fn(() => '')
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchStr()),
}))

// next/image necesita config de runtime: lo simplificamos a un <img>.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, never>)} />
  },
}))

// Evitar cargar la Server Action real (Supabase/db) al importar el page.
vi.mock('@/app/(auth)/login/actions', () => ({
  loginAction: vi.fn(),
  playerLoginAction: vi.fn(),
  resendConfirmationAction: vi.fn(),
}))

import LoginPage from '@/app/(auth)/login/page'

beforeEach(() => searchStr.mockReturnValue(''))
afterEach(() => cleanup())

describe('LoginPage — ?deleted=1 (#27)', () => {
  it('muestra el aviso de cuenta eliminada cuando deleted=1', () => {
    searchStr.mockReturnValue('deleted=1')
    render(<LoginPage />)
    expect(screen.getByText(/tu cuenta fue eliminada/i)).toBeTruthy()
  })

  it('no muestra el aviso sin el query param', () => {
    render(<LoginPage />)
    expect(screen.queryByText(/tu cuenta fue eliminada/i)).toBeNull()
  })
})
