import type Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))

// El módulo del agente hace `new Anthropic(...)` perezoso y cachea el cliente:
// se mockea la clase para que `messages.create` sea el espía de abajo.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = { create: mocks.create }
  },
}))

import {
  BOT_MODEL,
  ToolInputError,
  runAgent,
  type BotTool,
} from '@/modules/whatsapp-bot/whatsapp-bot.agent'
import { SYSTEM_RULES } from '@/modules/whatsapp-bot/whatsapp-bot.prompt'

/** Espejo de `MAX_TOOL_ROUNDS` (no exportada) en whatsapp-bot.agent.ts. */
const MAX_TOOL_ROUNDS = 4

type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

const text = (value: string): Block => ({ type: 'text', text: value })
const toolUse = (id: string, name: string, input: unknown = {}): Block => ({
  type: 'tool_use',
  id,
  name,
  input,
})

function message(
  content: Block[],
  stopReason: string,
  usage: Usage = { input_tokens: 10, output_tokens: 5 },
) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: BOT_MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  }
}

/** Lo que recibió `messages.create` en cada llamada (con `messages` clonado: el agente lo muta). */
let requests: Anthropic.MessageCreateParamsNonStreaming[] = []

function script(...responses: ReturnType<typeof message>[]) {
  const queue = [...responses]
  requests = []
  mocks.create.mockImplementation(async (params: Anthropic.MessageCreateParamsNonStreaming) => {
    requests.push({ ...params, messages: structuredClone(params.messages) })
    const next = queue.shift()
    if (!next) throw new Error('el test no guionó más respuestas del modelo')
    return next
  })
}

function makeTool(
  name: string,
  run: BotTool['run'] = async () => '{"ok":true}',
): BotTool & {
  run: ReturnType<typeof vi.fn>
} {
  const spy = vi.fn(run)
  return {
    definition: {
      name,
      description: `tool ${name}`,
      input_schema: { type: 'object', properties: {} },
    },
    run: spy,
  }
}

const HISTORY: Anthropic.MessageParam[] = [{ role: 'user', content: 'hola, ¿hay cancha?' }]
const CONTEXT = '# Complejo\nNombre: El Pelotazo'

beforeEach(() => {
  vi.resetAllMocks()
  requests = []
})

describe('runAgent — sin herramientas', () => {
  it('una respuesta de texto vuelve tal cual, sin tools llamadas', async () => {
    script(message([text('¡Hola! ¿Para qué día?')], 'end_turn'))
    const result = await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [] })

    expect(result.text).toBe('¡Hola! ¿Para qué día?')
    expect(result.toolsCalled).toEqual([])
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('une los bloques de texto con salto de línea, recorta y descarta lo que no es texto', async () => {
    script(
      message(
        [
          { type: 'thinking', thinking: 'pienso…', signature: 'sig' },
          text('  Primera línea'),
          text('Segunda línea  '),
        ],
        'end_turn',
      ),
    )
    const result = await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [] })
    expect(result.text).toBe('Primera línea\nSegunda línea')
  })

  it('manda el pedido con el modelo, effort medium, tools, system con caché y el historial', async () => {
    const tool = makeTool('ver_disponibilidad')
    script(message([text('ok')], 'end_turn'))
    await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [tool] })

    const request = requests[0]
    expect(request).toMatchObject({
      model: BOT_MODEL,
      max_tokens: 4096,
      output_config: { effort: 'medium' },
      tools: [tool.definition],
      messages: HISTORY,
    })
    // El breakpoint de caché va al final del bloque fijo; el bloque por complejo queda después.
    expect(request?.system).toEqual([
      { type: 'text', text: SYSTEM_RULES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: CONTEXT },
    ])
  })

  it('no muta el historial que recibe', async () => {
    const history: Anthropic.MessageParam[] = [{ role: 'user', content: 'hola' }]
    const before = structuredClone(history)
    script(
      message([toolUse('t1', 'ver_disponibilidad')], 'tool_use'),
      message([text('listo')], 'end_turn'),
    )
    await runAgent({ complexContext: CONTEXT, history, tools: [makeTool('ver_disponibilidad')] })
    expect(history).toEqual(before)
  })
})

