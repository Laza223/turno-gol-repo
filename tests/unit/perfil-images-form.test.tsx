// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PerfilImagesForm } from '@/app/(admin)/settings/perfil/PerfilImagesForm'

// Ya no hace falta un vi.mock de '.../perfil/actions' para evitar cargar
// drizzle/postgres al importar el componente: las Server Actions entran por
// prop (ver ReservasPolicyForm.tsx).
const setImageAction = vi.fn(async () => ({ success: true as const, url: 'https://example.test/x.webp' }))
const removeImageAction = vi.fn(async () => ({ success: true as const }))

describe('PerfilImagesForm', () => {
  it('sin logo/portada muestra los dos dropzones vacíos', () => {
    render(
      <PerfilImagesForm
        logoUrl={null}
        coverUrl={null}
        setImageAction={setImageAction}
        removeImageAction={removeImageAction}
      />,
    )
    expect(screen.getByText(/subí el logo/i)).toBeInTheDocument()
    expect(screen.getByText(/subí una portada/i)).toBeInTheDocument()
  })

  it('con logo existente muestra la imagen y no el dropzone', () => {
    render(
      <PerfilImagesForm
        logoUrl="https://media.turnogol.com/t1/logo-a.webp"
        coverUrl={null}
        setImageAction={setImageAction}
        removeImageAction={removeImageAction}
      />,
    )
    expect(screen.getAllByRole('button', { name: /quitar/i })).toHaveLength(1)
  })
})
