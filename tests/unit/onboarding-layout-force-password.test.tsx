// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// El dueño de un alta asistida (decisión 2026-10-22) entra con una contraseña
// temporal y su primer destino es el wizard: sin este gate la podía usar en todo
// `/onboarding/*`, porque solo `(admin)/layout.tsx` exigía cambiarla.

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/app/onboarding/motion-provider', () => ({
  WizardMotionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/app/onboarding/components/WizardChrome', () => ({
  WizardChrome: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import OnboardingLayout from '@/app/onboarding/layout'
import { extractAuthUser } from '@/modules/auth/auth.middleware'

const STAFF_USER = {
  type: 'staff',
  staffUserId: 'staff-1',
  tenantId: 't-1',
  id: 'auth-1',
  email: 'dueno@complejo.test',
  forcePasswordChange: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OnboardingLayout — contraseña temporal', () => {
  it('con force_password_change manda a /reset-password antes de mostrar el wizard', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue({
      ...STAFF_USER,
      forcePasswordChange: true,
    } as never)

    await expect(OnboardingLayout({ children: <p>wizard</p> })).rejects.toThrow(
      'REDIRECT:/reset-password',
    )
  })

  it('sin el flag (self-signup) entra al wizard', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)

    render(await OnboardingLayout({ children: <p>wizard</p> }))

    expect(screen.getByText('wizard')).toBeTruthy()
  })

  it('sin sesión de staff sigue mandando a /login', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(null)

    await expect(OnboardingLayout({ children: <p>wizard</p> })).rejects.toThrow('REDIRECT:/login')
  })
})
