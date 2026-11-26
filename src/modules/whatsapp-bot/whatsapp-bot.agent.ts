import OpenAI from 'openai'
import type {
  FunctionTool,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseOutputItem,
} from 'openai/resources/responses/responses'
import { SYSTEM_RULES } from './whatsapp-bot.prompt'

/**
 * Agente sobre OpenAI Responses API con `gpt-6.2-sol`.
 * - `reasoning.effort`: `"low"` por defecto (margen), `"medium"` activable por env.
 * - `text.verbosity`: `"low"` fijo para respuestas cortas de WhatsApp.
 * - Prompt caching: `prompt_cache_key` estable por complejo + `prompt_cache_options: { mode: 'explicit', ttl: '30m' }`.
 * - Prefijo estático (`tools` + `developer` con `SYSTEM_RULES` y datos fijos del complejo,
 *   cada uno con `prompt_cache_breakpoint`) separado del contexto dinámico del turno.
 * - Corte inmediato y limpio al ejecutarse `pasar_a_humano` o `no_responder` (descarta cualquier
 *   texto previo y no ejecuta más rondas).
 */

export const BOT_MODEL = 'gpt-6.2-sol'
const MAX_TOOL_ROUNDS = 4
const MAX_OUTPUT_TOKENS = 2048

export type ReasoningEffort = 'low' | 'medium'

export function resolveReasoningEffort(override?: ReasoningEffort): ReasoningEffort {
  if (override) return override
  return process.env.OPENAI_BOT_REASONING_EFFORT === 'medium' ? 'medium' : 'low'
}

export type ToolRunOutput =
  | { kind: 'continue'; output: string }
  | { kind: 'handoff'; mensajeAlJugador: string; output: string }
  | { kind: 'silent'; motivo: string; output: string }

export type BotTool = {
  definition: FunctionTool
  run: (input: unknown) => Promise<ToolRunOutput>
}

export type AgentUsage = {
  /** Tokens de entrada NO cacheados (para costeo consistente con `whatsapp-monitor.service.ts`). */
  inputTokens: number
  /** Tokens servidos desde prompt cache (`usage.input_tokens_details.cached_tokens`). */
  cachedTokens: number
  /** Tokens de salida (incluye reasoning tokens). */
  outputTokens: number
}

/**
 * Formato versionado para `whatsapp_messages.tool_trace` (evita 400 con trazas viejas de Anthropic).
 */
export type OpenAiTracePayload = {
  v: 1
  provider: 'openai_responses'
  items: ResponseInputItem[]
}

export type AgentResult = {
  outcome: 'replied' | 'handoff' | 'silent'
  /** Texto único a enviar por WhatsApp (vacío solo si `outcome === 'silent'`). */
  text: string
  usage: AgentUsage
  /** Tokens escritos en prompt cache en el turno (tarifa cache write 30m: $2.50/MTok en gpt-6.2-sol). */
  cacheWriteTokens: number
  toolsCalled: string[]
  /** Traza limpia del turno (calls + outputs + respuesta final, sin reasoning). */
  trace: OpenAiTracePayload | null
}

let client: OpenAI | null = null
function getClient(): OpenAI {
  client ??= new OpenAI({ timeout: 30_000, maxRetries: 2 })
  return client
}

function extractAssistantText(output: ResponseOutputItem[]): { text: string; refused: boolean } {
  const parts: string[] = []
  let refused = false
  for (const item of output) {
    if (item.type !== 'message') continue
    for (const block of item.content) {
      if (block.type === 'output_text' && block.text.trim()) {
        parts.push(block.text.trim())
      } else if (block.type === 'refusal') {
        refused = true
      }
    }
  }
  return { text: parts.join('\n').trim(), refused }
}

function parseJsonArgs(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new ToolInputError('Argumentos JSON inválidos en la llamada a la herramienta.')
  }
}

