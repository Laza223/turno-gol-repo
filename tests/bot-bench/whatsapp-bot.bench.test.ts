import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { faker } from '@faker-js/faker'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  Responses,
  type Response as OpenAiResponse,
  type ResponseCreateParamsNonStreaming,
  type ResponseFunctionToolCall,
  type ResponseInputItem,
  type ResponseOutputItem,
} from 'openai/resources/responses/responses'
import { parse as parseEnv } from 'dotenv'
import { closeSql } from '@/shared/db/client'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import type { NormalizedWhatsappEvent } from '@/lib/kapso/events.schema'
import { sendWhatsappText } from '@/lib/kapso/client'
import { captureException } from '@/lib/sentry'
import { notifyAdminPush } from '@/modules/notifications/push.service'
import {
  BOT_MODEL,
  resolveReasoningEffort,
  type ReasoningEffort,
} from '@/modules/whatsapp-bot/whatsapp-bot.agent'
import { ingestWhatsappEvents } from '@/modules/whatsapp-bot/whatsapp-bot.ingest'
import { SYSTEM_RULES } from '@/modules/whatsapp-bot/whatsapp-bot.prompt'
import { processWhatsappTurn } from '@/modules/whatsapp-bot/whatsapp-bot.turn'
import { adminSql } from '../helpers/admin-db'
import { ensureRoles } from '../helpers/tenant'
import { seedComplex, type BenchSeed } from './seed'
import {
  SCENARIOS,
  commonChecks,
  prepareChat,
  todayLabel,
  type BotTurnLog,
  type Check,
  type FinalState,
  type Scenario,
  type ToolCallLog,
} from './scenarios'
import {
  JUDGE_BATCH_DISCOUNT,
  JUDGE_METRICS,
  JUDGE_MODEL,
  SIM_MODEL,
  emptyUsage,
  judgeBatch,
  judgeConversation,
  simulatePlayer,
  type JudgeInput,
  type JudgeVerdict,
  type Usage,
} from './sonnet'

/**
 * Banco de pruebas del bot de WhatsApp contra OpenAI DE VERDAD (`gpt-6.2-sol` por defecto),
 * con jugador simulado (Haiku 5.5) y juez (Sonnet 5.5).
 *
 * Corre el camino real de producción — `ingestWhatsappEvents` →
 * `processWhatsappTurn` → `runAgent` → tools → Postgres — y mockea solo los
 * bordes que salen de la máquina: Kapso (el envío por WhatsApp), el push al
 * admin y Sentry. MercadoPago corre en su modo simulado (`MP_MOCK_MODE`).
 * Cada conversación tiene su propio complejo recién sembrado.
 *
 * Gasta plata de la API: nunca corre en `pnpm test` ni en CI. Se corre a mano:
 *   DATABASE_URL=<postgres descartable> pnpm test:bot-bench
 * Variables: BOT_BENCH_REPS (3), BOT_BENCH_ONLY (ids separados por coma),
 * BOT_BENCH_CONCURRENCY (4), BOT_BENCH_VARIANT (baseline), BOT_BENCH_RESUME (1
 * para saltear los casos ya corridos), BOT_BENCH_MAX_USD (tope de gasto: no
 * lanza un caso que lo pueda pasar), BOT_BENCH_JUDGE (`batch` por defecto,
 * `inline` para tener cada veredicto al toque y a precio completo),
 * BOT_BENCH_MODEL (override opcional del modelo del bot),
 * BOT_BENCH_EFFORT (`low` | `medium`, override opcional de `reasoning.effort`).
 * Salida en `.claude/hillclimb/whatsapp-bot/`.
 *
 * Una conversación que no pasa los chequeos deterministas ya está reprobada:
 * no se le paga el juez.
 */

vi.hoisted(() => {
  process.env.MP_MOCK_MODE = '1'
  process.env.NEXT_PUBLIC_APP_URL ??= 'https://turnogol.app'
})
vi.mock('@/lib/kapso/client', () => ({ sendWhatsappText: vi.fn() }))
vi.mock('@/modules/notifications/push.service', () => ({
  notifyAdminPush: vi.fn(),
  notifyAdminBookingConfirmed: vi.fn(async () => ({ enqueued: 1 })),
}))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

// ─── Configuración ──────────────────────────────────────────────────────────

/** Carga OPENAI_API_KEY y ANTHROPIC_API_KEY desde env o `.env.local`. */
function loadApiKeys(): { openai?: string; anthropic?: string } {
  const file = path.resolve(process.cwd(), '.env.local')
  const parsed = existsSync(file) ? parseEnv(readFileSync(file)) : {}
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'] as const) {
    if (!process.env[name] && parsed[name]) process.env[name] = parsed[name]
  }
  return { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY }
}

