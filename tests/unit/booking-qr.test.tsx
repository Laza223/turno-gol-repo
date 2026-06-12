// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { encode } from 'uqr'
import BookingQR from '@/components/booking/BookingQR'

afterEach(() => cleanup())

const BOOKING_ID = '0b8f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'
const URL = `https://turnogol.app/reserva/${BOOKING_ID}/verificar`

describe('BookingQR', () => {
  it('genera un SVG válido dado un bookingId (viewBox cuadrado + módulos pintados)', () => {
    const { container } = render(<BookingQR value={URL} label="QR de la reserva" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    // El viewBox refleja el tamaño real de la matriz QR (cuadrada, con quiet zone).
    const expected = encode(URL, { ecc: 'M', border: 2 })
    expect(svg!.getAttribute('viewBox')).toBe(`0 0 ${expected.size} ${expected.size}`)
    // Path con módulos: cada celda oscura aporta un subpath "M…h1v1h-1z".
    const d = svg!.querySelector('path')?.getAttribute('d') ?? ''
    expect(d.length).toBeGreaterThan(0)
    const darkModules = expected.data.flat().filter(Boolean).length
    expect((d.match(/h1v1h-1z/g) ?? []).length).toBe(darkModules)
  })

  it('es accesible: role img con el aria-label recibido', () => {
    const { container } = render(<BookingQR value={URL} label="Código QR de verificación" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('Código QR de verificación')
  })

  it('contenidos distintos generan matrices distintas (el QR depende del bookingId)', () => {
    const a = render(<BookingQR value={URL} label="a" />)
    const b = render(<BookingQR value={`${URL}-otro`} label="b" />)
    const dA = a.container.querySelector('path')!.getAttribute('d')
    const dB = b.container.querySelector('path')!.getAttribute('d')
    expect(dA).not.toBe(dB)
  })

  it('respeta el tamaño pedido sin tocar la resolución de la matriz', () => {
    const { container } = render(<BookingQR value={URL} label="q" size={240} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('240')
    expect(svg.getAttribute('height')).toBe('240')
  })
})
