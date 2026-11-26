import type { ResponseInputItem } from 'openai/resources/responses/responses'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))

// El módulo del agente hace `new OpenAI(...)` perezoso y cachea el cliente:
// se mockea la clase para que `responses.create` sea el espía de abajo.
vi.mock('openai', () => ({
  default: class FakeOpenAI {
    responses = { create: mocks.create }
  },
}))

import {
  BOT_MODEL,
  ToolInputError,
  resolveReasoningEffort,
  runAgent,
  type BotTool,
  type ReasoningEffort,
  type ToolRunOutput,
} from '@/modules/whatsapp-bot/whatsapp-bot.agent'
import { SYSTEM_RULES } from '@/modules/whatsapp-bot/whatsapp-bot.prompt'

/** Espejo de `MAX_TOOL_ROUNDS` (no exportada) en whatsapp-bot.agent.ts. */
const MAX_TOOL_ROUNDS = 4

type OutputItem =
  | {
      type: 'message'
      id: string
      role: 'assistant'
      status: 'completed'
      content: Array<
        | { type: 'output_text'; text: string; annotations: [] }
        | { type: 'refusal'; refusal: string }
      >
    }
  | {
      type: 'function_call'
      id: string
      call_id: string
      name: string
      arguments: string
      status: 'completed'
    }
  | {
      type: 'reasoning'
      id: string
      summary: []
    }

type Usage = {
  input_tokens: number
  output_tokens: number
  input_tokens_details?: { cached_tokens?: number }
}

const msgItem = (
  ...blocks: Array<{ type: 'output_text'; text: string } | { type: 'refusal'; refusal: string }>
): OutputItem => ({
  type: 'message',
  id: 'msg_test',
  role: 'assistant',
  status: 'completed',
  content: blocks.map((b) =>
    b.type === 'output_text' ? { type: 'output_text', text: b.text, annotations: [] } : b,
  ),
})

const outText = (text: string): OutputItem => msgItem({ type: 'output_text', text })

const fnCall = (callId: string, name: string, args: unknown = {}): OutputItem => ({
  type: 'function_call',
  id: `fc_${callId}`,
  call_id: callId,
  name,
  arguments: JSON.stringify(args),
  status: 'completed',
})

function apiResponse(
  output: OutputItem[],
  opts: {
    status?: 'completed' | 'incomplete' | 'failed'
    incompleteReason?: string
    usage?: Usage
  } = {},
) {
  return {
    id: 'resp_test',
    object: 'response',
    model: BOT_MODEL,
    status: opts.status ?? 'completed',
    incomplete_details: opts.incompleteReason ? { reason: opts.incompleteReason } : null,
    output,
    usage: opts.usage ?? { input_tokens: 10, output_tokens: 5 },
  }
}

type CapturedRequest = {
  model: string
  store: boolean
  max_output_tokens: number
  reasoning: { effort: ReasoningEffort }
  prompt_cache_key: string
  prompt_cache_options: { ttl: string }
  tools: unknown[]
  input: ResponseInputItem[]
}

let requests: CapturedRequest[] = []

function script(...responses: ReturnType<typeof apiResponse>[]) {
  const queue = [...responses]
  requests = []
  mocks.create.mockImplementation(async (params: CapturedRequest) => {
    requests.push({ ...params, input: structuredClone(params.input) })
    const next = queue.shift()
    if (!next) throw new Error('el test no guionó más respuestas del modelo')
    return next
  })
}

