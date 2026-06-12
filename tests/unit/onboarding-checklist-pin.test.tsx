// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import type { ChecklistState } from '@/app/(admin)/dashboard/queries'

// Mock the server action import (mismo approach que clipboard-fallback.test.tsx)
vi.mock('@/app/(admin)/dashboard/actions', () => ({
  markPublicLinkSharedAction: vi.fn(),
}))

// Estado base incompleto (firstBookingReceived: false) para que el checklist
// no arranque minimizado y el ítem de PIN sea visible en ambos escenarios.
function buildState(overrides: Partial<ChecklistState>): ChecklistState {
  return {
    accountCreated: true,
    complexData: true,
    hasCourts: true,
    hasSchedule: true,
    pinConfigured: true,
    mpConnected: true,
    publicLinkShared: true,
    firstBookingReceived: false,
    ...overrides,
  }
}

const baseProps = {
  tenantSlug: 'test-slug',
  appUrl: 'https://turnogol.app',
}

describe('OnboardingChecklist — paso PIN de seguridad', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('sin PIN: el ítem aparece pendiente con link "Configurar" a /settings/pin', () => {
    render(
      <OnboardingChecklist {...baseProps} state={buildState({ pinConfigured: false })} />,
    )

    const label = screen.getByText('PIN de seguridad configurado')
    expect(label.className).not.toContain('line-through')

    const item = label.closest('li')
    expect(item).not.toBeNull()
    const link = within(item as HTMLElement).getByRole('link', { name: /configurar/i })
    expect(link.getAttribute('href')).toBe('/settings/pin')
  })

  it('con PIN: el ítem aparece completado (line-through) y sin link', () => {
    render(
      <OnboardingChecklist {...baseProps} state={buildState({ pinConfigured: true })} />,
    )

    const label = screen.getByText('PIN de seguridad configurado')
    expect(label.className).toContain('line-through')

    const item = label.closest('li')
    expect(item).not.toBeNull()
    expect(within(item as HTMLElement).queryByRole('link', { name: /configurar/i })).toBeNull()
  })

  it('el contador refleja el paso de PIN en el total', () => {
    render(
      <OnboardingChecklist {...baseProps} state={buildState({ pinConfigured: false })} />,
    )

    // 6 de 8: faltan pinConfigured y firstBookingReceived.
    expect(screen.getByText('6 de 8 completados')).not.toBeNull()
  })
})
