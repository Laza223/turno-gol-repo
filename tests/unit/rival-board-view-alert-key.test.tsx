// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BoardView } from '@/app/(player)/rival/BoardView'

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/rival',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(cleanup)

const tenants = [
  { id: 't1', name: 'El Vagón' },
  { id: 't2', name: 'Open Door' },
]
const ok = vi.fn(async () => ({ success: true as const }))
const idle = vi.fn(async () => ({ status: 'idle' as const }))

function view(selectedTenantId: string) {
  return (
    <BoardView
      items={[]}
      tenants={tenants}
      selectedTenantId={selectedTenantId}
      nextHref={null}
      now={new Date('2026-03-14T18:30:00Z')}
      alert={{
        alertTenants: tenants,
        signedIn: true,
        subscribed: [],
        subscribeAction: ok,
        unsubscribeAction: ok,
      }}
      entry={{ sendMagicLink: idle, startGoogle: idle }}
    />
  )
}

describe('BoardView: el aviso sigue al complejo filtrado', () => {
  it('al pasar de un complejo vacío a otro, el select del aviso cambia con el filtro', () => {
    const { rerender } = render(view('t1'))
    const trigger = () => screen.getByRole('button', { name: 'Avisame de partidos en' })
    expect(trigger().textContent).toContain('El Vagón')
    rerender(view('t2'))
    expect(trigger().textContent).toContain('Open Door')
  })
})