export async function runAgent(params: {
  tenantId: string
  staticComplexContext: string
  dynamicTurnContext: string
  historyBeforePending: ResponseInputItem[]
  pendingUserItems: ResponseInputItem[]
  tools: BotTool[]
  reasoningEffort?: ReasoningEffort
  model?: string
}): Promise<AgentResult> {
  const byName = new Map(params.tools.map((t) => [t.definition.name, t]))
  const effort = resolveReasoningEffort(params.reasoningEffort)
  const model = params.model ?? BOT_MODEL

  // Prefijo 100% estable por complejo en input[0] con breakpoints explícitos (guía GPT-6.2 Responses API).
  const staticDeveloperItem: ResponseInputItem = {
    role: 'developer',
    content: [
      {
        type: 'input_text',
        text: SYSTEM_RULES,
        prompt_cache_breakpoint: { mode: 'explicit' },
      },
      {
        type: 'input_text',
        text: params.staticComplexContext,
        prompt_cache_breakpoint: { mode: 'explicit' },
      },
    ],
  }
  const dynamicDeveloperItem: ResponseInputItem = {
    role: 'developer',
    content: params.dynamicTurnContext,
  }

  // Orden de input: [prefijo estático cacheable] -> [historial previo] -> [contexto vivo] -> [pendientes]
  const input: ResponseInputItem[] = [
    staticDeveloperItem,
    ...params.historyBeforePending,
    dynamicDeveloperItem,
    ...params.pendingUserItems,
  ]

  const usage: AgentUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 }
  let cacheWriteTokens = 0
  const toolsCalled: string[] = []
  const traceItems: ResponseInputItem[] = []

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const req: ResponseCreateParamsNonStreaming = {
      model,
      store: false,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort },
      text: { verbosity: 'low' },
      prompt_cache_key: `turnogol:wa:${params.tenantId}`,
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
      tools: params.tools.map((t) => t.definition),
      input,
    }

    const response = await getClient().responses.create(req)

    const totalInput = response.usage?.input_tokens ?? 0
    const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0
    cacheWriteTokens += response.usage?.input_tokens_details?.cache_write_tokens ?? 0
    usage.inputTokens += Math.max(0, totalInput - cached)
    usage.cachedTokens += cached
    usage.outputTokens += response.usage?.output_tokens ?? 0

    if (response.status === 'incomplete' || response.status === 'failed') {
      throw new Error(
        `respuesta incompleta de OpenAI (${response.status}: ${response.incomplete_details?.reason ?? 'unknown'})`,
      )
    }

    const { text: finalText, refused } = extractAssistantText(response.output)
    if (refused) {
      throw new Error('el modelo rechazó responder (refusal)')
    }

    const functionCalls = response.output.filter(
      (item): item is ResponseFunctionToolCall => item.type === 'function_call',
    )

    // Sin llamadas a tools: devolvemos SOLO el texto de esta ronda final (nunca concatenado).
    if (functionCalls.length === 0) {
      if (!finalText) {
        throw new Error('el modelo terminó sin texto ni llamadas a herramientas')
      }
      traceItems.push({ role: 'assistant', content: finalText })
      return {
        outcome: 'replied',
        text: finalText,
        usage,
        cacheWriteTokens,
        toolsCalled,
        trace: { v: 1, provider: 'openai_responses', items: traceItems },
      }
    }

    if (round === MAX_TOOL_ROUNDS) {
      throw new Error(`el modelo siguió pidiendo herramientas después de ${MAX_TOOL_ROUNDS} rondas`)
    }

    // Prioridad absoluta a `pasar_a_humano`: corta la ronda y el loop, descarta todo texto previo.
    let handoffValidationError: string | null = null
    const handoffCall = functionCalls.find((c) => c.name === 'pasar_a_humano')
    if (handoffCall) {
      const tool = byName.get('pasar_a_humano')
      if (tool) {
        try {
          const out = await tool.run(parseJsonArgs(handoffCall.arguments))
          toolsCalled.push('pasar_a_humano')
          if (out.kind === 'handoff') {
            return {
              outcome: 'handoff',
              text: out.mensajeAlJugador,
              usage,
              cacheWriteTokens,
              toolsCalled,
              // No guardamos trace de handoff para no dejar calls abiertas si el chat retoma en 6h.
              trace: null,
            }
          }
        } catch (err) {
          if (!(err instanceof ToolInputError)) throw err
          // Si `pasar_a_humano` falla validación en una ronda mixta, evitamos ejecutar
          // herramientas hermanas (ej. `reservar`) hasta que el modelo corrija o reintente.
          handoffValidationError = err.message
        }
      }
    }

    // Prioridad a `no_responder` cuando es la única intención del turno.
    let silentValidationError: string | null = null
    if (
      !handoffValidationError &&
      functionCalls.length === 1 &&
      functionCalls[0]!.name === 'no_responder'
    ) {
      const silentCall = functionCalls[0]!
      const tool = byName.get('no_responder')
      if (tool) {
        try {
          const out = await tool.run(parseJsonArgs(silentCall.arguments))
          toolsCalled.push('no_responder')
          if (out.kind === 'silent') {
            return {
              outcome: 'silent',
              text: '',
              usage,
              cacheWriteTokens,
              toolsCalled,
              trace: null,
            }
          }
        } catch (err) {
          if (!(err instanceof ToolInputError)) throw err
          silentValidationError = err.message
        }
      }
    }

    // Mantenemos los ítems de output (incluyendo reasoning) en el `input` de la siguiente ronda
    // dentro del mismo turno para preservar coherencia y caché; en `traceItems` solo guardamos calls.
    for (const outItem of response.output) {
      input.push(outItem as unknown as ResponseInputItem)
      if (outItem.type === 'function_call') {
        traceItems.push({
          type: 'function_call',
          call_id: outItem.call_id,
          name: outItem.name,
          arguments: outItem.arguments,
        })
      }
    }

    for (const call of functionCalls) {
      let outputStr: string

      if (handoffValidationError !== null) {
        outputStr = JSON.stringify({
          error:
            call === handoffCall
              ? handoffValidationError
              : 'Ronda cancelada por error de validación en pasar_a_humano.',
        })
      } else if (silentValidationError !== null) {
        outputStr = JSON.stringify({ error: silentValidationError })
      } else if (call.name === 'no_responder' && functionCalls.length > 1) {
        // Nunca silenciar el turno si hubo otras llamadas (ej. `reservar`): el jugador necesita respuesta.
        outputStr = JSON.stringify({
          error: 'no_responder solo puede llamarse como única herramienta del turno.',
        })
      } else {
        toolsCalled.push(call.name)
        const tool = byName.get(call.name)

        if (!tool) {
          outputStr = JSON.stringify({ error: 'Herramienta desconocida.' })
        } else {
          try {
            const res = await tool.run(parseJsonArgs(call.arguments))
            if (res.kind === 'handoff') {
              return {
                outcome: 'handoff',
                text: res.mensajeAlJugador,
                usage,
                cacheWriteTokens,
                toolsCalled,
                trace: null,
              }
            }
            if (res.kind === 'silent') {
              return {
                outcome: 'silent',
                text: '',
                usage,
                cacheWriteTokens,
                toolsCalled,
                trace: null,
              }
            }
            outputStr = res.output
          } catch (err) {
            if (!(err instanceof ToolInputError)) throw err
            outputStr = JSON.stringify({ error: err.message })
          }
        }
      }

      const outputItem: ResponseInputItem = {
        type: 'function_call_output',
        call_id: call.call_id,
        output: outputStr,
      }
      input.push(outputItem)
      traceItems.push(outputItem)
    }
  }

  throw new Error('el loop del agente terminó sin resultado')
}

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}
