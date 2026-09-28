// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/modules/referrals/referral.service', () => ({
  resolveReferralCode: vi.fn(),
}))

import ReferralLandingPage from '@/app/(business)/r/[code]/page'
import { resolveReferralCode } from '@/modules/referrals/referral.service'

describe('/r/[code] — landing de referidos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('código inválido o inexistente: redirige a /para-complejos', async () => {
    vi.mocked(resolveReferralCode).mockResolvedValue(null)

    await expect(
      ReferralLandingPage({ params: Promise.resolve({ code: 'nope' }) }),
    ).rejects.toThrow('REDIRECT:/para-complejos')
  })

  it('código válido: muestra el nombre del complejo y los dos CTA con los href correctos', async () => {
    vi.mocked(resolveReferralCode).mockResolvedValue({
      tenantId: 't-1',
      name: 'Canchas del Sur',
    })

    render(await ReferralLandingPage({ params: Promise.resolve({ code: 'AH2K9MZP' }) }))

    expect(screen.getByText(/Canchas del Sur te recomienda/)).toBeTruthy()

    const whatsappLink = screen.getByRole('link', { name: /whatsapp/i })
    expect(whatsappLink.getAttribute('href')).toContain('wa.me/5492323346976')
    expect(whatsappLink.getAttribute('href')).toContain(
      encodeURIComponent('Hola, vengo de parte de Canchas del Sur'),
    )

    const registerLink = screen.getByRole('link', { name: /crear mi cuenta/i })
    expect(registerLink.getAttribute('href')).toBe('/register?ref=AH2K9MZP')
  })
})