function makeTool(
  name: string,
  run: (input: unknown) => Promise<ToolRunOutput> = async () => ({
    kind: 'continue',
    output: '{"ok":true}',
  }),
): BotTool & { run: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(run)
  return {
    definition: {
      type: 'function',
      name,
      description: `tool ${name}`,
      strict: true,
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
    run: spy,
  }
}

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const STATIC_CTX = '# Complejo\nNombre: El Pelotazo'
const DYNAMIC_CTX = '# Contexto actual del turno\nHora actual (Argentina): 12:00'
const HISTORY_BEFORE: ResponseInputItem[] = [{ role: 'user', content: '[hoy 11:50] hola' }]
const PENDING: ResponseInputItem[] = [{ role: 'user', content: '[hoy 12:00] ¿hay cancha?' }]

const baseParams = (overrides: Partial<Parameters<typeof runAgent>[0]> = {}) => ({
  tenantId: TENANT_ID,
  staticComplexContext: STATIC_CTX,
  dynamicTurnContext: DYNAMIC_CTX,
  historyBeforePending: HISTORY_BEFORE,
  pendingUserItems: PENDING,
  tools: [],
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  requests = []
})

describe('resolveReasoningEffort', () => {
  it('usa low por defecto, medium si OPENAI_BOT_REASONING_EFFORT=medium y respeta override', () => {
    expect(resolveReasoningEffort()).toBe('low')
    vi.stubEnv('OPENAI_BOT_REASONING_EFFORT', 'medium')
    expect(resolveReasoningEffort()).toBe('medium')
    expect(resolveReasoningEffort('low')).toBe('low')
  })
})

describe('runAgent — sin herramientas', () => {
  it('una respuesta de texto vuelve con outcome replied y sin tools llamadas', async () => {
    script(apiResponse([outText('¡Hola! ¿Para qué día?')]))
    const result = await runAgent(baseParams())

    expect(result.outcome).toBe('replied')
    expect(result.text).toBe('¡Hola! ¿Para qué día?')
    expect(result.toolsCalled).toEqual([])
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('une los output_text de la ronda final, recorta e ignora items de reasoning', async () => {
    script(
      apiResponse([
        { type: 'reasoning', id: 'rs_1', summary: [] },
        msgItem(
          { type: 'output_text', text: '  Primera línea' },
          { type: 'output_text', text: 'Segunda línea  ' },
        ),
      ]),
    )
    const result = await runAgent(baseParams())
    expect(result.text).toBe('Primera línea\nSegunda línea')
  })

  it('envía prefijo estático cacheable en input[0], contexto dinámico antes de pendientes y cache 30m', async () => {
    const tool = makeTool('ver_disponibilidad')
    script(apiResponse([outText('ok')]))
    await runAgent(baseParams({ tools: [tool] }))

    const req = requests[0]!
    expect(req).toMatchObject({
      model: BOT_MODEL,
      store: false,
      max_output_tokens: 2048,
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
      prompt_cache_key: `turnogol:wa:${TENANT_ID}`,
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
      tools: [tool.definition],
    })
    expect(req.input).toEqual([
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: SYSTEM_RULES,
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
          {
            type: 'input_text',
            text: STATIC_CTX,
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
        ],
      },
      ...HISTORY_BEFORE,
      { role: 'developer', content: DYNAMIC_CTX },
      ...PENDING,
    ])
  })

  it('no muta los arreglos historyBeforePending ni pendingUserItems', async () => {
    const historyBefore = structuredClone(HISTORY_BEFORE)
    const pending = structuredClone(PENDING)
    script(apiResponse([fnCall('call_1', 'ver_disponibilidad')]), apiResponse([outText('listo')]))
    await runAgent(
      baseParams({
        historyBeforePending: historyBefore,
        pendingUserItems: pending,
        tools: [makeTool('ver_disponibilidad')],
      }),
    )
    expect(historyBefore).toEqual(HISTORY_BEFORE)
    expect(pending).toEqual(PENDING)
  })
})

describe('runAgent — ronda de function_call', () => {
  it('ejecuta la tool y devuelve SOLO el texto de la ronda final (no concatena texto de rondas previas)', async () => {
    const availability = makeTool('ver_disponibilidad', async () => ({
      kind: 'continue',
      output: '{"canchas":[]}',
    }))
    script(
      apiResponse([
        outText('Dejame ver…'),
        fnCall('call_1', 'ver_disponibilidad', { fecha: '2026-10-25' }),
      ]),
      apiResponse([outText('Hay 21:00 libre')]),
    )

    const result = await runAgent(baseParams({ tools: [availability] }))

    expect(availability.run).toHaveBeenCalledWith({ fecha: '2026-10-25' })
    expect(result.outcome).toBe('replied')
    expect(result.text).toBe('Hay 21:00 libre')
    expect(result.text).not.toContain('Dejame ver')
    expect(result.toolsCalled).toEqual(['ver_disponibilidad'])
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('corte limpio en pasar_a_humano: descarta texto previo, corta sin más rondas y devuelve outcome handoff con trace null', async () => {
    const availability = makeTool('ver_disponibilidad')
    const handoff = makeTool('pasar_a_humano', async () => ({
      kind: 'handoff',
      mensajeAlJugador: 'Ahí le paso tu consulta a los chicos del complejo.',
      output: '{"ok":true}',
    }))
    script(
      apiResponse([
        outText('Texto previo que NO debe salir'),
        fnCall('call_1', 'ver_disponibilidad'),
      ]),
      apiResponse([
        outText('Otro texto que tampoco debe salir'),
        fnCall('call_2', 'pasar_a_humano', {
          tipo: 'otro',
          motivo_corto: 'Pide cambio de cancha',
          nombre_jugador: null,
          mensaje_al_jugador: 'Ahí le paso tu consulta a los chicos del complejo.',
        }),
      ]),
      apiResponse([outText('Ronda 3 inalcanzable')]),
    )

    const result = await runAgent(baseParams({ tools: [availability, handoff] }))

    expect(result.outcome).toBe('handoff')
    expect(result.text).toBe('Ahí le paso tu consulta a los chicos del complejo.')
    expect(result.trace).toBeNull()
    expect(result.toolsCalled).toEqual(['ver_disponibilidad', 'pasar_a_humano'])
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('corte limpio en no_responder: devuelve outcome silent, text vacío, trace null y no hace otra llamada', async () => {
    const silent = makeTool('no_responder', async () => ({
      kind: 'silent',
      motivo: 'cierre_conversacion',
      output: '{"ok":true}',
    }))
    script(
      apiResponse([
        outText('Texto descartado'),
        fnCall('call_1', 'no_responder', { motivo: 'cierre_conversacion' }),
      ]),
      apiResponse([outText('Ronda 2 inalcanzable')]),
    )

    const result = await runAgent(baseParams({ tools: [silent] }))

    expect(result.outcome).toBe('silent')
    expect(result.text).toBe('')
    expect(result.trace).toBeNull()
    expect(result.toolsCalled).toEqual(['no_responder'])
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('si no_responder llega junto a otra tool en la misma ronda, no silencia el turno y la rechaza con error', async () => {
    const reservarRun = vi.fn(async () => ({ kind: 'continue' as const, output: '{"ok":true}' }))
    const silentRun = vi.fn(async () => ({
      kind: 'silent' as const,
      motivo: 'cierre_conversacion',
      output: '{"ok":true}',
    }))
    script(
      apiResponse([
        fnCall('call_1', 'reservar', { fecha: '2026-10-25' }),
        fnCall('call_2', 'no_responder', { motivo: 'cierre_conversacion' }),
      ]),
      apiResponse([outText('Listo, te reservé la cancha.')]),
    )

    const result = await runAgent(
      baseParams({
        tools: [
          { ...makeTool('reservar'), run: reservarRun },
          { ...makeTool('no_responder'), run: silentRun },
        ],
      }),
    )

    expect(result.outcome).toBe('replied')
    expect(result.text).toBe('Listo, te reservé la cancha.')
    expect(result.toolsCalled).toEqual(['reservar'])
    expect(reservarRun).toHaveBeenCalledTimes(1)
    expect(silentRun).not.toHaveBeenCalled()
    expect(requests[1]?.input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call_2',
      output: JSON.stringify({
        error: 'no_responder solo puede llamarse como única herramienta del turno.',
      }),
    })
  })

  it('si pasar_a_humano falla validación en una ronda mixta, aborta tools hermanas como reservar', async () => {
    const reservarRun = vi.fn(async () => ({ kind: 'continue' as const, output: '{"ok":true}' }))
    const handoff = makeTool('pasar_a_humano', async () => {
      throw new ToolInputError('Datos inválidos: falta tipo.')
    })
    script(
      apiResponse([
        fnCall('call_1', 'reservar', { fecha: '2026-10-25' }),
        fnCall('call_2', 'pasar_a_humano', {}),
      ]),
      apiResponse([outText('¿Me confirmás qué querés consultar?')]),
    )

    const result = await runAgent(
      baseParams({
        tools: [{ ...makeTool('reservar'), run: reservarRun }, handoff],
      }),
    )

    expect(result.outcome).toBe('replied')
    expect(result.text).toBe('¿Me confirmás qué querés consultar?')
    expect(reservarRun).not.toHaveBeenCalled()
    expect(result.toolsCalled).toEqual([])
    expect(requests[1]?.input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: JSON.stringify({
        error: 'Ronda cancelada por error de validación en pasar_a_humano.',
      }),
    })
    expect(requests[1]?.input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call_2',
      output: JSON.stringify({ error: 'Datos inválidos: falta tipo.' }),
    })
  })

  it('una herramienta desconocida vuelve como function_call_output de error y el loop sigue', async () => {
    script(
      apiResponse([fnCall('call_X', 'borrar_todo')]),
      apiResponse([outText('no puedo hacer eso')]),
    )
    const result = await runAgent(baseParams({ tools: [makeTool('reservar')] }))

    expect(requests[1]?.input.at(-1)).toEqual({
      type: 'function_call_output',
      call_id: 'call_X',
      output: JSON.stringify({ error: 'Herramienta desconocida.' }),
    })
    expect(result.text).toBe('no puedo hacer eso')
  })

  it('conserva reasoning y function_call en input para la siguiente ronda', async () => {
    const reasoningItem: OutputItem = { type: 'reasoning', id: 'rs_1', summary: [] }
    const callItem = fnCall('call_1', 'ver_disponibilidad', { fecha: '2026-10-25' })
    script(apiResponse([reasoningItem, callItem]), apiResponse([outText('listo')]))

    await runAgent(baseParams({ tools: [makeTool('ver_disponibilidad')] }))

    const secondInput = requests[1]!.input
    expect(secondInput).toContainEqual(reasoningItem)
    expect(secondInput).toContainEqual(callItem)
    expect(secondInput.at(-1)).toEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: '{"ok":true}',
    })
  })
})

describe('runAgent — errores y cortes', () => {
  it('ToolInputError o JSON inválido vuelven como function_call_output y el loop sigue', async () => {
    const reservar = makeTool('reservar', async () => {
      throw new ToolInputError('Datos inválidos: revisá el formato y volvé a intentar.')
    })
    script(
      apiResponse([fnCall('call_1', 'reservar', { fecha: 'mañana' })]),
      apiResponse([outText('¿Me pasás la fecha en número?')]),
    )

    const result = await runAgent(baseParams({ tools: [reservar] }))

    expect(requests[1]?.input.at(-1)).toEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: JSON.stringify({ error: 'Datos inválidos: revisá el formato y volvé a intentar.' }),
    })
    expect(result.text).toBe('¿Me pasás la fecha en número?')
  })

  it('JSON malformado en arguments de tool vuelve como error al modelo', async () => {
    const reservar = makeTool('reservar')
    script(
      apiResponse([
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_bad_json',
          name: 'reservar',
          arguments: '{invalid',
          status: 'completed',
        },
      ]),
      apiResponse([outText('perdon, repetime')]),
    )

    const result = await runAgent(baseParams({ tools: [reservar] }))
    expect(reservar.run).not.toHaveBeenCalled()
    expect(requests[1]?.input.at(-1)).toEqual({
      type: 'function_call_output',
      call_id: 'call_bad_json',
      output: JSON.stringify({
        error: 'Argumentos JSON inválidos en la llamada a la herramienta.',
      }),
    })
    expect(result.text).toBe('perdon, repetime')
  })

  it('cualquier otro error de tool se propaga y corta el turno', async () => {
    const boom = new Error('connection terminated unexpectedly')
    const reservar = makeTool('reservar', async () => {
      throw boom
    })
    script(apiResponse([fnCall('call_1', 'reservar')]))
    await expect(runAgent(baseParams({ tools: [reservar] }))).rejects.toBe(boom)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('corta en MAX_TOOL_ROUNDS (4) si sigue pidiendo herramientas', async () => {
    const tool = makeTool('ver_disponibilidad')
    mocks.create.mockImplementation(async () =>
      apiResponse([fnCall(`c${mocks.create.mock.calls.length}`, 'ver_disponibilidad')]),
    )
    await expect(runAgent(baseParams({ tools: [tool] }))).rejects.toThrow('rondas')
    expect(mocks.create).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1)
    expect(tool.run).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS)
  })

  it.each(['incomplete', 'failed'] as const)(
    'status "%s" rechaza sin mandar texto cortado',
    async (status) => {
      const tool = makeTool('reservar')
      script(
        apiResponse([outText('Reservo…'), fnCall('c1', 'reservar')], {
          status,
          incompleteReason: 'max_output_tokens',
        }),
      )
      await expect(runAgent(baseParams({ tools: [tool] }))).rejects.toThrow(status)
      expect(tool.run).not.toHaveBeenCalled()
    },
  )

  it('refusal rechaza el turno', async () => {
    script(apiResponse([msgItem({ type: 'refusal', refusal: 'No puedo' })]))
    await expect(runAgent(baseParams())).rejects.toThrow('refusal')
  })

  it('sin texto ni function_call rechaza el turno', async () => {
    script(apiResponse([]))
    await expect(runAgent(baseParams())).rejects.toThrow('sin texto')
  })
})

