// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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
    expect(input.className).toContain('focus-visible:ring-emerald-500')
  })

  it('cancel + confirm buttons use focus-visible:ring', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Test"
        onConfirm={async () => {}}
      />,
    )
    const cancel = screen.getByRole('button', { name: /cancelar/i })
    const confirm = screen.getByRole('button', { name: /confirmar/i })
    expect(cancel.className).toContain('focus-visible:ring-2')
    expect(cancel.className).toContain('focus-visible:ring-emerald-500')
    expect(confirm.className).toContain('focus-visible:ring-2')
    expect(confirm.className).toContain('focus-visible:ring-emerald-500')
  })
})
