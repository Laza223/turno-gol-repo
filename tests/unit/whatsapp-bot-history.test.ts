import { describe, expect, it, vi } from 'vitest'

// `toOpenAiHistory` es pura, pero vive en el mismo módulo que el turno
// completo (DB, feature flags, Kapso, modelo). Se mockea todo lo que ese módulo
// importa para que el import no abra pools ni lea env.
vi.mock('@/shared/db/client', () => ({ getDb: vi.fn(), withTenantContext: vi.fn() }))
vi.mock('@/shared/feature-flags', () => ({ isFeatureEnabled: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/kapso/client', () => ({ sendWhatsappText: vi.fn(), sendWhatsappTemplate: vi.fn() }))
vi.mock('@/modules/tenants/public.service', () => ({
  getPublicCourtCards: vi.fn(),
  getPublicTenant: vi.fn(),
}))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.agent', () => ({ runAgent: vi.fn() }))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.tools', () => ({
  buildBotTools: vi.fn(),
  pauseChatForHuman: vi.fn(),
}))

import { toOpenAiHistory } from '@/modules/whatsapp-bot/whatsapp-bot.turn'

type Row = Parameters<typeof toOpenAiHistory>[0][number]

// 2026-10-24 12:00 ART = 15:00Z
const NOW = new Date('2026-10-24T15:00:00Z')
const YESTERDAY_2100 = new Date('2026-10-24T00:00:00Z') // 23/10 21:00 ART

const inbound = (body: string | null, kind: Row['kind'] = 'text', createdAt: Date = NOW): Row => ({
  direction: 'inbound',
  kind,
  body,
  createdAt,
})
const outbound = (body: string | null, createdAt: Date = NOW): Row => ({
  direction: 'outbound',
  kind: 'text',
  body,
  createdAt,
})
const owner = (body: string | null, createdAt: Date = NOW): Row => ({
  direction: 'owner',
  kind: 'text',
  body,
  createdAt,
})

describe('toOpenAiHistory', () => {
  it('sin mensajes → ambos vacíos', () => {
    expect(toOpenAiHistory([], NOW)).toEqual({
      historyBeforePending: [],
      pendingUserItems: [],
    })
  })

  it('separa los procesados en historyBeforePending y agrupa pendientes en pendingUserItems', () => {
    const res = toOpenAiHistory(
      [
        inbound('hola'),
        outbound('¡Hola! ¿En qué te ayudo?'),
        { ...inbound('tenés cancha?'), pending: true },
        { ...inbound('para hoy a las 21'), pending: true },
      ],
      NOW,
    )
    expect(res).toEqual({
      historyBeforePending: [
        { role: 'user', content: '[hoy 12:00] hola' },
        { role: 'assistant', content: '¡Hola! ¿En qué te ayudo?' },
      ],
      pendingUserItems: [
        { role: 'user', content: '[hoy 12:00] tenés cancha?\n[hoy 12:00] para hoy a las 21' },
      ],
    })
  })

  it('incluye fecha DD/MM HH:MM para mensajes de días anteriores', () => {
    const res = toOpenAiHistory([inbound('mandé comprobante', 'image', YESTERDAY_2100)], NOW)
    expect(res.historyBeforePending).toEqual([
      { role: 'user', content: '[23/10 21:00 | Imagen] mandé comprobante' },
    ])
  })

  it('renderiza owner, audio, image y mensajes sin texto con su timestamp ART', () => {
    const res = toOpenAiHistory(
      [
        inbound('hola'),
        owner('Te lo guardo'),
        owner(null),
        inbound('quiero reservar', 'audio'),
        inbound(null, 'audio'),
        inbound('', 'audio'),
        inbound(null, 'image'),
        inbound(null, 'other'),
      ],
      NOW,
    )
    expect(res.historyBeforePending).toEqual([
      { role: 'user', content: '[hoy 12:00] hola' },
      { role: 'assistant', content: '[hoy 12:00 | Respondió alguien del complejo]: Te lo guardo' },
      { role: 'assistant', content: '[hoy 12:00 | Respondió alguien del complejo]: (sin texto)' },
      { role: 'user', content: '[hoy 12:00 | Audio transcripto]: quiero reservar' },
      { role: 'user', content: '[hoy 12:00 | Mandó un audio que no se pudo transcribir]' },
      { role: 'user', content: '[hoy 12:00 | Mandó un audio que no se pudo transcribir]' },
      { role: 'user', content: '[hoy 12:00 | Mandó una imagen]' },
      { role: 'user', content: '[hoy 12:00] [Mensaje sin texto]' },
    ])
  })

  it('un outbound vacío o null se omite', () => {
    const res = toOpenAiHistory(
      [inbound('hola'), outbound(null), outbound(''), outbound('Hola!')],
      NOW,
    )
    expect(res.historyBeforePending).toEqual([
      { role: 'user', content: '[hoy 12:00] hola' },
      { role: 'assistant', content: 'Hola!' },
    ])
  })

  it('un pendiente más viejo que la última respuesta queda en pendingUserItems al final', () => {
    const rows: Row[] = [
      inbound('hola'),
      { ...inbound('¿tenés cancha hoy a las 21?'), pending: true },
      outbound('¡Hola! ¿En qué te ayudo?'),
    ]
    const res = toOpenAiHistory(rows, NOW)
    expect(res.historyBeforePending).toEqual([
      { role: 'user', content: '[hoy 12:00] hola' },
      { role: 'assistant', content: '¡Hola! ¿En qué te ayudo?' },
    ])
    expect(res.pendingUserItems).toEqual([
      { role: 'user', content: '[hoy 12:00] ¿tenés cancha hoy a las 21?' },
    ])
  })

  describe('trazas OpenAI vs Anthropic legacy', () => {
    const openAiTrace = {
      v: 1 as const,
      provider: 'openai_responses' as const,
      items: [
        {
          type: 'function_call' as const,
          call_id: 'call_1',
          name: 'ver_disponibilidad',
          arguments: '{"fecha":"2026-10-24"}',
        },
        {
          type: 'function_call_output' as const,
          call_id: 'call_1',
          output: '{"canchas":[]}',
        },
        { role: 'assistant' as const, content: 'A las 21 no hay' },
      ],
    }

    it('expande un OpenAiTracePayload v1 válido dentro de historyBeforePending', () => {
      const res = toOpenAiHistory(
        [inbound('hay a las 21?'), { ...outbound('A las 21 no hay'), toolTrace: openAiTrace }],
        NOW,
      )
      expect(res.historyBeforePending).toEqual([
        { role: 'user', content: '[hoy 12:00] hay a las 21?' },
        ...openAiTrace.items,
      ])
    })

    it('ignora trazas viejas de Anthropic y cae limpio a row.body', () => {
      const legacyAnthropicTrace = [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'ver_disponibilidad', input: {} }],
        },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'A las 21 no hay' }] },
      ]
      const res = toOpenAiHistory(
        [inbound('hola'), { ...outbound('A las 21 no hay'), toolTrace: legacyAnthropicTrace }],
        NOW,
      )
      expect(res.historyBeforePending).toEqual([
        { role: 'user', content: '[hoy 12:00] hola' },
        { role: 'assistant', content: 'A las 21 no hay' },
      ])
    })
  })
})
