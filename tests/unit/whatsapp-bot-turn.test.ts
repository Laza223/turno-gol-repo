import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  withTenantContext: vi.fn(),
  isFeatureEnabled: vi.fn(),
  isBotTenantOpen: vi.fn(),
  getPublicTenant: vi.fn(),
  getPublicCourtCards: vi.fn(),
  runAgent: vi.fn(),
  sendWhatsappText: vi.fn(),
  buildBotTools: vi.fn(),
  pauseChatForHuman: vi.fn(),
  captureException: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/shared/db/client', () => ({
  getDb: mocks.getDb,
  withTenantContext: mocks.withTenantContext,
}))
vi.mock('@/shared/feature-flags', () => ({ isFeatureEnabled: mocks.isFeatureEnabled }))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.connection', () => ({
  BOT_FEATURE_FLAG: 'whatsapp_bot',
  isBotTenantOpen: mocks.isBotTenantOpen,
}))
vi.mock('@/modules/tenants/public.service', () => ({
  getPublicTenant: mocks.getPublicTenant,
  getPublicCourtCards: mocks.getPublicCourtCards,
}))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.agent', () => ({ runAgent: mocks.runAgent }))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.tools', () => ({
  buildBotTools: mocks.buildBotTools,
  pauseChatForHuman: mocks.pauseChatForHuman,
}))
vi.mock('@/lib/kapso/client', () => ({
  sendWhatsappText: mocks.sendWhatsappText,
  sendWhatsappTemplate: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({ captureException: mocks.captureException }))
vi.mock('@/shared/lib/logger', () => ({ logger: mocks.logger }))

import { processWhatsappTurn } from '@/modules/whatsapp-bot/whatsapp-bot.turn'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const CHAT_ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-11-25T15:00:00Z')

const tenant = {
  id: TENANT_ID,
  slug: 'el-complejo',
  name: 'Complejo Test',
  description: null,
  logoUrl: null,
  coverUrl: null,
  address: 'Av. Siempreviva 742',
  city: 'Rosario',
  province: 'Santa Fe',
  phone: '+5493415550000',
  whatsapp: null,
  openingHours: {
    mon: { open: '08:00', close: '23:00', closed: false },
    tue: { open: '08:00', close: '23:00', closed: false },
    wed: { open: '08:00', close: '23:00', closed: false },
    thu: { open: '08:00', close: '23:00', closed: false },
    fri: { open: '08:00', close: '23:00', closed: false },
    sat: { open: '08:00', close: '23:00', closed: false },
    sun: { open: '08:00', close: '23:00', closed: false },
  },
  closedDates: [],
  closesNextDay: false,
  status: 'active',
  canceledPeriodEnd: null,
  timezone: 'America/Argentina/Buenos_Aires',
  allowOnlineBooking: true,
  requiresDeposit: false,
  depositPercentage: 0,
  hidePrices: false,
  acceptsCash: true,
  acceptsTransfer: false,
  cancellationHoursBefore: 24,
  bookingAdvanceDays: 3,
  bookingMinAdvanceHours: 0,
  amenities: {},
  latitude: null,
  longitude: null,
}

type OwnerTakeoverState = {
  chat?: { pausedUntil: Date | null; pauseReason: string | null }
  recentOwnerMsg?: { id: string } | null
}

function setupDbMocks(takeover: OwnerTakeoverState = {}) {
  const markProcessedWhere = vi.fn().mockResolvedValue(undefined)
  const insertValues = vi.fn().mockResolvedValue(undefined)
  let withTenantCalls = 0

  // Builder encadenable que responde según qué tabla/orden consulta `processWhatsappTurn`.
  let stateQueryIdx = 0
  const stateResponses: unknown[] = [
    [{ phoneNumberId: 'pn-1', enabled: true, status: 'connected' }], // whatsappConnections
    [{ id: CHAT_ID, waPhone: '5493415551234', displayName: 'Lucas', pausedUntil: null }], // whatsappChats
    [{ id: 'msg-1' }], // pending
    [
      {
        id: 'msg-1',
        waMessageId: 'wamid-1',
        direction: 'inbound',
        kind: 'text',
        body: 'hola, hay turno?',
        toolTrace: null,
        createdAt: NOW,
      },
    ], // history
    [{ n: 0 }], // repliesLastHour
    [], // chatBookings
    [], // phoneBookings
    [], // courtPricing
  ]

  const makeChain = (value: unknown) => {
    const p = Promise.resolve(value)
    const chain: Record<string, unknown> = {
      then: p.then.bind(p),
      catch: p.catch.bind(p),
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
    }
    return chain
  }

  mocks.withTenantContext.mockImplementation(
    async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
      withTenantCalls++
      if (withTenantCalls === 1) {
        // 1ra tx: lectura de estado inicial
        return fn({
          select: () => makeChain(stateResponses[stateQueryIdx++] ?? []),
        })
      }
      // Llamadas siguientes: ownerTookOver (selects) o markProcessed (update) o recordOutbound (insert)
      let takeoverIdx = 0
      return fn({
        select: () => {
          const idx = takeoverIdx++
          if (idx === 0) return makeChain(takeover.chat ? [takeover.chat] : [])
          return makeChain(takeover.recentOwnerMsg ? [takeover.recentOwnerMsg] : [])
        },
        update: () => ({ set: () => ({ where: markProcessedWhere }) }),
        insert: () => ({ values: insertValues }),
      })
    },
  )

  mocks.getDb.mockImplementation(() => ({
    select: () => makeChain([{ slug: 'el-complejo' }]),
  }))

  return { markProcessedWhere, insertValues }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.isFeatureEnabled.mockResolvedValue(true)
  mocks.isBotTenantOpen.mockResolvedValue(true)
  mocks.getPublicTenant.mockResolvedValue(tenant)
  mocks.getPublicCourtCards.mockResolvedValue([])
  mocks.buildBotTools.mockReturnValue([])
  mocks.sendWhatsappText.mockResolvedValue({ waMessageId: 'wamid-out' })
})

