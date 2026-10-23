import { describe, expect, it } from 'vitest'
import { buildShareHref, buildShareMessage } from '@/modules/rival/rival-share'
import { resolveRepeatPrefill } from '@/modules/rival/rival-form'

// Jueves 22/10/2026 21:00 ART = viernes 00:00 UTC (el día UTC ya es otro: el borde que importa).
const THURSDAY_21 = new Date('2026-10-23T00:00:00Z')
const URL = 'https://turnogol.com/rival/p/ABCDEFGHJK'
const base = { startsAt: THURSDAY_21, tenantName: 'El Vagón', capacity: 10 }

describe('buildShareMessage (Avisar al grupo)', () => {
  it('faltan varios: convoca con el link', () => {
    expect(buildShareMessage({ ...base, confirmedCount: 7 }, URL)).toBe(
      `Jueves 21:00 en El Vagón. Nos faltan 3. ¿Venís? Confirmá en un toque: ${URL}`,
    )
  })

  it('falta uno: el singular, no "Nos faltan 1"', () => {
    const text = buildShareMessage({ ...base, confirmedCount: 9 }, URL)
    expect(text).toBe(`¡Falta 1! Jueves 21:00 en El Vagón: ${URL}`)
    expect(text).not.toContain('Nos faltan')
  })

  it('lleno: avisa que se juega, sin link', () => {
    expect(buildShareMessage({ ...base, confirmedCount: 10 }, URL)).toBe(
      '¡Estamos los 10! Se juega el jueves 21:00 en El Vagón.',
    )
    // Pasado de cupo (no debería pasar) también es "lleno".
    expect(buildShareMessage({ ...base, confirmedCount: 11 }, URL)).toContain('¡Estamos los 10!')
  })

  it('el href es un wa.me sin número con el texto codificado', () => {
    const href = buildShareHref({ ...base, confirmedCount: 9 }, URL)
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(href.slice('https://wa.me/?text='.length))).toBe(
      `¡Falta 1! Jueves 21:00 en El Vagón: ${URL}`,
    )
  })
})

describe('resolveRepeatPrefill (Repetir)', () => {
  const source = {
    tenantId: 't1',
    date: '2026-10-29',
    time: '21:00',
    format: 5,
    capacity: 10,
    level: 'parejo' as const,
  }

  it('sin partido de origen (no es mío o no existe) no precarga', () => {
    expect(resolveRepeatPrefill(null, ['t1'], '2026-10-23')).toBeNull()
  })

  it('+7 dentro de la ventana: conserva fecha y hora', () => {
    expect(resolveRepeatPrefill(source, ['t1'], '2026-10-23')).toEqual({ ...source })
  })

  it('+7 fuera de la ventana: sin fecha ni hora, el resto se conserva', () => {
    // Hoy 22/10: la ventana llega hasta el 29/10 inclusive; el 30 ya no entra.
    expect(resolveRepeatPrefill({ ...source, date: '2026-10-30' }, ['t1'], '2026-10-22')).toEqual({
      ...source,
      date: null,
      time: '',
    })
    expect(resolveRepeatPrefill(source, ['t1'], '2026-10-22')).toMatchObject({ date: '2026-10-29' })
  })

  it('+7 que ya pasó (partido viejo): también sin fecha', () => {
    expect(
      resolveRepeatPrefill({ ...source, date: '2026-10-01' }, ['t1'], '2026-10-23'),
    ).toMatchObject({ date: null, time: '' })
  })

  it('un complejo que ya no es elegible queda sin elegir', () => {
    expect(resolveRepeatPrefill(source, ['otro'], '2026-10-23')).toMatchObject({ tenantId: '' })
  })
})
