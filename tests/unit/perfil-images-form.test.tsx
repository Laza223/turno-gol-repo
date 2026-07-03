// @vitest-environment happy-dom
import '@testing-library/jest-dom'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PerfilImagesForm } from '@/app/(admin)/settings/perfil/PerfilImagesForm'

vi.mock('@/app/(admin)/settings/perfil/actions', () => ({
  setTenantImageAction: vi.fn(),
  removeTenantImageAction: vi.fn(),
}))

describe('PerfilImagesForm', () => {
  it('sin logo/portada muestra los dos dropzones vacíos', () => {
    render(<PerfilImagesForm logoUrl={null} coverUrl={null} />)
    expect(screen.getByText(/subí el logo/i)).toBeInTheDocument()
    expect(screen.getByText(/subí una portada/i)).toBeInTheDocument()
  })

  it('con logo existente muestra la imagen y no el dropzone', () => {
    render(<PerfilImagesForm logoUrl="https://media.turnogol.com/t1/logo-a.webp" coverUrl={null} />)
    expect(screen.getAllByRole('button', { name: /quitar/i })).toHaveLength(1)
  })
})
