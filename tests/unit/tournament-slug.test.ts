import { describe, expect, it } from 'vitest'
import { tournamentSlugBase } from '@/modules/tournaments/tournament-slug'

// chk_tournament_slug_format en la migr. 062. Si el slug no matchea, el INSERT
// muere con un 23514 crudo.
const SLUG_CHECK = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('tournamentSlugBase', () => {
  it('normaliza un nombre común', () => {
    expect(tournamentSlugBase('Clausura 2026')).toBe('clausura-2026')
  })

  it('saca acentos y signos', () => {
    expect(tournamentSlugBase('Copa Año Nuevo ¡2026!')).toBe('copa-ano-nuevo-2026')
  })

  it('no deja guión colgando cuando el nombre largo se trunca justo en un espacio', () => {
    // generateSlug limpia los extremos ANTES de truncar a 50, así que sin este
    // recorte el slug terminaría en '-' y violaría el CHECK.
    const name = `${'a'.repeat(49)} b`
    const slug = tournamentSlugBase(name)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug).toMatch(SLUG_CHECK)
  })

  it('cae a un slug válido cuando el nombre no tiene nada aprovechable', () => {
    expect(tournamentSlugBase('⚽⚽⚽')).toMatch(SLUG_CHECK)
  })

  it('siempre devuelve algo que pasa el CHECK de la DB', () => {
    const names = [
      'Clausura 2026',
      '  Torneo   de   Verano  ',
      'Copa 5 — Fútbol 5',
      'Ñandú F.C. Cup',
      '2026',
      '---',
      `${'z'.repeat(60)} x`,
    ]
    for (const n of names) {
      expect(tournamentSlugBase(n)).toMatch(SLUG_CHECK)
    }
  })
})
