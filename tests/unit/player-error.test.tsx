// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import PlayerError from '@/app/(player)/error'

afterEach(cleanup)

describe('(player) error boundary', () => {
  it('dice qué pantalla no cargó y no abre un <main> dentro del <main> del cascarón', () => {
    const { container } = render(
      <PlayerError
        error={Object.assign(new Error('boom'), { digest: 'abc123' })}
        reset={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'No pudimos cargar tu cuenta' }),
    ).toBeTruthy()
    expect(container.querySelector('main')).toBeNull()
    expect(screen.getByText('abc123')).toBeTruthy()
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
  })
})