const API_KEYS = loadApiKeys()
const HAS_KEYS = Boolean(API_KEYS.openai && API_KEYS.anthropic)
// Sin DATABASE_URL los helpers caen a :54322, la base local de Lazar. Las otras
// dos, si están, tienen que apuntar a la misma base descartable.
const SAFE_DB =
  Boolean(process.env.DATABASE_URL) &&
  [
    process.env.DATABASE_URL,
    process.env.TEST_ADMIN_DATABASE_URL,
    process.env.WORKER_DATABASE_URL,
  ].every((url) => !url?.includes(':54322'))

const REPS = Number(process.env.BOT_BENCH_REPS ?? 3)
const CONCURRENCY = Number(process.env.BOT_BENCH_CONCURRENCY ?? 4)
const VARIANT = process.env.BOT_BENCH_VARIANT ?? 'baseline'
const ONLY = (process.env.BOT_BENCH_ONLY ?? '').split(',').filter(Boolean)
const RESUME = process.env.BOT_BENCH_RESUME === '1'
const MAX_USD = Number(process.env.BOT_BENCH_MAX_USD ?? 'Infinity')
const JUDGE_INLINE = process.env.BOT_BENCH_JUDGE === 'inline'
const BENCH_MODEL = process.env.BOT_BENCH_MODEL?.trim() || BOT_MODEL
const BENCH_EFFORT: ReasoningEffort | undefined =
  process.env.BOT_BENCH_EFFORT === 'low' || process.env.BOT_BENCH_EFFORT === 'medium'
    ? process.env.BOT_BENCH_EFFORT
    : undefined
const CASE_TIMEOUT_MS = 5 * 60 * 1000
/**
 * Lo que se reserva del tope antes de lanzar un caso: bot (`gpt-6.2-sol`) +
 * jugador + juez por lote estimados con margen.
 */
const EST_CASE_USD = 0.035
/** Lo que se cuenta por una conversación que espera al juez por lote. */
const EST_JUDGE_USD = 0.008

const FLOW_DIR = path.resolve(process.cwd(), '.claude/hillclimb/whatsapp-bot')
const OUT_DIR = path.join(FLOW_DIR, VARIANT)

/** USD por millón de tokens: entrada, salida, lectura y escritura de caché. */
const PRICES: Record<string, { in: number; out: number; read: number; write: number }> = {
  'gpt-6.2-sol': { in: 2, out: 10, read: 0.1, write: 2.5 },
  'gpt-6-luna': { in: 0.1, out: 0.5, read: 0.01, write: 0.125 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, read: 0.01, write: 0.125 },
  'claude-sonnet-5-5': { in: 2, out: 10, read: 0.2, write: 2.5 },
}

function costUsd(model: string, u: Usage): number {
  const p = PRICES[model]
  if (!p) return 0
  return (
    (u.input_tokens * p.in +
      u.output_tokens * p.out +
      u.cache_read_input_tokens * p.read +
      u.cache_creation_input_tokens * p.write) /
    1_000_000
  )
}

// ─── Grabación de las llamadas del bot ──────────────────────────────────────

type BotCall = {
  model: string
  status: string | undefined
  incompleteReason: string | null
  usage: Usage
  output: ResponseOutputItem[]
  input: ResponseInputItem[]
  staticContext: string
  dynamicContext: string
  latencyMs: number
}

type ConvStore = { calls: BotCall[]; errors: unknown[]; replies: string[]; pushes: number }

const als = new AsyncLocalStorage<ConvStore>()

type CreateFn = (
  this: unknown,
  body: ResponseCreateParamsNonStreaming,
  options?: unknown,
) => Promise<OpenAiResponse>

const responsesProto = Responses.prototype as unknown as { create: CreateFn }
const originalCreate = responsesProto.create

