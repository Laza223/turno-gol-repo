import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { faker } from '@faker-js/faker'
import Anthropic from '@anthropic-ai/sdk'
import { parse as parseEnv } from 'dotenv'
import { closeSql } from '@/shared/db/client'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import type { NormalizedWhatsappEvent } from '@/lib/kapso/events.schema'
import { sendWhatsappText } from '@/lib/kapso/client'
import { captureException } from '@/lib/sentry'
import { notifyAdminPush } from '@/modules/notifications/push.service'
import { BOT_MODEL } from '@/modules/whatsapp-bot/whatsapp-bot.agent'
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
  addUsage,
  emptyUsage,
  judgeBatch,
  judgeConversation,
  simulatePlayer,
  type JudgeInput,
  type JudgeVerdict,
  type Usage,
} from './sonnet'

/**
 * Banco de pruebas del bot de WhatsApp contra Claude DE VERDAD (Haiku 5.5).
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
 * `inline` para tener cada veredicto al toque y a precio completo). Salida en
 * `.claude/hillclimb/whatsapp-bot/`.
 *
 * Una conversación que no pasa los chequeos deterministas ya está reprobada:
 * no se le paga el juez.
 */

vi.hoisted(() => {
  process.env.MP_MOCK_MODE = '1'
  process.env.NEXT_PUBLIC_APP_URL ??= 'https://turnogol.app'
})
vi.mock('@/lib/kapso/client', () => ({ sendWhatsappText: vi.fn() }))
vi.mock('@/modules/notifications/push.service', () => ({ notifyAdminPush: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

// ─── Configuración ──────────────────────────────────────────────────────────

/** La key va exportada o en el `.env.local` de este directorio (se lee solo esa variable). */
function loadApiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const file = path.resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return undefined
  const key = parseEnv(readFileSync(file)).ANTHROPIC_API_KEY
  if (key) process.env.ANTHROPIC_API_KEY = key
  return key
}

const API_KEY = loadApiKey()
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
const CASE_TIMEOUT_MS = 5 * 60 * 1000
/**
 * Lo que se reserva del tope antes de lanzar un caso: bot, jugador y juez por
 * lote medidos (≈ USD 0,007), con margen.
 */
const EST_CASE_USD = 0.012
/** Lo que se cuenta por una conversación que espera al juez por lote. */
const EST_JUDGE_USD = 0.008

const FLOW_DIR = path.resolve(process.cwd(), '.claude/hillclimb/whatsapp-bot')
const OUT_DIR = path.join(FLOW_DIR, VARIANT)

/** USD por millón de tokens: entrada, salida, lectura y escritura de caché. */
const PRICES: Record<string, { in: number; out: number; read: number; write: number }> = {
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
  stopReason: string | null
  usage: Anthropic.Usage
  content: Anthropic.ContentBlock[]
  /** Copia del último mensaje del request: trae los tool_result de la vuelta anterior. */
  lastMessage: Anthropic.MessageParam | undefined
  system: string
  latencyMs: number
}

type ConvStore = { calls: BotCall[]; errors: unknown[]; replies: string[]; pushes: number }

const als = new AsyncLocalStorage<ConvStore>()

type CreateFn = (
  this: unknown,
  body: Anthropic.MessageCreateParamsNonStreaming,
  options?: unknown,
) => Promise<Anthropic.Message>

const messagesProto = Anthropic.Messages.prototype as unknown as { create: CreateFn }
const originalCreate = messagesProto.create

/**
 * Envuelve `messages.create` para guardar cada llamada DEL BOT de la
 * conversación en curso. El jugador simulado también corre en Haiku: al bot se
 * lo reconoce por su system prompt, no por el modelo.
 */
function installRecorder(): void {
  messagesProto.create = function (body, options) {
    const store = als.getStore()
    const isBot = Array.isArray(body.system) && body.system[0]?.text === SYSTEM_RULES
    if (!store || !isBot) return originalCreate.call(this, body, options)
    const lastMessage = body.messages.at(-1)
    const snapshot = lastMessage
      ? (JSON.parse(JSON.stringify(lastMessage)) as Anthropic.MessageParam)
      : undefined
    const system = Array.isArray(body.system)
      ? body.system.map((b) => b.text).join('\n\n')
      : (body.system ?? '')
    const started = Date.now()
    return originalCreate.call(this, body, options).then((res) => {
      store.calls.push({
        model: res.model,
        stopReason: res.stop_reason,
        usage: res.usage,
        content: res.content,
        lastMessage: snapshot,
        system,
        latencyMs: Date.now() - started,
      })
      return res
    })
  }
}

/** Empareja cada tool_use con su resultado (viene en el request de la vuelta siguiente). */
function toolLogs(calls: BotCall[]): ToolCallLog[] {
  const results = new Map<string, string>()
  for (const call of calls) {
    const content = call.lastMessage?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block.type !== 'tool_result') continue
      const text =
        typeof block.content === 'string'
          ? block.content
          : (block.content ?? []).map((c) => (c.type === 'text' ? c.text : '')).join('')
      results.set(block.tool_use_id, text)
    }
  }
  return calls.flatMap((call) =>
    call.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({
        name: b.name,
        input: b.input,
        result: results.get(b.id) ?? '(sin resultado)',
      })),
  )
}

// ─── Trazas ─────────────────────────────────────────────────────────────────

type TraceTurn = {
  role: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  name?: string
}

