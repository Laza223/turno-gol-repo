// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// next/image necesita config de runtime (Invalid URL en happy-dom si ningún test previo del
// worker fijó la URL de la página): se simplifica a un <img>.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, never>)} />
  },
}))

import TenantGallery from '@/app/(public)/[slug]/components/TenantGallery'

afterEach(() => cleanup())

const photos = (n: number) => Array.from({ length: n }, (_, i) => `/bg-${i}.png`)

// Portal de vidrio (F4): cada foto se ve en la fila (deslizable en el celu) y es un botón que abre
// el visor en esa foto. El viejo "Ver N fotos" del celular ya no hace falta.
describe('TenantGallery', () => {
  it('cada foto es un botón que abre el visor en esa foto', () => {
    render(<TenantGallery photos={photos(6)} name="Cancha X" />)
    expect(screen.queryByRole('dialog')).toBeNull()

    const thumbs = screen.getAllByRole('button')
    expect(thumbs).toHaveLength(6)
    fireEvent.click(thumbs[0]!)

    expect(screen.getByRole('dialog', { name: 'Fotos de Cancha X' })).toBeTruthy()
    expect(screen.getByText('1 / 6')).toBeTruthy()
  })

  it('abrir otra foto arranca el visor en ella', () => {
    render(<TenantGallery photos={photos(6)} name="Cancha X" />)
    fireEvent.click(screen.getAllByRole('button')[3]!)
    expect(screen.getByText('4 / 6')).toBeTruthy()
  })
})