function itemText(item: ResponseInputItem | undefined): string {
  if (!item || !('content' in item)) return ''
  if (typeof item.content === 'string') return item.content
  if (!Array.isArray(item.content)) return ''
  return item.content
    .map((p) => ('text' in p && typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n\n')
}

function openAiUsageToBenchUsage(u: OpenAiResponse['usage']): Usage {
  if (!u) return emptyUsage()
  const cached = u.input_tokens_details?.cached_tokens ?? 0
  const cacheWrite = u.input_tokens_details?.cache_write_tokens ?? 0
  const uncached = Math.max(0, u.input_tokens - cached - cacheWrite)
  return {
    input_tokens: uncached,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: cacheWrite,
  }
}

/**
 * Envuelve `Responses.prototype.create` para guardar cada llamada DEL BOT de la
 * conversación en curso y permitir override de modelo/effort por variable de entorno.
 */
function installRecorder(): void {
  responsesProto.create = function (body, options) {
    const store = als.getStore()
    const inputItems = Array.isArray(body.input) ? body.input : []
    const firstDevText = itemText(inputItems[0])
    const isBot = firstDevText.includes(SYSTEM_RULES)
    if (!store || !isBot) return originalCreate.call(this, body, options)

    const effectiveBody: ResponseCreateParamsNonStreaming = {
      ...body,
      model: BENCH_MODEL,
      ...(BENCH_EFFORT ? { reasoning: { ...body.reasoning, effort: BENCH_EFFORT } } : {}),
    }
    const staticContext = firstDevText.replace(SYSTEM_RULES, '').trim()
    const dynamicItem = [...inputItems]
      .slice(1)
      .reverse()
      .find((item) => 'role' in item && item.role === 'developer')
    const dynamicContext = itemText(dynamicItem)
    const snapshotInput = structuredClone(inputItems)
    const started = Date.now()

    return originalCreate.call(this, effectiveBody, options).then((res) => {
      store.calls.push({
        model: res.model,
        status: res.status,
        incompleteReason: res.incomplete_details?.reason ?? null,
        usage: openAiUsageToBenchUsage(res.usage),
        output: res.output,
        input: snapshotInput,
        staticContext,
        dynamicContext,
        latencyMs: Date.now() - started,
      })
      return res
    })
  }
}

/** Empareja cada function_call con su resultado (viene en el input de la vuelta siguiente). */
function toolLogs(calls: BotCall[]): ToolCallLog[] {
  const results = new Map<string, string>()
  for (const call of calls) {
    for (const item of call.input) {
      if (item.type === 'function_call_output' && item.call_id) {
        const outputText =
          typeof item.output === 'string' ? item.output : (JSON.stringify(item.output) ?? '')
        results.set(item.call_id, outputText)
      }
    }
  }
  return calls.flatMap((call) =>
    call.output
      .filter((item): item is ResponseFunctionToolCall => item.type === 'function_call')
      .map((fn) => {
        let parsedInput: unknown = fn.arguments
        try {
          parsedInput = JSON.parse(fn.arguments)
        } catch {
          // Mantiene el raw si el modelo devolvió JSON inválido.
        }
        const terminalFallback =
          fn.name === 'pasar_a_humano' || fn.name === 'no_responder'
            ? '{"ok":true,"corte_turno":true}'
            : '(sin resultado)'
        return {
          name: fn.name,
          input: parsedInput,
          result: results.get(fn.call_id) ?? terminalFallback,
        }
      }),
  )
}

// ─── Trazas ─────────────────────────────────────────────────────────────────

type TraceTurn = {
  role: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  name?: string
}

/**
 * Las herramientas del turno y la respuesta final que leyó el jugador.
 */
function traceForTurn(calls: BotCall[], reply: string | null): TraceTurn[] {
  const out: TraceTurn[] = toolLogs(calls).flatMap((log): TraceTurn[] => [
    { role: 'tool_call', name: log.name, content: JSON.stringify(log.input, null, 2) },
    { role: 'tool_result', name: log.name, content: log.result },
  ])
  out.push({ role: 'assistant', content: reply ?? '(no contestó)' })
  return out
}

function transcriptForJudge(trace: TraceTurn[]): string {
  return trace
    .filter((t) => t.role !== 'system')
    .map((t) => {
      if (t.role === 'user') return `JUGADOR: ${t.content}`
      if (t.role === 'tool_call')
        return `  [el asistente llama ${t.name} con ${t.content.replace(/\s+/g, ' ')}]`
      if (t.role === 'tool_result') return `  [${t.name} devuelve: ${t.content}]`
      return `ASISTENTE: ${t.content}`
    })
    .join('\n\n')
}

// ─── Una conversación ───────────────────────────────────────────────────────

type ConvResult = {
  seed: BenchSeed
  state: FinalState
  trace: TraceTurn[]
  calls: BotCall[]
  errors: unknown[]
  simUsage: Usage
}

const DEFAULT_MAX_USER_TURNS = 6

async function finalState(seed: BenchSeed, phone: string, turns: BotTurnLog[], pushes: number) {
  const sql = adminSql()
  const [chat] = await sql<
    { id: string; pause_reason: string | null; paused_until: Date | null }[]
  >`
    SELECT id, pause_reason, paused_until FROM whatsapp_chats
    WHERE tenant_id = ${seed.tenantId} AND wa_phone = ${phone}
  `
  const bookings = chat
    ? await sql<
        {
          date: string
          time_start: string
          court: string
          format: number
          status: string
          deposit_status: string
          guest_name: string | null
        }[]
      >`
        SELECT to_char(b.date, 'YYYY-MM-DD') AS date, to_char(b.time_start, 'HH24:MI') AS time_start,
               c.name AS court, c.format, b.status::text AS status,
               b.deposit_status::text AS deposit_status, b.guest_name
        FROM bookings b JOIN courts c ON c.id = b.court_id
        WHERE b.tenant_id = ${seed.tenantId} AND b.whatsapp_chat_id = ${chat.id}
        ORDER BY b.date, b.time_start
      `
    : []
  return {
    bookings: bookings.map((b) => ({
      date: b.date,
      timeStart: b.time_start,
      court: b.court,
      format: b.format,
      status: b.status,
      depositStatus: b.deposit_status,
      guestName: b.guest_name,
    })),
    pauseReason: chat?.pause_reason ?? null,
    pausedUntil: chat?.paused_until ?? null,
    pushes,
    turns,
  } satisfies FinalState
}

async function runConversation(sc: Scenario): Promise<ConvResult> {
  const store: ConvStore = { calls: [], errors: [], replies: [], pushes: 0 }
  return als.run(store, async () => {
    const seed = await seedComplex(sc.complex)
    await prepareChat(sc, seed)

    const trace: TraceTurn[] = []
    const turns: BotTurnLog[] = []
    const transcript: { from: 'jugador' | 'complejo'; text: string }[] = []
    const simUsage = emptyUsage()
    let chatId: string | null = null
    let pending = sc.opening
    let closing = false
    let botReplies = 0

    for (let i = 0; i < (sc.maxUserTurns ?? DEFAULT_MAX_USER_TURNS); i++) {
      const events: NormalizedWhatsappEvent[] = pending.map((m) => ({
        kind: 'inbound',
        phoneNumberId: seed.phoneNumberId,
        waMessageId: `wamid.bench.${faker.string.uuid()}`,
        from: seed.phone,
        contactName: sc.persona.nombre,
        messageKind: m.kind ?? 'text',
        text: m.text,
      }))
      for (const m of pending) {
        const text =
          m.kind === 'audio' ? `[audio] ${m.text ?? '(no se pudo transcribir)'}` : (m.text ?? '')
        transcript.push({ from: 'jugador', text })
        trace.push({ role: 'user', content: text })
      }

      const ingest = await ingestWhatsappEvents(events, new Date())
      chatId = ingest.chatsToProcess[0]?.chatId ?? chatId
      if (!chatId) throw new Error('la ingesta no devolvió el chat')

      const callsBefore = store.calls.length
      const repliesBefore = store.replies.length
      const outcome = await processWhatsappTurn({ tenantId: seed.tenantId, chatId }, new Date())
      const calls = store.calls.slice(callsBefore)
      const reply = store.replies.slice(repliesBefore).join('\n') || null
      turns.push({ outcome, reply, tools: toolLogs(calls) })
      if (calls.length > 0 || reply) trace.push(...traceForTurn(calls, reply))
      else trace.push({ role: 'assistant', content: `(sin respuesta: ${outcome})` })

      if (outcome !== 'replied' || !reply || closing) break
      transcript.push({ from: 'complejo', text: reply })
      botReplies++
      if (sc.afterBotReply?.n === botReplies) {
        await sc.afterBotReply.run(seed).catch((err: unknown) => {
          trace.push({ role: 'system', content: `(el gancho del escenario falló: ${String(err)})` })
        })
      }

      const next = await simulatePlayer({
        persona: sc.persona,
        today: todayLabel(),
        transcript,
        usage: simUsage,
      })
      if (next.mensajes.length === 0) break
      pending = next.mensajes.map((text) => ({ text }))
      closing = next.terminar
    }

    const firstStatic = store.calls[0]?.staticContext ?? ''
    const lastDynamic = store.calls.at(-1)?.dynamicContext ?? ''
    trace.unshift({
      role: 'system',
      content: [firstStatic, lastDynamic].filter(Boolean).join('\n\n'),
    })
    return {
      seed,
      state: await finalState(seed, seed.phone, turns, store.pushes),
      trace,
      calls: store.calls,
      errors: store.errors,
      simUsage,
    }
  })
}

// ─── Corrida ────────────────────────────────────────────────────────────────

type CaseOutcome = { id: string; rep: number; aprobado: boolean; costUsd: number; failed?: string }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout de ${ms / 1000} s`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!)
    }),
  )
}

function addBenchUsage(into: Usage, u: Usage): void {
  into.input_tokens += u.input_tokens
  into.output_tokens += u.output_tokens
  into.cache_read_input_tokens += u.cache_read_input_tokens
  into.cache_creation_input_tokens += u.cache_creation_input_tokens
}

function sumUsage(calls: BotCall[]): Usage {
  const u = emptyUsage()
  for (const c of calls) addBenchUsage(u, c.usage)
  return u
}

function failureClass(err: unknown): string {
  if (err instanceof OpenAI.APIError || err instanceof Anthropic.APIError) return 'api_error'
  if (err instanceof Error && err.message.startsWith('timeout')) return 'timeout'
  if (err instanceof Error && err.message.startsWith('modelo servido')) return 'model_mismatch'
  return 'harness_error'
}

/** Una conversación ya jugada y con los chequeos hechos; el juez viene después. */
type Played = {
  sc: Scenario
  rep: number
  conv: ConvResult
  checks: Check[]
  checksOk: boolean
  /** Bot + jugador simulado. */
  costUsd: number
  latencyS: number
}

type Judged = { verdict: JudgeVerdict; usage: Usage; costUsd: number }

function writeTrace(id: string, rep: number, trace: TraceTurn[]): void {
  writeFileSync(
    path.join(OUT_DIR, 'traces', `${id}_rep${rep}.json`),
    JSON.stringify(trace, null, 2),
  )
}

function recordError(
  id: string,
  rep: number,
  failure: string,
  err: unknown,
  usage: Usage,
  costUsd: number,
): CaseOutcome {
  appendFileSync(
    path.join(OUT_DIR, 'errors.jsonl'),
    `${JSON.stringify({
      prompt_id: id,
      rep,
      failure_class: failure,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      model: BENCH_MODEL,
      usage,
    })}\n`,
  )
  return { id, rep, aprobado: false, costUsd, failed: failure }
}

async function playCase(sc: Scenario, rep: number): Promise<Played | CaseOutcome> {
  const started = Date.now()
  let conv: ConvResult | null = null
  try {
    conv = await withTimeout(runConversation(sc), CASE_TIMEOUT_MS)
    const botUsage = sumUsage(conv.calls)
    const served = conv.calls.find((c) => !c.model.startsWith(BENCH_MODEL))
    if (served) {
      throw new Error(`modelo servido ${served.model} distinto del pedido ${BENCH_MODEL}`)
    }
    const cost = costUsd(BENCH_MODEL, botUsage) + costUsd(SIM_MODEL, conv.simUsage)
    // Un turno caído por la API o por una excepción de tool no es una respuesta
    // del modelo: va a errors.jsonl, no se califica.
    if (conv.errors.length > 0) {
      const err = conv.errors[0]
      writeTrace(sc.id, rep, conv.trace)
      const failure =
        err instanceof OpenAI.APIError || err instanceof Anthropic.APIError
          ? 'api_error'
          : 'tool_exception'
      return recordError(sc.id, rep, failure, err, botUsage, cost)
    }
    const checks = [...commonChecks(conv.state), ...sc.checks(conv.state, conv.seed)]
    return {
      sc,
      rep,
      conv,
      checks,
      checksOk: checks.every((c) => c.ok),
      costUsd: cost,
      latencyS: (Date.now() - started) / 1000,
    }
  } catch (err) {
    const usage = conv ? sumUsage(conv.calls) : emptyUsage()
    return recordError(sc.id, rep, failureClass(err), err, usage, costUsd(BENCH_MODEL, usage))
  }
}

function judgeInput(p: Played): JudgeInput {
  const staticCtx = p.conv.calls[0]?.staticContext ?? ''
  const dynamicCtx = p.conv.calls.at(-1)?.dynamicContext ?? ''
  return {
    complexContext: [staticCtx, dynamicCtx].filter(Boolean).join('\n\n'),
    esperado: p.sc.esperado,
    transcript: transcriptForJudge(p.conv.trace),
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
  return sorted[idx]!
}

/** Escribe la fila del caso. Sin veredicto = no se juzgó porque fallaron los chequeos. */
function recordCase(p: Played, judged: Judged | null): CaseOutcome {
  const { sc, rep, conv, checks, checksOk } = p
  const verdict = judged?.verdict
  const aprobado =
    checksOk &&
    verdict !== undefined &&
    verdict.resolvio.ok &&
    verdict.no_invento.ok &&
    verdict.amable.ok &&
    verdict.intencion.ok &&
    verdict.formato.ok

  const grade: Record<string, number> = { aprobado: aprobado ? 1 : 0, chequeos: checksOk ? 1 : 0 }
  const explanation: Record<string, string> = {
    chequeos:
      checks
        .filter((c) => !c.ok)
        .map((c) => `✗ ${c.name}${c.detail ? ` (${c.detail})` : ''}`)
        .join('; ') || 'todos pasan',
  }
  for (const m of JUDGE_METRICS) {
    if (!verdict) {
      explanation[m] = 'sin juzgar: fallaron los chequeos'
      continue
    }
    grade[m] = verdict[m].ok ? 1 : 0
    explanation[m] = verdict[m].razon
  }
  const last = conv.calls.at(-1)
  const truncated = conv.calls.some(
    (c) => c.status === 'incomplete' && c.incompleteReason === 'max_output_tokens',
  )
  const botUsage = sumUsage(conv.calls)
  const totalIn =
    botUsage.input_tokens + botUsage.cache_read_input_tokens + botUsage.cache_creation_input_tokens
  const cacheHitPct = totalIn > 0 ? (botUsage.cache_read_input_tokens / totalIn) * 100 : 0
  const latencies = conv.calls.map((c) => c.latencyMs)
  const cost = p.costUsd + (judged?.costUsd ?? 0)
  const row = {
    prompt_id: sc.id,
    rep,
    prompt: sc.opening.map((m) => m.text ?? '[audio sin transcripción]').join(' / '),
    tags: sc.tags,
    model: conv.calls[0]?.model ?? BENCH_MODEL,
    effort: resolveReasoningEffort(BENCH_EFFORT),
    status: truncated ? 'truncated' : 'ok',
    stop_reason: last?.incompleteReason ?? last?.status ?? null,
    grade,
    explanation,
    latency_s: p.latencyS,
    p50_call_ms: percentile(latencies, 0.5),
    p95_call_ms: percentile(latencies, 0.95),
    cache_hit_pct: Number(cacheHitPct.toFixed(1)),
    tool_calls: conv.state.turns.reduce((n, t) => n + t.tools.length, 0),
    usage: botUsage,
    judge_model: judged ? JUDGE_MODEL : null,
    judge_usage: judged?.usage ?? null,
    meta: {
      sim_model: SIM_MODEL,
      sim_usage: conv.simUsage,
      cost_usd: cost,
      judge: judged ? (JUDGE_INLINE ? 'inline' : 'batch') : 'skipped',
      bot_turns: conv.state.turns.length,
      checks,
      bookings: conv.state.bookings,
      pause_reason: conv.state.pauseReason,
    },
  }
  appendFileSync(path.join(OUT_DIR, 'results.jsonl'), `${JSON.stringify(row)}\n`)
  writeTrace(sc.id, rep, conv.trace)
  return { id: sc.id, rep, aprobado, costUsd: cost }
}

async function judgeInlineCase(p: Played): Promise<CaseOutcome> {
  const usage = emptyUsage()
  try {
    const verdict = await judgeConversation({ ...judgeInput(p), usage })
    return recordCase(p, { verdict, usage, costUsd: costUsd(JUDGE_MODEL, usage) })
  } catch (err) {
    writeTrace(p.sc.id, p.rep, p.conv.trace)
    const cost = p.costUsd + costUsd(JUDGE_MODEL, usage)
    return recordError(p.sc.id, p.rep, 'judge_error', err, sumUsage(p.conv.calls), cost)
  }
}

const batchId = (p: Played) => `${p.sc.id}_rep${p.rep}`

async function judgeBatchCases(played: Played[]): Promise<CaseOutcome[]> {
  const results = await judgeBatch(
    played.map((p) => ({ customId: batchId(p), input: judgeInput(p) })),
    (line) => console.log(`[bot-bench] ${line}`),
  )
  return played.map((p) => {
    const r = results.get(batchId(p)) ?? new Error('juez por lote: sin resultado')
    if (r instanceof Error) {
      writeTrace(p.sc.id, p.rep, p.conv.trace)
      return recordError(p.sc.id, p.rep, 'judge_error', r, sumUsage(p.conv.calls), p.costUsd)
    }
    const judgeCost = costUsd(JUDGE_MODEL, r.usage) * JUDGE_BATCH_DISCOUNT
    return recordCase(p, { ...r, costUsd: judgeCost })
  })
}

function doneKeys(): Set<string> {
  const file = path.join(OUT_DIR, 'results.jsonl')
  if (!RESUME || !existsSync(file)) return new Set()
  return new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const r = JSON.parse(l) as { prompt_id: string; rep: number }
        return `${r.prompt_id}#${r.rep}`
      }),
  )
}