describe('runAgent — ronda de tool use', () => {
  it('ejecuta las tools con su input y vuelve con el texto de TODAS las vueltas, en orden', async () => {
    const availability = makeTool('ver_disponibilidad', async () => '{"canchas":[]}')
    script(
      message(
        [text('Dejame ver…'), toolUse('toolu_1', 'ver_disponibilidad', { fecha: '2026-10-25' })],
        'tool_use',
      ),
      message([text('Hay 21:00 libre')], 'end_turn'),
    )

    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [availability],
    })

    expect(availability.run).toHaveBeenCalledWith({ fecha: '2026-10-25' })
    // Lo que el modelo dijo antes de consultar también le llega al jugador.
    expect(result.text).toBe('Dejame ver…\nHay 21:00 libre')
    expect(result.toolsCalled).toEqual(['ver_disponibilidad'])
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('TODOS los tool_result van en UN solo mensaje `user`, en orden y con su tool_use_id', async () => {
    const availability = makeTool('ver_disponibilidad', async () => 'resultado-disponibilidad')
    const handoff = makeTool('pasar_a_humano', async () => 'resultado-humano')
    const assistantTurn = [
      toolUse('toolu_A', 'ver_disponibilidad', { fecha: '2026-10-25' }),
      toolUse('toolu_B', 'pasar_a_humano', { motivo: 'otro' }),
    ]
    script(message(assistantTurn, 'tool_use'), message([text('listo')], 'end_turn'))

    await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [availability, handoff] })

    const second = requests[1]?.messages ?? []
    // historial + turno del assistant (con los tool_use) + UN mensaje user con los resultados.
    expect(second).toHaveLength(HISTORY.length + 2)
    expect(second[HISTORY.length]).toEqual({ role: 'assistant', content: assistantTurn })
    expect(second[HISTORY.length + 1]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_A', content: 'resultado-disponibilidad' },
        { type: 'tool_result', tool_use_id: 'toolu_B', content: 'resultado-humano' },
      ],
    })
    expect(second.filter((m) => m.role === 'user' && Array.isArray(m.content))).toHaveLength(1)
  })

  it('las tools de una misma respuesta corren en orden', async () => {
    const order: string[] = []
    const a = makeTool('ver_disponibilidad', async () => {
      order.push('a')
      return 'a'
    })
    const b = makeTool('reservar', async () => {
      order.push('b')
      return 'b'
    })
    script(
      message([toolUse('1', 'ver_disponibilidad'), toolUse('2', 'reservar')], 'tool_use'),
      message([text('listo')], 'end_turn'),
    )
    const result = await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [a, b] })
    expect(order).toEqual(['a', 'b'])
    expect(result.toolsCalled).toEqual(['ver_disponibilidad', 'reservar'])
  })

  it('el historial crece solo-agregando: cada vuelta conserva lo anterior', async () => {
    const tool = makeTool('ver_disponibilidad')
    script(
      message([toolUse('1', 'ver_disponibilidad')], 'tool_use'),
      message([toolUse('2', 'ver_disponibilidad')], 'tool_use'),
      message([text('listo')], 'end_turn'),
    )
    await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [tool] })

    expect(requests.map((r) => r.messages.length)).toEqual([1, 3, 5])
    expect(requests[2]?.messages.slice(0, 3)).toEqual(requests[1]?.messages)
  })

  it('una herramienta desconocida vuelve como tool_result de error y el loop sigue', async () => {
    script(
      message([toolUse('toolu_X', 'borrar_todo')], 'tool_use'),
      message([text('no puedo hacer eso')], 'end_turn'),
    )
    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [makeTool('reservar')],
    })

    expect(requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_X',
          is_error: true,
          content: 'Herramienta desconocida.',
        },
      ],
    })
    expect(result.text).toBe('no puedo hacer eso')
  })
})

describe('runAgent — errores de las tools', () => {
  it('ToolInputError vuelve como tool_result con is_error: true y el loop sigue', async () => {
    const reservar = makeTool('reservar', async () => {
      throw new ToolInputError('Datos inválidos: revisá el formato y volvé a intentar.')
    })
    script(
      message([toolUse('toolu_1', 'reservar', { fecha: 'mañana' })], 'tool_use'),
      message([text('¿Me pasás la fecha en número?')], 'end_turn'),
    )

    const result = await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [reservar] })

    expect(requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          is_error: true,
          content: 'Datos inválidos: revisá el formato y volvé a intentar.',
        },
      ],
    })
    expect(result.text).toBe('¿Me pasás la fecha en número?')
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('un ToolInputError no frena a las otras tools de la misma respuesta', async () => {
    const bad = makeTool('reservar', async () => {
      throw new ToolInputError('mal')
    })
    const good = makeTool('ver_disponibilidad', async () => 'bien')
    script(
      message([toolUse('1', 'reservar'), toolUse('2', 'ver_disponibilidad')], 'tool_use'),
      message([text('listo')], 'end_turn'),
    )
    await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [bad, good] })

    expect(requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: '1', is_error: true, content: 'mal' },
        { type: 'tool_result', tool_use_id: '2', content: 'bien' },
      ],
    })
  })

  it('cualquier otro error se propaga y corta el turno (no se le devuelve al modelo)', async () => {
    const boom = new Error('connection terminated unexpectedly')
    const reservar = makeTool('reservar', async () => {
      throw boom
    })
    script(
      message([toolUse('toolu_1', 'reservar')], 'tool_use'),
      message([text('esto no debería pedirse nunca')], 'end_turn'),
    )

    await expect(
      runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [reservar] }),
    ).rejects.toBe(boom)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('un error de la API del modelo se propaga', async () => {
    const apiError = new Error('529 overloaded')
    mocks.create.mockRejectedValue(apiError)
    await expect(runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [] })).rejects.toBe(
      apiError,
    )
  })

  it('un Error común cuyo mensaje parece de input NO se confunde con ToolInputError', async () => {
    const impostor = new Error('Datos inválidos: revisá el formato y volvé a intentar.')
    const reservar = makeTool('reservar', async () => {
      throw impostor
    })
    script(message([toolUse('1', 'reservar')], 'tool_use'), message([text('x')], 'end_turn'))
    await expect(
      runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [reservar] }),
    ).rejects.toBe(impostor)
  })
})

