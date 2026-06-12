// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BookingReceipt, { type BookingReceiptData } from '@/components/booking/BookingReceipt'

afterEach(() => cleanup())

const data: BookingReceiptData = {
  bookingId: '0b8f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
  tenantName: 'El Potrero',
  address: 'Av. Siempreviva 742',
  city: 'Rosario',
  courtName: 'Cancha 1',
  date: '2026-06-15',
  timeStart: '18:00:00',
  timeEnd: '19:00:00',
  priceSnapshot: 2_000_000, // $20.000,00
  depositAmount: 600_000, // $6.000,00
  depositStatus: 'paid',
  verifyUrl: 'https://turnogol.app/reserva/0b8f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b/verificar',
}

describe('BookingReceipt', () => {
  it('muestra todos los datos de la reserva (con seña: pagada + resto)', () => {
    const { container } = render(<BookingReceipt {...data} />)
    expect(screen.getByText('El Potrero')).toBeTruthy()
    expect(screen.getByText('Av. Siempreviva 742, Rosario')).toBeTruthy()
    expect(screen.getByText('Cancha 1')).toBeTruthy()
    expect(screen.getByText('15/06/2026')).toBeTruthy()
    expect(screen.getByText('18:00–19:00')).toBeTruthy()
    expect(screen.getByText('$20.000,00')).toBeTruthy()
    expect(screen.getByText('$6.000,00')).toBeTruthy()
    expect(screen.getByText('$14.000,00')).toBeTruthy()
    expect(screen.getByText('0B8F4A2E')).toBeTruthy()
    // QR embebido apuntando a la URL de verificación.
    expect(container.querySelector('svg[role="img"]')).toBeTruthy()
    expect(screen.getByText(data.verifyUrl)).toBeTruthy()
  })

  it('sin seña muestra que el total se abona en el complejo', () => {
    render(<BookingReceipt {...data} depositAmount={0} depositStatus="not_required" />)
    expect(screen.getByText('El total se abona en el complejo')).toBeTruthy()
    expect(screen.queryByText(/Seña pagada/)).toBeNull()
  })

  it('usa el id que las reglas @media print de globals.css esperan', () => {
    const { container } = render(<BookingReceipt {...data} />)
    expect(container.querySelector('#booking-receipt')).toBeTruthy()

    // Contrato con el CSS: si alguien renombra el id o borra el bloque print,
    // el botón "Descargar comprobante" imprime la página entera en silencio.
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toMatch(/@media print[\s\S]*#booking-receipt/)
    expect(css).toMatch(/@media screen\s*\{\s*#booking-receipt\s*\{\s*display:\s*none/)
  })
})