/**
 * Las herramientas del turno y, al final, lo que salió por WhatsApp: el texto
 * de todas las vueltas va junto en esa respuesta, así que el juez ve
 * exactamente lo que leyó el jugador.
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

    const firstSystem = store.calls[0]?.system ?? ''
    trace.unshift({ role: 'system', content: firstSystem })
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

function sumUsage(calls: BotCall[]): Usage {
  const u = emptyUsage()
  for (const c of calls) addUsage(u, c.usage)
  return u
}

function failureClass(err: unknown): string {
  if (err instanceof Anthropic.APIError) return 'api_error'
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
      model: BOT_MODEL,
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
    const served = conv.calls.find((c) => !c.model.startsWith(BOT_MODEL))
    if (served) throw new Error(`modelo servido ${served.model} distinto del pedido ${BOT_MODEL}`)
    const cost = costUsd(BOT_MODEL, botUsage) + costUsd(SIM_MODEL, conv.simUsage)
    // Un turno caído por la API o por una excepción de tool no es una respuesta
    // del modelo: va a errors.jsonl, no se califica.
    if (conv.errors.length > 0) {
      const err = conv.errors[0]
      writeTrace(sc.id, rep, conv.trace)
      const failure = err instanceof Anthropic.APIError ? 'api_error' : 'tool_exception'
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
    return recordError(sc.id, rep, failureClass(err), err, usage, costUsd(BOT_MODEL, usage))
  }
}

function judgeInput(p: Played): JudgeInput {
  return {
    complexContext: p.conv.calls[0]?.system.replace(SYSTEM_RULES, '').trim() ?? '',
    esperado: p.sc.esperado,
    transcript: transcriptForJudge(p.conv.trace),
  }
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
    verdict.amable.ok

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
  const truncated = conv.calls.some((c) => c.stopReason === 'max_tokens')
  const cost = p.costUsd + (judged?.costUsd ?? 0)
  const row = {
    prompt_id: sc.id,
    rep,
    prompt: sc.opening.map((m) => m.text ?? '[audio sin transcripción]').join(' / '),
    tags: sc.tags,
    model: conv.calls[0]?.model ?? BOT_MODEL,
    status: truncated ? 'truncated' : 'ok',
    stop_reason: last?.stopReason ?? null,
    grade,
    explanation,
    latency_s: p.latencyS,
    tool_calls: conv.state.turns.reduce((n, t) => n + t.tools.length, 0),
    usage: sumUsage(conv.calls),
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

if (!API_KEY) console.warn('[bot-bench] sin ANTHROPIC_API_KEY: se saltea')
if (!SAFE_DB) console.warn('[bot-bench] DATABASE_URL vacía o apuntando a :54322: se saltea')

describe.skipIf(!API_KEY || !SAFE_DB)('banco de pruebas del bot de WhatsApp (Haiku real)', () => {
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
    messagesProto.create = originalCreate
    setExpiryScheduler(null)
    await closeSql()
  })

  it('el juez distingue una charla buena de una mala', async () => {
    const context = `# Complejo\nNombre: Complejo La Redonda\nDirección: Av. de Mayo 1234, Ramos Mejía\n# Canchas\n- Cancha 1 (fútbol 5, techada) — desde $28.000 el turno\n# Pagos y cancelación\n- No se pide seña: se paga en el complejo.\n# Hoy\n- mañana, viernes 23/10 → 2026-10-23`
    const tool = `{"fecha":"2026-10-23","canchas":[{"id":"c1","nombre":"Cancha 1","formato":"fútbol 5","turnos_libres":[{"hora":"20:00","precio":"$35.000"},{"hora":"22:00","precio":"$35.000"}]}]}`
    const good = `JUGADOR: hay de 5 mañana a las 21?\n\n  [el asistente llama ver_disponibilidad con {"fecha":"2026-10-23"}]\n\n  [ver_disponibilidad devuelve: ${tool}]\n\nASISTENTE: ¡Hola! Soy el asistente virtual de La Redonda. Mañana a las 21 no hay, pero tengo la *Cancha 1* (techada) a las 20 o a las 22, $35.000. ¿Te sirve alguna?\n\nJUGADOR: dale a las 22, soy Leo\n\nASISTENTE: Te confirmo: *Cancha 1*, viernes 23/10 a las 22, $35.000, a nombre de Leo. ¿La reservo?\n\nJUGADOR: si\n\n  [el asistente llama reservar con {"cancha_id":"c1","fecha":"2026-10-23","hora":"22:00","nombre":"Leo"}]\n\n  [reservar devuelve: {"estado":"confirmada","fecha":"2026-10-23","hora":"22:00","precio":"$35.000","pago":"en el complejo"}]\n\nASISTENTE: ¡Listo, Leo! Quedó reservada la Cancha 1 el viernes 23/10 a las 22. Se paga en el complejo. ¡Nos vemos!`
    const bad = `JUGADOR: hay de 5 mañana a las 21?\n\nASISTENTE: ## Disponibilidad\n¡Claro que sí! Tenemos libre a las 21 en la Cancha 1 por **$20.000**. ¿Quieres que te la reserve? Puedes ver más en [nuestra web](https://ejemplo.com).`
    const esperado =
      'Consulta la disponibilidad, ofrece alternativas reales con precio, pide el nombre, confirma y reserva.'
    const usage = emptyUsage()
    const [vGood, vBad] = await Promise.all([
      judgeConversation({ complexContext: context, esperado, transcript: good, usage }),
      judgeConversation({ complexContext: context, esperado, transcript: bad, usage }),
    ])
    writeFileSync(
      path.join(FLOW_DIR, 'judge-calibration.json'),
      JSON.stringify({ good: vGood, bad: vBad, cost_usd: costUsd(JUDGE_MODEL, usage) }, null, 2),
    )
    for (const m of JUDGE_METRICS) expect(vGood[m].ok, `buena: ${m} — ${vGood[m].razon}`).toBe(true)
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
})