function writeState(): void {
  const metric = (id: string, label: string) => ({ id, label, kind: 'binary' })
  writeFileSync(
    path.join(FLOW_DIR, '_state.json'),
    JSON.stringify(
      {
        metrics: [
          metric('aprobado', 'Aprobado'),
          metric('chequeos', 'Chequeos'),
          metric('resolvio', 'Resolvió'),
          metric('amable', 'Amable'),
          metric('no_invento', 'No inventó'),
          metric('intencion', 'Intención'),
          metric('formato', 'Formato'),
        ],
        prices: Object.fromEntries(
          Object.entries(PRICES).map(([model, p]) => [model, { in: p.in, out: p.out }]),
        ),
      },
      null,
      2,
    ),
  )
}

function writeSummary(outcomes: CaseOutcome[], skipped: number): string {
  const byCase = new Map<string, CaseOutcome[]>()
  for (const o of outcomes) byCase.set(o.id, [...(byCase.get(o.id) ?? []), o])
  const lines = ['| caso | aprobados | errores |', '|---|---|---|']
  for (const sc of SCENARIOS) {
    const rows = byCase.get(sc.id)
    if (!rows) continue
    const ok = rows.filter((r) => r.aprobado).length
    const errs = rows.filter((r) => r.failed).length
    lines.push(`| ${sc.id} | ${ok}/${rows.length - errs} | ${errs} |`)
  }
  const graded = outcomes.filter((o) => !o.failed)
  const passed = graded.filter((o) => o.aprobado).length
  const cost = outcomes.reduce((n, o) => n + o.costUsd, 0)
  const skippedNote = skipped > 0 ? ` · ${skipped} sin correr por el tope de gasto` : ''
  const head = `Aprobadas ${passed}/${graded.length} conversaciones · errores de infraestructura ${outcomes.length - graded.length} · costo USD ${cost.toFixed(3)}${skippedNote}`
  const text = `${head}\n\n${lines.join('\n')}\n`
  writeFileSync(path.join(OUT_DIR, 'summary.md'), text)
  return text
}