describe('processWhatsappTurn — unitarios (silent, handoff y parche ownerTookOver)', () => {
  it('cuando runAgent devuelve outcome silent (no_responder): retorna silent y no llama a Kapso ni guarda outbound', async () => {
    const { insertValues } = setupDbMocks()
    mocks.runAgent.mockResolvedValue({
      outcome: 'silent',
      text: '',
      usage: { inputTokens: 10, cachedTokens: 0, outputTokens: 5 },
      cacheWriteTokens: 0,
      toolsCalled: ['no_responder'],
      trace: null,
    })

    const outcome = await processWhatsappTurn({ tenantId: TENANT_ID, chatId: CHAT_ID }, NOW)

    expect(outcome).toBe('silent')
    expect(mocks.sendWhatsappText).not.toHaveBeenCalled()
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('cuando runAgent devuelve outcome handoff (pasar_a_humano): envía mensaje_al_jugador y retorna handoff', async () => {
    setupDbMocks()
    mocks.runAgent.mockResolvedValue({
      outcome: 'handoff',
      text: 'Ahí le aviso a los chicos del complejo.',
      usage: { inputTokens: 10, cachedTokens: 0, outputTokens: 5 },
      cacheWriteTokens: 0,
      toolsCalled: ['pasar_a_humano'],
      trace: null,
    })

    const outcome = await processWhatsappTurn({ tenantId: TENANT_ID, chatId: CHAT_ID }, NOW)

    expect(outcome).toBe('handoff')
    expect(mocks.sendWhatsappText).toHaveBeenCalledWith({
      phoneNumberId: 'pn-1',
      to: '5493415551234',
      body: 'Ahí le aviso a los chicos del complejo.',
    })
  })

  it('parche ownerTookOver: detecta pauseReason=owner_replied con pausedUntil vigente y aborta envío', async () => {
    setupDbMocks({
      chat: {
        pausedUntil: new Date(Date.now() + 60_000),
        pauseReason: 'owner_replied',
      },
      recentOwnerMsg: null,
    })
    mocks.runAgent.mockResolvedValue({
      outcome: 'replied',
      text: 'Hay cancha a las 21',
      usage: { inputTokens: 10, cachedTokens: 0, outputTokens: 5 },
      cacheWriteTokens: 0,
      toolsCalled: [],
      trace: null,
    })

    const outcome = await processWhatsappTurn({ tenantId: TENANT_ID, chatId: CHAT_ID }, NOW)

    expect(outcome).toBe('paused')
    expect(mocks.sendWhatsappText).not.toHaveBeenCalled()
  })

  it('parche ownerTookOver: detecta mensaje direction=owner nuevo desde turnStartedAt aunque pauseReason no sea owner_replied', async () => {
    setupDbMocks({
      chat: {
        pausedUntil: new Date(Date.now() + 60_000),
        pauseReason: 'handoff_other',
      },
      recentOwnerMsg: { id: 'owner-msg-1' },
    })
    mocks.runAgent.mockResolvedValue({
      outcome: 'replied',
      text: 'Hay cancha a las 21',
      usage: { inputTokens: 10, cachedTokens: 0, outputTokens: 5 },
      cacheWriteTokens: 0,
      toolsCalled: ['reservar'],
      trace: null,
    })

    const outcome = await processWhatsappTurn({ tenantId: TENANT_ID, chatId: CHAT_ID }, NOW)

    expect(outcome).toBe('paused')
    expect(mocks.sendWhatsappText).not.toHaveBeenCalled()
  })
})
