// @vitest-environment happy-dom
//
// Gate del lado del cliente en CourtForm.tsx (Parte 2 del lote): corta el
// submit ANTES de llamar al server si quedan celdas activas sin precio. Era
// completamente mudo — sin este test no hay forma de saber si la señal
// (track.courts de @/shared/observability/breadcrumbs) realmente se emite.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CourtForm } from '@/app/(admin)/canchas/components/CourtForm'
import { openingHours } from '@/test/fixtures/tenant'
import { track } from '@/shared/observability/breadcrumbs'

vi.mock('@/shared/observability/breadcrumbs', () => ({ track: { courts: vi.fn() } }))

afterEach(cleanup)

const HOURS = openingHours()

const baseProps = {
  openingHours: HOURS,
  tenantId: 'tenant-1',
  closesNextDay: false,
  otherCourts: [],
  onSaved: vi.fn(),
  onCancel: vi.fn(),
  createAction: vi.fn(async () => ({ success: true as const, courtId: 'court-1' })),
  updateAction: vi.fn(async () => ({ success: true as const, courtId: 'court-1' })),
  uploadPhotoAction: vi.fn(async () => ({ success: true as const, photos: [] })),
  removePhotoAction: vi.fn(async () => ({ success: true as const, photos: [] })),
  reorderPhotosAction: vi.fn(async () => ({ success: true as const, photos: [] })),
}

describe('CourtForm — gate de precios sin cubrir', () => {
  it('cancha nueva sin precios: corta el submit, avisa y deja rastro con track.courts', () => {
    render(<CourtForm court={null} {...baseProps} />)

    fireEvent.submit(screen.getByRole('heading', { name: 'Nueva cancha' }).closest('form')!)

    expect(screen.getByRole('alert').textContent).toMatch(/No se puede guardar/)
    expect(vi.mocked(baseProps.createAction)).not.toHaveBeenCalled()
    // El tenant llega por prop, no desde `court`: en un alta `court` es null y
    // sin esto el evento del caso más importante —el complejo que se traba
    // cargando su primera cancha— no diría de qué complejo se trata.
    expect(vi.mocked(track.courts)).toHaveBeenCalledWith('courts.pricing_save_blocked', {
      tenantId: 'tenant-1',
      emptyCount: expect.any(Number),
    })
    const [, ctx] = vi.mocked(track.courts).mock.calls[0]!
    expect((ctx as { emptyCount: number }).emptyCount).toBeGreaterThan(0)
  })
})