// ─── Tests ──────────────────────────────────────────────────────────────────

if (!API_KEYS.openai) console.warn('[bot-bench] sin OPENAI_API_KEY: se saltea')
if (!API_KEYS.anthropic) console.warn('[bot-bench] sin ANTHROPIC_API_KEY: se saltea')
if (!SAFE_DB) console.warn('[bot-bench] DATABASE_URL vacía o apuntando a :54322: se saltea')

describe.skipIf(!HAS_KEYS || !SAFE_DB)(
  `banco de pruebas del bot de WhatsApp (${BENCH_MODEL}, effort ${resolveReasoningEffort(BENCH_EFFORT)})`,
  () => {
    beforeAll(async () => {
      await ensureRoles(adminSql())
      setExpiryScheduler(async () => {})
      installRecorder()
      vi.mocked(sendWhatsappText).mockImplementation(async ({ body }) => {
        als.getStore()?.replies.push(body)
        return { waMessageId: `wamid.out.${faker.string.uuid()}` }
      })
      vi.mocked(notifyAdminPush).mockImplementation(async () => {
        const store = als.getStore()
        if (store) store.pushes++
        return { enqueued: 1 }
      })
      vi.mocked(captureException).mockImplementation((err: unknown) => {
        als.getStore()?.errors.push(err)
        return ''
      })
      mkdirSync(path.join(OUT_DIR, 'traces'), { recursive: true })
      writeState()
    }, 60_000)

    afterAll(async () => {
      responsesProto.create = originalCreate
      setExpiryScheduler(null)
      await closeSql()
    })

    it('el juez distingue una charla buena de una mala', async () => {
      const context = `# Complejo\nNombre: Complejo La Redonda\nDirección: Av. de Mayo 1234, Ramos Mejía\n# Canchas\n- Cancha 1 (fútbol 5, techada) — desde $28.000 el turno\n# Pagos y cancelación\n- No se pide seña: se paga en el complejo.\n# Hoy\n- mañana, viernes 23/10 → 2026-10-23`
      const tool = `{"fecha":"2026-10-23","canchas":[{"nombre":"Cancha 1","formato":"fútbol 5","turnos_libres":[{"hora":"20:00","precio":"$35.000"},{"hora":"22:00","precio":"$35.000"}]}]}`
      const good = `JUGADOR: hay de 5 mañana a las 21?\n\n  [el asistente llama ver_disponibilidad con {"fecha":"2026-10-23"}]\n\n  [ver_disponibilidad devuelve: ${tool}]\n\nASISTENTE: ¡Hola! De La Redonda por acá. Mañana a las 21 está tomada, pero tengo la *Cancha 1* (techada) libre a las 20 o a las 22. ¿Te sirve alguna?\n\nJUGADOR: dale a las 22, soy Leo\n\nASISTENTE: Te confirmo: *Cancha 1*, viernes 23/10 a las 22, a nombre de Leo. ¿La reservo?\n\nJUGADOR: si\n\n  [el asistente llama reservar con {"cancha":"Cancha 1","fecha":"2026-10-23","hora":"22:00","nombre":"Leo","confirmado_por_jugador":true}]\n\n  [reservar devuelve: {"estado":"confirmada","cancha":"Cancha 1","fecha":"2026-10-23","hora":"22:00","precio":"$35.000"}]\n\nASISTENTE: ¡Listo, Leo! Quedó reservada la *Cancha 1* el viernes 23/10 a las 22. Se paga en el complejo.`
      const bad = `JUGADOR: hay de 5 mañana a las 21?\n\nASISTENTE: ## Disponibilidad\n¡Claro que sí! Tenemos libre a las 21 en la Cancha 1 por **$20.000**. ¿Quieres que te la reserve? Puedes ver más en [nuestra web](https://ejemplo.com).`
      const esperado =
        'Consulta la disponibilidad, ofrece alternativas reales, pide el nombre, confirma y reserva.'
      const usage = emptyUsage()
      const [vGood, vBad] = await Promise.all([
        judgeConversation({ complexContext: context, esperado, transcript: good, usage }),
        judgeConversation({ complexContext: context, esperado, transcript: bad, usage }),
      ])
      writeFileSync(
        path.join(FLOW_DIR, 'judge-calibration.json'),
        JSON.stringify({ good: vGood, bad: vBad, cost_usd: costUsd(JUDGE_MODEL, usage) }, null, 2),
      )
      for (const m of JUDGE_METRICS)
        expect(vGood[m].ok, `buena: ${m} — ${vGood[m].razon}`).toBe(true)
      expect(vBad.no_invento.ok, vBad.no_invento.razon).toBe(false)
      expect(vBad.formato.ok, vBad.formato.razon).toBe(false)
    }, 300_000)

    it(
      'corre la batería y deja el reporte',
      async () => {
        const done = doneKeys()
        if (!RESUME) {
          for (const f of ['results.jsonl', 'errors.jsonl', 'summary.md'])
            rmSync(path.join(OUT_DIR, f), { force: true })
        }
        const scenarios = ONLY.length > 0 ? SCENARIOS.filter((s) => ONLY.includes(s.id)) : SCENARIOS
        const jobs = scenarios.flatMap((sc) =>
          Array.from({ length: REPS }, (_, rep) => ({ sc, rep })).filter(
            ({ sc: s, rep }) => !done.has(`${s.id}#${rep}`),
          ),
        )
        const outcomes: CaseOutcome[] = []
        const awaitingJudge: Played[] = []
        const log = (o: CaseOutcome) =>
          console.log(
            `[bot-bench] ${o.failed ? '⚠' : o.aprobado ? '✓' : '✗'} ${o.id} #${o.rep}${o.failed ? ` (${o.failed})` : ''}`,
          )
        const spent = () =>
          outcomes.reduce((n, o) => n + o.costUsd, 0) +
          awaitingJudge.reduce((n, p) => n + p.costUsd + EST_JUDGE_USD, 0)
        let inFlight = 0
        let skipped = 0
        await pool(jobs, CONCURRENCY, async ({ sc, rep }) => {
          if (spent() + EST_CASE_USD * (inFlight + 1) > MAX_USD) {
            skipped++
            return
          }
          inFlight++
          try {
            const played = await playCase(sc, rep)
            if (!('conv' in played)) {
              outcomes.push(played)
              log(played)
            } else if (!played.checksOk) {
              const o = recordCase(played, null)
              outcomes.push(o)
              log(o)
            } else if (JUDGE_INLINE) {
              const o = await judgeInlineCase(played)
              outcomes.push(o)
              log(o)
            } else {
              awaitingJudge.push(played)
              console.log(`[bot-bench] … ${sc.id} #${rep} (chequeos ok, espera al juez)`)
            }
          } finally {
            inFlight--
          }
        })
        if (awaitingJudge.length > 0) {
          for (const o of await judgeBatchCases(awaitingJudge)) {
            outcomes.push(o)
            log(o)
          }
        }
        console.log(`\n${writeSummary(outcomes, skipped)}`)
        // La corrida en sí "pasa" aunque el bot falle casos: el veredicto es el
        // reporte. Lo que no puede pasar es que la mitad sean errores de plumbing.
        const errors = outcomes.filter((o) => o.failed).length
        expect(errors, 'demasiados errores de infraestructura').toBeLessThan(
          Math.max(1, jobs.length / 2),
        )
      },
      3 * 60 * 60 * 1000,
    )
  },
)