describe('runAgent — tope de rondas', () => {
  it(`corta en MAX_TOOL_ROUNDS (${MAX_TOOL_ROUNDS}): ${MAX_TOOL_ROUNDS + 1} llamadas al modelo, ${MAX_TOOL_ROUNDS} rondas de tools`, async () => {
    const tool = makeTool('ver_disponibilidad')
    // El modelo pide una tool en CADA respuesta: nunca termina solo.
    mocks.create.mockImplementation(async () =>
      message([toolUse(`t${mocks.create.mock.calls.length}`, 'ver_disponibilidad')], 'tool_use'),
    )

    // El llamador pasa la charla a una persona.
    await expect(
      runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [tool] }),
    ).rejects.toThrow('rondas')

    expect(mocks.create).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1)
    expect(tool.run).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS)
  })

  it('en la última vuelta no manda el texto suelto ni ejecuta el tool_use pendiente', async () => {
    const tool = makeTool('ver_disponibilidad')
    mocks.create.mockImplementation(async () =>
      mocks.create.mock.calls.length > MAX_TOOL_ROUNDS
        ? message([text('Dale, te lo reservo'), toolUse('x', 'reservar')], 'tool_use')
        : message(
            [toolUse(`t${mocks.create.mock.calls.length}`, 'ver_disponibilidad')],
            'tool_use',
          ),
    )
    // "Dale, te lo reservo" anunciaría una reserva que no se hizo.
    await expect(
      runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [tool] }),
    ).rejects.toThrow('rondas')
    expect(tool.run).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS)
  })
})

describe('runAgent — cortes por stop_reason', () => {
  it('stop_reason "end_turn" con un tool_use en el contenido: NO se ejecuta la tool', async () => {
    const tool = makeTool('reservar')
    script(message([text('Reservo…'), toolUse('1', 'reservar', { cancha_id: 'x' })], 'end_turn'))

    const result = await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [tool] })

    expect(tool.run).not.toHaveBeenCalled()
    expect(result.text).toBe('Reservo…')
    expect(result.toolsCalled).toEqual([])
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it.each(['max_tokens', 'refusal'])(
    'stop_reason "%s": el turno falla sin mandar el texto cortado ni ejecutar la tool',
    async (stopReason) => {
      const tool = makeTool('reservar')
      script(message([text('Reservo…'), toolUse('1', 'reservar', { cancha_id: 'x' })], stopReason))

      await expect(
        runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [tool] }),
      ).rejects.toThrow(stopReason)
      expect(tool.run).not.toHaveBeenCalled()
      expect(mocks.create).toHaveBeenCalledTimes(1)
    },
  )

  it('un max_tokens en la segunda vuelta también falla, aunque la primera haya ejecutado tools', async () => {
    const tool = makeTool('ver_disponibilidad')
    script(
      message([toolUse('1', 'ver_disponibilidad')], 'tool_use'),
      message([text('Hay a las 2')], 'max_tokens'),
    )
    await expect(
      runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [tool] }),
    ).rejects.toThrow('max_tokens')
    expect(tool.run).toHaveBeenCalledTimes(1)
  })

  it('sin tool_use corta aunque el stop_reason sea "tool_use"', async () => {
    script(message([text('hola')], 'tool_use'))
    const result = await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [] })
    expect(result.text).toBe('hola')
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
})

