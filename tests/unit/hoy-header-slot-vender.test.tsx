// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ADMIN_HEADER_SLOT_ID } from '@/components/layout/admin-header-slot'
import { VenderContext } from '@/components/layout/vender-context'
import { HoyHeaderSlot } from '@/app/(admin)/dashboard/HoyHeaderSlot'

beforeEach(() => {
  const host = document.createElement('div')
  host.id = ADMIN_HEADER_SLOT_ID
  document.body.appendChild(host)
})

afterEach(() => {
  cleanup()
  document.getElementById(ADMIN_HEADER_SLOT_ID)?.remove()
})

describe('HoyHeaderSlot — botón Vender', () => {
  it('con proveedor de Vender: muestra el botón', () => {
    render(
      <VenderContext value={{ open: false, setOpen: vi.fn(), prefetch: vi.fn() }}>
        <HoyHeaderSlot dateLabel="jueves 24 de septiembre" shortDateLabel="jue 24 sep" />
      </VenderContext>,
    )
    expect(screen.getByRole('button', { name: /vender/i })).toBeTruthy()
  })

  it('sin proveedor (canteen_enabled=false): ni botón ni error', () => {
    render(<HoyHeaderSlot dateLabel="jueves 24 de septiembre" shortDateLabel="jue 24 sep" />)
    expect(screen.queryByRole('button', { name: /vender/i })).toBeNull()
  })
})
