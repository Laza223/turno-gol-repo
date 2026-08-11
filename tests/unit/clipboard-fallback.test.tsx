// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'

// La Server Action entra por PROP (ver el comentario en onboarding-checklist.tsx):
// ya no hace falta mockear el módulo './actions' para evitar arrastrar drizzle.
// Provide a baseline state where the copy button is rendered (not minimized).
// 7 items total: accountCreated, complexData, hasCourts, hasSchedule,
// mpConnected, publicLinkShared, firstBookingReceived.
// Set publicLinkShared=false so the "copy-link" action button is visible.
// 5/7 completed → not minimized.
const baseProps = {
  state: {
    accountCreated: true,
    complexData: true,
    hasCourts: true,
    hasSchedule: true,
    mpConnected: true,
    publicLinkShared: false,
    firstBookingReceived: false,
  },
  tenantSlug: 'test-slug',
  appUrl: 'https://turnogol.app',
  action: vi.fn(async () => ({ success: true as const })),
  onDismiss: vi.fn(async () => ({ success: true as const })),
}

describe('OnboardingChecklist clipboard fallback', () => {
  let originalClipboard: typeof navigator.clipboard | undefined
  let originalPrompt: typeof window.prompt

  beforeEach(() => {
    originalClipboard = navigator.clipboard
    originalPrompt = window.prompt
  })

  afterEach(() => {
    cleanup()
    if (originalClipboard !== undefined) {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
        writable: true,
      })
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
        writable: true,
      })
    }
    window.prompt = originalPrompt
    vi.restoreAllMocks()
  })

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
    window.prompt = vi.fn()

    render(<OnboardingChecklist {...baseProps} />)
    const copyBtn = screen.getByRole('button', { name: /copiar/i })
    fireEvent.click(copyBtn)

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://turnogol.app/test-slug'))
    expect(window.prompt).not.toHaveBeenCalled()
  })

  it('falls back to window.prompt when clipboard is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    const promptMock = vi.fn()
    window.prompt = promptMock

    render(<OnboardingChecklist {...baseProps} />)
    const copyBtn = screen.getByRole('button', { name: /copiar/i })
    fireEvent.click(copyBtn)

    await waitFor(() =>
      expect(promptMock).toHaveBeenCalledWith(
        'Copiá el enlace público:',
        'https://turnogol.app/test-slug',
      ),
    )
  })

  it('falls back to window.prompt when writeText throws (e.g. Safari Private Mode)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Document is not focused'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
    const promptMock = vi.fn()
    window.prompt = promptMock

    render(<OnboardingChecklist {...baseProps} />)
    const copyBtn = screen.getByRole('button', { name: /copiar/i })
    fireEvent.click(copyBtn)

    await waitFor(() =>
      expect(promptMock).toHaveBeenCalledWith(
        'Copiá el enlace público:',
        'https://turnogol.app/test-slug',
      ),
    )
  })
})
