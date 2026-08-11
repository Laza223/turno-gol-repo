import { describe, expect, it } from 'vitest'
import {
  PLAYER_TAGS,
  PLAYER_TAG_HINTS,
  PLAYER_TAG_LABELS,
  normalizePlayerTags,
  playerTagsSchema,
  type PlayerTag,
} from '@/modules/relationships/player-tags'

describe('player-tags — el set cerrado (B12 / D3)', () => {
  it('son exactamente las 5 que la decisión dejó, en el orden de presentación', () => {
    expect(PLAYER_TAGS).toEqual([
      'gets_credit',
      'no_credit',
      'group_organizer',
      'agreed_price',
      'difficult',
    ])
  })

  // El motivo de D3 es legal: si aparece una etiqueta sin label, la ficha la
  // pinta vacía y el complejo termina escribiendo la semántica en otro lado.
  it('cada etiqueta tiene label y ayuda', () => {
    for (const tag of PLAYER_TAGS) {
      expect(PLAYER_TAG_LABELS[tag]?.length ?? 0).toBeGreaterThan(0)
      expect(PLAYER_TAG_HINTS[tag]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('rechaza una etiqueta que no está en el set', () => {
    const res = playerTagsSchema.safeParse(['vip'])
    expect(res.success).toBe(false)
  })
})

describe('normalizePlayerTags', () => {
  it('deduplica', () => {
    expect(normalizePlayerTags(['no_credit', 'no_credit'])).toEqual(['no_credit'])
  })

  it('ordena por el orden canónico, no por el de llegada', () => {
    expect(normalizePlayerTags(['difficult', 'gets_credit', 'agreed_price'])).toEqual([
      'gets_credit',
      'agreed_price',
      'difficult',
    ])
  })

  it('el vacío es vacío (nunca null)', () => {
    expect(normalizePlayerTags([])).toEqual([])
  })

  // Dos guardados con las mismas etiquetas en distinto orden tienen que producir
  // la MISMA fila: si no, el diff del audit log muestra un cambio que no existió.
  it('es estable: mismo set, misma salida sin importar el orden de entrada', () => {
    const a = normalizePlayerTags(['difficult', 'no_credit'])
    const b = normalizePlayerTags(['no_credit', 'difficult'])
    expect(a).toEqual(b)
  })
})

describe('playerTagsSchema', () => {
  it('normaliza al parsear', () => {
    const res = playerTagsSchema.safeParse(['difficult', 'gets_credit', 'difficult'])
    expect(res.success).toBe(true)
    expect(res.success && res.data).toEqual(['gets_credit', 'difficult'])
  })

  // "Se le fía" y "No fiar" juntas no significan nada y dejan al mostrador sin
  // saber qué hacer. Se rechaza en el borde en vez de elegir una en silencio.
  it('rechaza "Se le fía" + "No fiar" a la vez', () => {
    const res = playerTagsSchema.safeParse(['gets_credit', 'no_credit'])
    expect(res.success).toBe(false)
    expect(res.success === false && res.error.issues[0]?.message).toBe(
      'No se puede marcar "Se le fía" y "No fiar" a la vez.',
    )
  })

  it('acepta cada una de las 5 por separado', () => {
    for (const tag of PLAYER_TAGS) {
      expect(playerTagsSchema.safeParse([tag]).success).toBe(true)
    }
  })

  it('acepta el set completo compatible (las 4 que conviven)', () => {
    const compatible: PlayerTag[] = ['gets_credit', 'group_organizer', 'agreed_price', 'difficult']
    expect(playerTagsSchema.safeParse(compatible).success).toBe(true)
  })

  it('acepta la lista vacía: sacar todas las etiquetas es una operación válida', () => {
    const res = playerTagsSchema.safeParse([])
    expect(res.success).toBe(true)
    expect(res.success && res.data).toEqual([])
  })
})
