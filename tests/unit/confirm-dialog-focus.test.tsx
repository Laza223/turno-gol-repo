// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it, expect } from 'vitest'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

afterEach(cleanup)

describe('ConfirmDialog focus-visible rings', () => {
  it('confirmation phrase input uses focus-visible:ring', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Test"
        confirmationPhrase="eliminar"
        onConfirm={async () => {}}
      />,
    )
    const input = screen.getByLabelText(/escribí/i)
    expect(input.className).toContain('focus-visible:ring-2')
    expect(input.className).toContain('focus-visible:ring-ring')
  })

  it('cancel + confirm buttons use focus-visible:ring', () => {
    render(<ConfirmDialog open onOpenChange={() => {}} title="Test" onConfirm={async () => {}} />)
    const cancel = screen.getByRole('button', { name: /cancelar/i })
    const confirm = screen.getByRole('button', { name: /confirmar/i })
    expect(cancel.className).toContain('focus-visible:ring-2')
    expect(cancel.className).toContain('focus-visible:ring-ring')
    expect(confirm.className).toContain('focus-visible:ring-2')
    expect(confirm.className).toContain('focus-visible:ring-ring')
  })
})
