import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_RULES } from './whatsapp-bot.prompt'

/**
 * Loop de tool use del bot (loop manual sobre `messages.create`, sin streaming:
 * las respuestas son cortas y nadie las ve llegar de a pedazos).
 *
 * Modelo: Claude Haiku 5.5 con effort `medium`: en `low` el modelo tiende a
 * saltearse chequeos en prompts largos (guía de Haiku 5.5), y acá un chequeo
 * salteado es un horario inventado. El historial que recibe trae los turnos
 * anteriores CON sus llamadas a herramientas (`trace`, guardado en
 * `whatsapp_messages.tool_trace`) y sin los bloques de thinking: se quitan
 * siempre igual, así el historial de un turno es solo-agregar.
 */

export const BOT_MODEL = 'claude-haiku-5-5'
/** Iteraciones de tool use por turno. Un turno normal usa 1 o 2. */
const MAX_TOOL_ROUNDS = 4
/** El thinking cuenta dentro del tope; lo que no se usa no se factura. */
const MAX_TOKENS = 4096

export type BotTool = {
  definition: Anthropic.Tool
  /** Recibe el input crudo del modelo: cada tool lo valida con su propio schema. */
  run: (input: unknown) => Promise<string>
}

type AgentUsage = { inputTokens: number; cachedTokens: number; outputTokens: number }

export type AgentResult = {
  /** Todo lo que el modelo escribió en el turno, en orden: es lo que sale por WhatsApp. */
  text: string
  usage: AgentUsage
  toolsCalled: string[]
  /**
   * Los mensajes que generó el turno (llamadas a tools, resultados y el texto
   * final), sin thinking. Vacío si el turno no terminó en texto: el próximo
   * turno ve entonces solo el texto que se mandó.
   */
  trace: Anthropic.MessageParam[]
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  // maxRetries: 2 (default del SDK) reintenta 408/409/429/5xx y errores de red.
  client ??= new Anthropic({ timeout: 30_000 })
  return client
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** Lo que se guarda de una respuesta para los turnos siguientes: texto y tool_use, nada de thinking. */
function forHistory(content: Anthropic.ContentBlock[]): Anthropic.ContentBlockParam[] {
  return content.flatMap((b): Anthropic.ContentBlockParam[] => {
    if (b.type === 'text') return b.text.trim() ? [{ type: 'text', text: b.text }] : []
    if (b.type === 'tool_use') return [{ type: 'tool_use', id: b.id, name: b.name, input: b.input }]
    return []
  })
}

export async function runAgent(params: {
  complexContext: string
  history: Anthropic.MessageParam[]
  tools: BotTool[]
}): Promise<AgentResult> {
  const byName = new Map(params.tools.map((t) => [t.definition.name, t]))
  const messages: Anthropic.MessageParam[] = [...params.history]
  const usage: AgentUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 }
  const toolsCalled: string[] = []
  const texts: string[] = []
  const trace: Anthropic.MessageParam[] = []

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().messages.create({
      model: BOT_MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'medium' },
      // Orden de render: tools → system → messages. Las tools y SYSTEM_RULES
      // son idénticas para todos: el breakpoint va al final de SYSTEM_RULES.
      tools: params.tools.map((t) => t.definition),
      system: [
        { type: 'text', text: SYSTEM_RULES, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: params.complexContext },
      ],
      messages,
    })

    // La escritura de caché se cobra 1,25× la entrada; la aproximamos a 1× y la
    // sumamos acá para que el gasto estimado del monitor no la deje afuera.
    usage.inputTokens +=
      response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0)
    usage.cachedTokens += response.usage.cache_read_input_tokens ?? 0
    usage.outputTokens += response.usage.output_tokens

    // Una respuesta cortada a la mitad o rechazada no se manda ni se ejecuta:
    // el llamador le avisa al jugador y pasa la charla a una persona.
    if (response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal') {
      throw new Error(`respuesta del modelo incompleta (${response.stop_reason})`)
    }

    const said = textOf(response.content)
    if (said) texts.push(said)
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )

    // Sin rondas para ejecutar lo que pidió, el texto suelto ("dale, te
    // reservo") anunciaría algo que no pasó.
    if (toolUses.length > 0 && response.stop_reason === 'tool_use' && round === MAX_TOOL_ROUNDS) {
      throw new Error(`el modelo siguió pidiendo herramientas después de ${MAX_TOOL_ROUNDS} rondas`)
    }

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      // Un tool_use que quedó sin ejecutar no entra al historial: la API exige
      // que cada tool_use tenga su tool_result.
      if (said) trace.push({ role: 'assistant', content: [{ type: 'text', text: said }] })
      const complete = trace.at(-1)?.role === 'assistant'
      return { text: texts.join('\n'), usage, toolsCalled, trace: complete ? trace : [] }
    }

    messages.push({ role: 'assistant', content: response.content })
    trace.push({ role: 'assistant', content: forHistory(response.content) })

    // Todas las tool_result van en UN solo mensaje de usuario.
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      toolsCalled.push(use.name)
      const tool = byName.get(use.name)
      if (!tool) {
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: 'Herramienta desconocida.',
        })
        continue
      }
      // Los errores de dominio (turno ocupado, tope alcanzado…) los traduce
      // cada tool a un texto para el modelo. Lo que llega acá como excepción
      // es input inválido (vuelve al modelo) o un fallo real (corta el turno y
      // el llamador pasa la charla a un humano).
      try {
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: await tool.run(use.input),
        })
      } catch (err) {
        if (!(err instanceof ToolInputError)) throw err
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: err.message,
        })
      }
    }
    messages.push({ role: 'user', content: results })
    trace.push({ role: 'user', content: results })
  }

  // Inalcanzable: la última vuelta siempre retorna.
  return { text: texts.join('\n'), usage, toolsCalled, trace: [] }
}

/** Input del modelo que no pasa el schema: vuelve como tool_result de error, no tira el turno. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}
