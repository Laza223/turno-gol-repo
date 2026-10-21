import { describe, expect, it, vi } from 'vitest'

// `toAnthropicHistory` es pura, pero vive en el mismo módulo que el turno
// completo (DB, feature flags, Kapso, modelo). Se mockea todo lo que ese módulo
// importa para que el import no abra pools ni lea env.
vi.mock('@/shared/db/client', () => ({ getDb: vi.fn(), withTenantContext: vi.fn() }))
vi.mock('@/shared/feature-flags', () => ({ isFeatureEnabled: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/kapso/client', () => ({ sendWhatsappText: vi.fn() }))
vi.mock('@/modules/tenants/public.service', () => ({
  getPublicCourtCards: vi.fn(),
  getPublicTenant: vi.fn(),
}))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.agent', () => ({ runAgent: vi.fn() }))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.tools', () => ({
  buildBotTools: vi.fn(),
  pauseChatForHuman: vi.fn(),
}))

import { toAnthropicHistory } from '@/modules/whatsapp-bot/whatsapp-bot.turn'

type Row = Parameters<typeof toAnthropicHistory>[0][number]

const inbound = (body: string | null, kind: Row['kind'] = 'text'): Row => ({
  direction: 'inbound',
  kind,
  body,
})
const outbound = (body: string): Row => ({ direction: 'outbound', kind: 'text', body })
const owner = (body: string | null): Row => ({ direction: 'owner', kind: 'text', body })

describe('toAnthropicHistory', () => {
  it('sin mensajes → []', () => {
    expect(toAnthropicHistory([])).toEqual([])
  })

  it('un mensaje del jugador es un `user`', () => {
    expect(toAnthropicHistory([inbound('hola')])).toEqual([{ role: 'user', content: 'hola' }])
  })

  it('alterna user / assistant en una charla normal', () => {
    expect(
      toAnthropicHistory([
        inbound('hola'),
        outbound('¡Hola! ¿En qué te ayudo?'),
        inbound('precios?'),
      ]),
    ).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¡Hola! ¿En qué te ayudo?' },
      { role: 'user', content: 'precios?' },
    ])
  })

  describe('arranca siempre en `user`', () => {
    it('descarta un assistant inicial', () => {
      const history = toAnthropicHistory([outbound('aviso del sistema'), inbound('hola')])
      expect(history).toEqual([{ role: 'user', content: 'hola' }])
    })

    it('descarta un owner inicial (cuenta como assistant)', () => {
      const history = toAnthropicHistory([owner('te escribo yo'), inbound('hola')])
      expect(history).toEqual([{ role: 'user', content: 'hola' }])
    })

    it('descarta VARIOS assistant/owner iniciales seguidos', () => {
      const history = toAnthropicHistory([
        outbound('a'),
        owner('b'),
        outbound('c'),
        inbound('hola'),
        outbound('respuesta'),
      ])
      expect(history).toEqual([
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'respuesta' },
      ])
    })

    it('si solo hay assistant/owner → []', () => {
      expect(toAnthropicHistory([outbound('a'), owner('b')])).toEqual([])
    })

    it('el primer elemento del resultado es `user` en cualquier historial no vacío', () => {
      const cases: Row[][] = [
        [owner('x'), inbound('y')],
        [outbound('x'), outbound('y'), inbound('z'), owner('w')],
        [inbound('x'), owner('y')],
      ]
      for (const rows of cases) {
        expect(toAnthropicHistory(rows)[0]?.role).toBe('user')
      }
    })
  })

  describe('fusiona consecutivos del mismo rol (la API exige alternancia)', () => {
    it('varios mensajes seguidos del jugador → un solo `user` unido por salto de línea', () => {
      expect(
        toAnthropicHistory([inbound('hola'), inbound('hay cancha?'), inbound('mañana')]),
      ).toEqual([{ role: 'user', content: 'hola\nhay cancha?\nmañana' }])
    })

    it('outbound + owner seguidos se funden en un solo `assistant`', () => {
      expect(toAnthropicHistory([inbound('hola'), outbound('Hola!'), owner('Soy Pablo')])).toEqual([
        { role: 'user', content: 'hola' },
        {
          role: 'assistant',
          content: 'Hola!\n[Respondió una persona del complejo]: Soy Pablo',
        },
      ])
    })

    it('nunca quedan dos mensajes consecutivos con el mismo rol', () => {
      const history = toAnthropicHistory([
        inbound('1'),
        inbound('2'),
        outbound('3'),
        owner('4'),
        outbound('5'),
        inbound('6'),
        inbound('7'),
      ])
      expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    })
  })

  describe('marcadores de lo que el modelo no puede ver', () => {
    it('owner: prefijo "[Respondió una persona del complejo]:" para que el modelo no lo tome por propio', () => {
      expect(toAnthropicHistory([inbound('hola'), owner('Te lo guardo')])).toEqual([
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: '[Respondió una persona del complejo]: Te lo guardo' },
      ])
    })

    it('owner sin texto (mandó un audio o una foto) → "(sin texto)"', () => {
      expect(toAnthropicHistory([inbound('hola'), owner(null)])[1]).toEqual({
        role: 'assistant',
        content: '[Respondió una persona del complejo]: (sin texto)',
      })
    })

    it('audio transcripto → "[Audio, transcripto]: …"', () => {
      expect(toAnthropicHistory([inbound('quiero reservar', 'audio')])).toEqual([
        { role: 'user', content: '[Audio, transcripto]: quiero reservar' },
      ])
    })

    it('audio SIN transcripción → marcador explícito (el modelo tiene que pedir que lo escriba)', () => {
      expect(toAnthropicHistory([inbound(null, 'audio')])).toEqual([
        { role: 'user', content: '[Mandó un audio que no se pudo transcribir]' },
      ])
    })

    it('audio con transcripción vacía ("") se trata como sin transcripción', () => {
      expect(toAnthropicHistory([inbound('', 'audio')])).toEqual([
        { role: 'user', content: '[Mandó un audio que no se pudo transcribir]' },
      ])
    })

    it('imagen sin texto → "[Mandó una imagen]"; con texto → "[Imagen] texto"', () => {
      expect(toAnthropicHistory([inbound(null, 'image')])).toEqual([
        { role: 'user', content: '[Mandó una imagen]' },
      ])
      expect(toAnthropicHistory([inbound('mirá la cancha', 'image')])).toEqual([
        { role: 'user', content: '[Imagen] mirá la cancha' },
      ])
    })

    it('mensaje entrante sin texto de otro tipo → "[Mensaje sin texto]"', () => {
      expect(toAnthropicHistory([inbound(null, 'other')])).toEqual([
        { role: 'user', content: '[Mensaje sin texto]' },
      ])
      expect(toAnthropicHistory([inbound(null, 'interactive')])).toEqual([
        { role: 'user', content: '[Mensaje sin texto]' },
      ])
    })
  })

  it('un outbound con cuerpo vacío o null se omite (sin partes vacías en el contenido)', () => {
    const history = toAnthropicHistory([
      inbound('hola'),
      { direction: 'outbound', kind: 'text', body: null },
      { direction: 'outbound', kind: 'text', body: '' },
      outbound('Hola!'),
    ])
    expect(history).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'Hola!' },
    ])
  })

  it('un outbound vacío entre dos mensajes del jugador no parte el `user` en dos', () => {
    const history = toAnthropicHistory([
      inbound('uno'),
      { direction: 'outbound', kind: 'text', body: null },
      inbound('dos'),
    ])
    expect(history).toEqual([{ role: 'user', content: 'uno\ndos' }])
  })

  it('no muta el arreglo de entrada', () => {
    const rows = [owner('x'), inbound('hola'), outbound('chau')]
    const copy = structuredClone(rows)
    toAnthropicHistory(rows)
    expect(rows).toEqual(copy)
  })

  // Revisión adversarial: M2 llega mientras el turno de M1 corre, y la respuesta
  // a M1 se guarda DESPUÉS de M2. Por fecha, el historial terminaba en
  // `assistant` (prefill o 400 de la API) y el bot no contestaba M2.
  it('un pendiente más viejo que la última respuesta va al final: termina en `user`', () => {
    const rows: Row[] = [
      inbound('hola'),
      { ...inbound('¿tenés cancha hoy a las 21?'), pending: true },
      outbound('¡Hola! Soy el asistente del complejo.'),
    ]
    expect(toAnthropicHistory(rows)).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¡Hola! Soy el asistente del complejo.' },
      { role: 'user', content: '¿tenés cancha hoy a las 21?' },
    ])
  })

  describe('respuestas del bot con toolTrace', () => {
    const toolUse = {
      type: 'tool_use',
      id: 'toolu_1',
      name: 'ver_disponibilidad',
      input: { fecha: '2026-10-23' },
    } as const
    const toolResult = {
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: '{"canchas":[]}',
    } as const
    const trace = (finalText: string) => [
      { role: 'assistant', content: [toolUse] },
      { role: 'user', content: [toolResult] },
      { role: 'assistant', content: [{ type: 'text', text: finalText }] },
    ]
    const traced = (body: string, toolTrace: unknown = trace(body)): Row => ({
      ...outbound(body),
      toolTrace,
    })

    it('un trace válido entra con sus llamadas a herramientas y sus resultados', () => {
      expect(
        toAnthropicHistory([inbound('hay a las 21?'), traced('Hay a las 22'), inbound('dale')]),
      ).toEqual([
        { role: 'user', content: 'hay a las 21?' },
        { role: 'assistant', content: [toolUse] },
        { role: 'user', content: [toolResult] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hay a las 22' }] },
        { role: 'user', content: 'dale' },
      ])
    })

    it.each([
      ['no es un arreglo', { role: 'assistant' }],
      ['largo par (termina en tool_result)', trace('x').slice(0, 2)],
      ['arranca en user', [{ role: 'user', content: [toolResult] }]],
      ['contenido vacío', [{ role: 'assistant', content: [] }]],
      ['contenido string', [{ role: 'assistant', content: 'hola' }]],
    ])('un trace inválido (%s) cae al texto del mensaje', (_, toolTrace) => {
      expect(toAnthropicHistory([inbound('hola'), traced('Hay a las 22', toolTrace)])).toEqual([
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'Hay a las 22' },
      ])
    })

    it('una respuesta con trace antes del primer mensaje del jugador se descarta entera', () => {
      expect(toAnthropicHistory([traced('aviso'), inbound('hola')])).toEqual([
        { role: 'user', content: 'hola' },
      ])
    })

    it('un echo del dueño después de un trace se suma como bloque de texto al último `assistant`', () => {
      expect(
        toAnthropicHistory([inbound('hola'), traced('Hay a las 22'), owner('Soy Pablo')]),
      ).toEqual([
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: [toolUse] },
        { role: 'user', content: [toolResult] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hay a las 22' },
            { type: 'text', text: '[Respondió una persona del complejo]: Soy Pablo' },
          ],
        },
      ])
    })

    it('dos respuestas con trace seguidas siguen alternando y cada tool_use tiene su resultado', () => {
      const history = toAnthropicHistory([
        inbound('hola'),
        inbound('hay a las 21?'),
        traced('Hola!'),
        traced('Hay a las 22'),
      ])
      const roles = history.map((m) => m.role)
      expect(roles.every((r, i) => i === 0 || r !== roles[i - 1])).toBe(true)
      expect(history[0]?.role).toBe('user')
      for (let i = 0; i < history.length; i++) {
        const m = history[i]!
        if (m.role !== 'assistant' || !Array.isArray(m.content)) continue
        const uses = m.content.filter((b) => b.type === 'tool_use').length
        if (uses === 0) continue
        const next = history[i + 1]
        const results = Array.isArray(next?.content)
          ? next.content.filter((b) => b.type === 'tool_result').length
          : 0
        expect(results).toBe(uses)
      }
    })

    it('el trace de un entrante se ignora (solo cuenta en las respuestas del bot)', () => {
      expect(toAnthropicHistory([{ ...inbound('hola'), toolTrace: trace('x') }])).toEqual([
        { role: 'user', content: 'hola' },
      ])
    })
  })

  it('un aviso de seña guardado después del "ya pagué" no deja el historial en `assistant`', () => {
    const rows: Row[] = [
      inbound('reservame el de las 20'),
      outbound('Listo, pagá la seña acá'),
      { ...inbound('ya pagué'), pending: true },
      outbound('Listo, recibimos la seña ✅'),
    ]
    expect(toAnthropicHistory(rows).at(-1)).toEqual({ role: 'user', content: 'ya pagué' })
  })
})
