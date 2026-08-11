// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WeekStrip } from '@/components/booking/WeekStrip'
import { mondayOf } from '@/lib/booking/grid-cells'

afterEach(() => cleanup())

describe('mondayOf', () => {
  it('devuelve el lunes ISO de cualquier día de la semana', () => {
    expect(mondayOf('2026-06-08')).toBe('2026-06-08') // lunes
    expect(mondayOf('2026-06-11')).toBe('2026-06-08') // jueves
    expect(mondayOf('2026-06-14')).toBe('2026-06-08') // domingo
  })
})

describe('WeekStrip', () => {
  // Semana del 8 al 14 de junio 2026; "hoy" es jueves 11.
  const setup = (date = '2026-06-11') => {
    const onNavigate = vi.fn()
    render(<WeekStrip date={date} todayArt="2026-06-11" onNavigate={onNavigate} />)
    return onNavigate
  }

  it('renderiza los 7 días de la semana del día seleccionado', () => {
    setup()
    for (const label of [
      'Lun 8',
      'Mar 9',
      'Mié 10',
      'Jue 11 (hoy)',
      'Vie 12',
      'Sáb 13',
      'Dom 14',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('marca el día seleccionado con aria-current y el día actual con "(hoy)"', () => {
    setup('2026-06-12') // seleccionado viernes; hoy sigue siendo jueves
    expect(screen.getByRole('button', { name: 'Vie 12' }).getAttribute('aria-current')).toBe('date')
    const today = screen.getByRole('button', { name: 'Jue 11 (hoy)' })
    expect(today.getAttribute('aria-current')).toBeNull()
  })

  it('click en un día navega a esa fecha', () => {
    const onNavigate = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Dom 14' }))
    expect(onNavigate).toHaveBeenCalledWith('2026-06-14')
  })

  it('los chevrons saltan una semana entera', () => {
    const onNavigate = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }))
    expect(onNavigate).toHaveBeenCalledWith('2026-06-04')
    fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }))
    expect(onNavigate).toHaveBeenCalledWith('2026-06-18')
  })

  it('una semana de otro mes muestra los números correctos (sin cero a la izquierda)', () => {
    render(<WeekStrip date="2026-07-01" todayArt="2026-06-11" onNavigate={vi.fn()} />)
    // Semana del lunes 29/06 al domingo 05/07.
    expect(screen.getByRole('button', { name: 'Lun 29' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dom 5' })).toBeTruthy()
  })
})