describe('runAgent — usage', () => {
  it('suma input, output y cache_read_input_tokens de todas las vueltas', async () => {
    script(
      message([toolUse('1', 'ver_disponibilidad')], 'tool_use', {
        input_tokens: 1000,
        output_tokens: 40,
        cache_read_input_tokens: 3000,
      }),
      message([toolUse('2', 'ver_disponibilidad')], 'tool_use', {
        input_tokens: 1200,
        output_tokens: 60,
        cache_read_input_tokens: 3000,
      }),
      message([text('listo')], 'end_turn', {
        input_tokens: 1300,
        output_tokens: 80,
        cache_read_input_tokens: 3100,
      }),
    )
    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [makeTool('ver_disponibilidad')],
    })
    expect(result.usage).toEqual({
      inputTokens: 1000 + 1200 + 1300,
      cachedTokens: 3000 + 3000 + 3100,
      outputTokens: 40 + 60 + 80,
    })
  })

  it('cache_read_input_tokens ausente o null cuenta como 0 (no NaN)', async () => {
    script(
      message([toolUse('1', 'ver_disponibilidad')], 'tool_use', {
        input_tokens: 10,
        output_tokens: 1,
        cache_read_input_tokens: null,
      }),
      message([text('listo')], 'end_turn', { input_tokens: 20, output_tokens: 2 }),
    )
    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [makeTool('ver_disponibilidad')],
    })
    expect(result.usage).toEqual({ inputTokens: 30, cachedTokens: 0, outputTokens: 3 })
  })

  it('la escritura de caché se suma a la entrada (se cobra 1,25×, se aproxima a 1×)', async () => {
    script(
      message([text('listo')], 'end_turn', {
        input_tokens: 100,
        output_tokens: 5,
        cache_creation_input_tokens: 2000,
        cache_read_input_tokens: 0,
      }),
    )
    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [makeTool('ver_disponibilidad')],
    })
    expect(result.usage).toEqual({ inputTokens: 2100, cachedTokens: 0, outputTokens: 5 })
  })

  it('suma el usage de todas las vueltas, también la última del tope', async () => {
    const usage = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50 }
    mocks.create.mockImplementation(async () =>
      mocks.create.mock.calls.length > MAX_TOOL_ROUNDS
        ? message([text('Hay 21:00 libre')], 'end_turn', usage)
        : message(
            [toolUse(`t${mocks.create.mock.calls.length}`, 'ver_disponibilidad')],
            'tool_use',
            usage,
          ),
    )
    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [makeTool('ver_disponibilidad')],
    })
    const calls = MAX_TOOL_ROUNDS + 1
    expect(result.usage).toEqual({
      inputTokens: 100 * calls,
      cachedTokens: 50 * calls,
      outputTokens: 10 * calls,
    })
  })
})

describe('runAgent — trace para el historial', () => {
  it('sin tools: un solo mensaje assistant con el texto', async () => {
    script(message([text('¡Hola! ¿Para qué día?')], 'end_turn'))
    const result = await runAgent({ complexContext: CONTEXT, history: HISTORY, tools: [] })
    expect(result.trace).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: '¡Hola! ¿Para qué día?' }] },
    ])
  })

  it('con tools: tool_use, tool_result y el texto final, sin thinking', async () => {
    const availability = makeTool('ver_disponibilidad', async () => '{"canchas":[]}')
    script(
      message(
        [
          { type: 'thinking', thinking: 'pienso…', signature: 'sig' },
          text('Dejame ver…'),
          toolUse('toolu_1', 'ver_disponibilidad', { fecha: '2026-10-25' }),
        ],
        'tool_use',
      ),
      message(
        [{ type: 'thinking', thinking: 'listo', signature: 'sig2' }, text('Hay 21:00 libre')],
        'end_turn',
      ),
    )
    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [availability],
    })

    expect(result.trace).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Dejame ver…' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'ver_disponibilidad',
            input: { fecha: '2026-10-25' },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"canchas":[]}' }],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Hay 21:00 libre' }] },
    ])
  })

  it('si el turno no terminó en texto, el trace queda vacío (el próximo turno ve solo el texto)', async () => {
    script(message([toolUse('t1', 'ver_disponibilidad')], 'tool_use'), message([], 'end_turn'))
    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [makeTool('ver_disponibilidad')],
    })
    expect(result.text).toBe('')
    expect(result.trace).toEqual([])
  })

  it('un tool_use que cierra con end_turn no entra: cada tool_use del trace tiene su resultado', async () => {
    script(
      message([toolUse('t1', 'ver_disponibilidad')], 'tool_use'),
      message([text('Hay 21:00 libre'), toolUse('x', 'reservar')], 'end_turn'),
    )
    const result = await runAgent({
      complexContext: CONTEXT,
      history: HISTORY,
      tools: [makeTool('ver_disponibilidad'), makeTool('reservar')],
    })

    const uses = result.trace.flatMap((m) =>
      Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_use') : [],
    )
    const results = result.trace.flatMap((m) =>
      Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_result') : [],
    )
    expect(uses).toHaveLength(1)
    expect(results).toHaveLength(1)
    expect(result.trace.at(-1)).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hay 21:00 libre' }],
    })
  })
})

describe('ToolInputError', () => {
  it('es un Error con nombre propio (para el instanceof del loop)', () => {
    const err = new ToolInputError('mal')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ToolInputError)
    expect(err.name).toBe('ToolInputError')
    expect(err.message).toBe('mal')
  })
})
