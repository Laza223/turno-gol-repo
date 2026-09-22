import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VISUAL,
  MATCH_STATUS_LABELS,
  MATCH_STATUS_VISUAL,
  QUALIFICATION_VISUAL,
  STATUS_LABELS,
  SUSPENSION_VISUAL,
  TEAM_STATUS_LABELS,
  TEAM_STATUS_VISUAL,
  TOURNAMENT_STATUS_VISUAL,
  type TournamentBadgeVisual,
} from '@/lib/tournaments/status-visual'
import { TONE_BADGE, type StatusTone } from '@/lib/status-tone'

const TONES = Object.keys(TONE_BADGE) as StatusTone[]

const TABLES: Record<string, Record<string, TournamentBadgeVisual>> = {
  torneo: TOURNAMENT_STATUS_VISUAL,
  equipo: TEAM_STATUS_VISUAL,
  partido: MATCH_STATUS_VISUAL,
  evento: EVENT_TYPE_VISUAL,
}

describe('tablas de estado de torneos', () => {
  for (const [nombre, tabla] of Object.entries(TABLES)) {
    it(`${nombre}: cada estado trae tono válido, ícono y label`, () => {
      for (const [key, visual] of Object.entries(tabla)) {
        expect(TONES, `${nombre}.${key} usa un tono que no existe`).toContain(visual.tone)
        expect(visual.icon, `${nombre}.${key} no tiene ícono`).toBeTruthy()
        expect(visual.label.length, `${nombre}.${key} no tiene label`).toBeGreaterThan(0)
      }
    })
  }

  it('las dos marcas sueltas de la tabla de posiciones también', () => {
    for (const visual of [QUALIFICATION_VISUAL, SUSPENSION_VISUAL]) {
      expect(TONES).toContain(visual.tone)
      expect(visual.icon).toBeTruthy()
      expect(visual.label.length).toBeGreaterThan(0)
    }
  })
})

/**
 * El mapeo explícito. No es redundante con el test de arriba: es el trinquete
 * contra que alguien "arregle" un color suelto en una vista y vuelva a abrir
 * la divergencia que este módulo cerró. Cambiar una fila acá tiene que ser una
 * decisión, no un efecto colateral.
 */
describe('mapeo estado → tono', () => {
  it('torneo', () => {
    expect({
      draft: TOURNAMENT_STATUS_VISUAL.draft.tone,
      registration: TOURNAMENT_STATUS_VISUAL.registration.tone,
      in_progress: TOURNAMENT_STATUS_VISUAL.in_progress.tone,
      finished: TOURNAMENT_STATUS_VISUAL.finished.tone,
      canceled: TOURNAMENT_STATUS_VISUAL.canceled.tone,
    }).toEqual({
      draft: 'neutral',
      registration: 'info',
      in_progress: 'success',
      finished: 'neutral',
      canceled: 'destructive',
    })
  })

  it('equipo', () => {
    expect({
      registered: TEAM_STATUS_VISUAL.registered.tone,
      confirmed: TEAM_STATUS_VISUAL.confirmed.tone,
      withdrawn: TEAM_STATUS_VISUAL.withdrawn.tone,
      disqualified: TEAM_STATUS_VISUAL.disqualified.tone,
    }).toEqual({
      registered: 'neutral',
      confirmed: 'success',
      withdrawn: 'warning',
      disqualified: 'destructive',
    })
  })

  it('partido', () => {
    expect({
      scheduled: MATCH_STATUS_VISUAL.scheduled.tone,
      played: MATCH_STATUS_VISUAL.played.tone,
      walkover: MATCH_STATUS_VISUAL.walkover.tone,
      postponed: MATCH_STATUS_VISUAL.postponed.tone,
      canceled: MATCH_STATUS_VISUAL.canceled.tone,
    }).toEqual({
      scheduled: 'neutral',
      played: 'success',
      walkover: 'warning',
      postponed: 'info',
      canceled: 'destructive',
    })
  })

  it('evento del acta', () => {
    expect({
      goal: EVENT_TYPE_VISUAL.goal.tone,
      own_goal: EVENT_TYPE_VISUAL.own_goal.tone,
      yellow_card: EVENT_TYPE_VISUAL.yellow_card.tone,
      red_card: EVENT_TYPE_VISUAL.red_card.tone,
    }).toEqual({
      goal: 'success',
      own_goal: 'neutral',
      yellow_card: 'warning',
      red_card: 'destructive',
    })
  })
})

describe('el badge y el texto plano dicen lo mismo', () => {
  it('cada visual toma su label de la tabla de labels', () => {
    for (const k of Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]) {
      expect(TOURNAMENT_STATUS_VISUAL[k].label).toBe(STATUS_LABELS[k])
    }
    for (const k of Object.keys(TEAM_STATUS_LABELS) as (keyof typeof TEAM_STATUS_LABELS)[]) {
      expect(TEAM_STATUS_VISUAL[k].label).toBe(TEAM_STATUS_LABELS[k])
    }
    for (const k of Object.keys(MATCH_STATUS_LABELS) as (keyof typeof MATCH_STATUS_LABELS)[]) {
      expect(MATCH_STATUS_VISUAL[k].label).toBe(MATCH_STATUS_LABELS[k])
    }
    for (const k of Object.keys(EVENT_TYPE_LABELS) as (keyof typeof EVENT_TYPE_LABELS)[]) {
      expect(EVENT_TYPE_VISUAL[k].label).toBe(EVENT_TYPE_LABELS[k])
    }
  })
})

/**
 * El módulo declara TONOS, nunca clases. Si vuelve a aparecer una clase de
 * Tailwind acá adentro es que alguien reabrió la copia local que este refactor
 * cerró — y con ella el `bg-muted text-muted-foreground` de 4.21:1 que
 * `status-tone.ts:7-10` documenta como AA-fail.
 */
describe('sin clases de Tailwind en el módulo', () => {
  it('el fuente no declara ni un color', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/tournaments/status-visual.ts'), 'utf8')
    // El comentario del encabezado nombra la receta que se eliminó; lo que no
    // puede haber es una clase en código.
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(codigo).not.toMatch(/\bbg-[a-z]/)
    expect(codigo).not.toMatch(/\btext-(?:muted|emerald|amber|red|blue|slate|green)\b/)
  })
})