describe('runAgent — usage y trace', () => {
  it('descuenta cached_tokens de input_tokens y acumula todas las rondas', async () => {
    script(
      apiResponse([fnCall('c1', 'ver_disponibilidad')], {
        usage: {
          input_tokens: 4000,
          output_tokens: 40,
          input_tokens_details: { cached_tokens: 3000 },
        },
      }),
      apiResponse([outText('listo')], {
        usage: {
          input_tokens: 4300,
          output_tokens: 80,
          input_tokens_details: { cached_tokens: 3100 },
        },
      }),
    )
    const result = await runAgent(baseParams({ tools: [makeTool('ver_disponibilidad')] }))
    expect(result.usage).toEqual({
      inputTokens: 1000 + 1200,
      cachedTokens: 3000 + 3100,
      outputTokens: 40 + 80,
    })
  })

  it('devuelve trace OpenAiTracePayload v1 con calls, outputs y respuesta final sin reasoning', async () => {
    const availability = makeTool('ver_disponibilidad', async () => ({
      kind: 'continue',
      output: '{"canchas":[]}',
    }))
    script(
      apiResponse([
        { type: 'reasoning', id: 'rs_1', summary: [] },
        fnCall('call_1', 'ver_disponibilidad', { fecha: '2026-10-25' }),
      ]),
      apiResponse([outText('Hay 21:00 libre')]),
    )
    const result = await runAgent(baseParams({ tools: [availability] }))

    expect(result.trace).toEqual({
      v: 1,
      provider: 'openai_responses',
      items: [
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'ver_disponibilidad',
          arguments: JSON.stringify({ fecha: '2026-10-25' }),
        },
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: '{"canchas":[]}',
        },
        {
          role: 'assistant',
          content: 'Hay 21:00 libre',
        },
      ],
    })
  })
})
