// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// useFormStatus es undefined en vitest; lo mockeamos para testear la presentacion.
const formStatus = vi.fn()
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, useFormStatus: () => formStatus() }
})

import { SubmitButton } from '@/components/ui/submit-button'

afterEach(() => cleanup())

describe('SubmitButton (#20)', () => {
  it('muestra el label y queda habilitado cuando no esta pending', () => {
    formStatus.mockReturnValue({ pending: false })
    render(<SubmitButton>Guardar</SubmitButton>)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    expect(btn.textContent).toBe('Guardar')
  })

  it('se deshabilita y muestra pendingLabel mientras la action corre', () => {
    formStatus.mockReturnValue({ pending: true })
    render(<SubmitButton pendingLabel="Procesando…">Guardar</SubmitButton>)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toBe('Procesando…')
  })
})

describe('settings/pin/page usa SubmitButton (#20)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/(admin)/settings/pin/page.tsx'),
    'utf8',
  )
  it('reemplaza el Button estatico por SubmitButton', () => {
    expect(src).toContain("from '@/components/ui/submit-button'")
    expect(src).toContain('<SubmitButton')
    expect(src).not.toContain('<Button type="submit"')
  })
})
