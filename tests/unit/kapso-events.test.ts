import { describe, expect, it } from 'vitest'
import { normalizeKapsoPayload } from '@/lib/kapso/events.schema'

/**
 * Payload v2 de Kapso (`kind: "kapso"`), reducido a lo que lee el schema de
 * `src/lib/kapso/events.schema.ts`: `phone_number_id` + `message` (con `kapso.direction`
 * y `kapso.origin`) + `conversation` opcional.
 */
const PHONE_NUMBER_ID = '1098765432100'
const PLAYER_PHONE = '5491155551234'

type Overrides = {
  message?: Record<string, unknown>
  kapso?: Record<string, unknown>
  conversation?: Record<string, unknown> | null
}

function event(
  direction: string,
  origin: string,
  { message = {}, kapso = {}, conversation }: Overrides = {},
): Record<string, unknown> {
  return {
    phone_number_id: PHONE_NUMBER_ID,
    message: {
      id: 'wamid.HBgM',
      type: 'text',
      kapso: { direction, origin, ...kapso },
      ...message,
    },
    ...(conversation === null
      ? {}
      : {
          conversation: {
            contact_name: 'Juan Pérez',
            phone_number: '+54 9 11 5555-1234',
            ...conversation,
          },
        }),
  }
}

const inboundText = (body: string, extra: Overrides = {}) =>
  event('inbound', 'cloud_api', {
    ...extra,
    message: { from: PLAYER_PHONE, text: { body }, ...extra.message },
  })

describe('normalizeKapsoPayload — mensajes entrantes (jugador)', () => {
  it('texto: devuelve inbound con teléfono en dígitos, nombre de contacto y cuerpo', () => {
    const [ev] = normalizeKapsoPayload(inboundText('Hola, ¿hay cancha mañana?'))
    expect(ev).toEqual({
      kind: 'inbound',
      phoneNumberId: PHONE_NUMBER_ID,
      waMessageId: 'wamid.HBgM',
      from: PLAYER_PHONE,
      contactName: 'Juan Pérez',
      messageKind: 'text',
      text: 'Hola, ¿hay cancha mañana?',
    })
  })

  it('devuelve exactamente un evento para un sobre suelto', () => {
    expect(normalizeKapsoPayload(inboundText('hola'))).toHaveLength(1)
  })

  it('limpia el teléfono: solo dígitos (sacá "+", espacios y guiones)', () => {
    const [ev] = normalizeKapsoPayload(
      inboundText('hola', { message: { from: '+54 9 11 5555-1234' } }),
    )
    expect(ev).toMatchObject({ kind: 'inbound', from: '5491155551234' })
  })

  it('sin `message.from`, cae al teléfono de la conversación', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', {
        message: { text: { body: 'hola' } },
        conversation: { phone_number: '+54 9 11 5555-1234' },
      }),
    )
    expect(ev).toMatchObject({ kind: 'inbound', from: '5491155551234' })
  })

  it('sin teléfono en ningún lado: se ignora (no_from) en vez de crear un chat sin número', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', {
        message: { text: { body: 'hola' } },
        conversation: null,
      }),
    )
    expect(ev).toEqual({ kind: 'ignored', reason: 'no_from' })
  })

  // Fuera del CHECK de `whatsapp_chats.wa_phone` (8 a 15 dígitos) el INSERT
  // tiraba un 500 y el reintento de Kapso perdía el resto del lote.
  it.each([
    ['muy corto', '1234567'],
    ['muy largo', '1234567890123456'],
  ])('teléfono %s: se ignora (no_from)', (_label, from) => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', { message: { from, text: { body: 'hola' } } }),
    )
    expect(ev).toEqual({ kind: 'ignored', reason: 'no_from' })
  })

  it('una reacción (👍) no despierta al bot', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', { message: { type: 'reaction', from: PLAYER_PHONE } }),
    )
    expect(ev).toEqual({ kind: 'ignored', reason: 'reaction' })
  })

  // Un reenvío tardío o un mensaje sincronizado sin la marca `history_sync`
  // no puede despertar al bot en una charla de hace días.
  describe('antigüedad', () => {
    const NOW = Date.UTC(2026, 9, 21, 22, 0, 0)
    const secondsAgo = (s: number) => Math.floor(NOW / 1000) - s

    it('un entrante de hace más de 15 min se ignora (stale)', () => {
      const [ev] = normalizeKapsoPayload(
        inboundText('hola', { message: { timestamp: String(secondsAgo(16 * 60)) } }),
        NOW,
      )
      expect(ev).toEqual({ kind: 'ignored', reason: 'stale' })
    })

    it('un entrante reciente se contesta, venga el timestamp como string o como número', () => {
      const [comoString, comoNumero] = normalizeKapsoPayload(
        {
          batch: true,
          data: [
            inboundText('hola', { message: { id: 'a', timestamp: String(secondsAgo(60)) } }),
            inboundText('hola', { message: { id: 'b', timestamp: secondsAgo(60) } }),
          ],
        },
        NOW,
      )
      expect(comoString).toMatchObject({ kind: 'inbound' })
      expect(comoNumero).toMatchObject({ kind: 'inbound' })
    })

    it('sin timestamp o con uno ilegible: se contesta (no se descarta por las dudas)', () => {
      const [sinTs, ilegible] = normalizeKapsoPayload(
        {
          batch: true,
          data: [
            inboundText('hola', { message: { id: 'a' } }),
            inboundText('hola', { message: { id: 'b', timestamp: 'ayer' } }),
          ],
        },
        NOW,
      )
      expect(sinTs).toMatchObject({ kind: 'inbound' })
      expect(ilegible).toMatchObject({ kind: 'inbound' })
    })
  })

  it('sin conversación: el nombre de contacto queda en null', () => {
    const [ev] = normalizeKapsoPayload(inboundText('hola', { conversation: null }))
    expect(ev).toMatchObject({ kind: 'inbound', contactName: null })
  })

  it('`contact_name: null` también queda en null', () => {
    const [ev] = normalizeKapsoPayload(
      inboundText('hola', { conversation: { contact_name: null } }),
    )
    expect(ev).toMatchObject({ kind: 'inbound', contactName: null })
  })

  it('audio con transcripción: el texto es la transcripción', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', {
        message: {
          type: 'audio',
          from: PLAYER_PHONE,
          audio: { id: 'media-1' },
        },
        kapso: { transcript: { text: 'quiero reservar para el jueves a las nueve' } },
      }),
    )
    expect(ev).toMatchObject({
      kind: 'inbound',
      messageKind: 'audio',
      text: 'quiero reservar para el jueves a las nueve',
    })
  })

  it('audio SIN transcripción (ausente): texto null', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', { message: { type: 'audio', from: PLAYER_PHONE } }),
    )
    expect(ev).toMatchObject({ kind: 'inbound', messageKind: 'audio', text: null })
  })

  it('texto en blanco: null (la API de Claude rechaza un bloque de solo espacios)', () => {
    const [ev] = normalizeKapsoPayload(inboundText('  \n '))
    expect(ev).toMatchObject({ kind: 'inbound', text: null })
  })

  it('texto con espacios alrededor: se recorta', () => {
    const [ev] = normalizeKapsoPayload(inboundText('  hola  '))
    expect(ev).toMatchObject({ kind: 'inbound', text: 'hola' })
  })

  it('audio con `transcript: null` explícito: texto null (el schema lo admite)', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', {
        message: { type: 'audio', from: PLAYER_PHONE },
        kapso: { transcript: null },
      }),
    )
    expect(ev).toMatchObject({ kind: 'inbound', messageKind: 'audio', text: null })
  })

  it('nota de voz (`type: voice`) se trata como audio', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', {
        message: { type: 'voice', from: PLAYER_PHONE },
        kapso: { transcript: { text: 'hola' } },
      }),
    )
    expect(ev).toMatchObject({ kind: 'inbound', messageKind: 'audio', text: 'hola' })
  })

  it('imagen: messageKind image y sin texto', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', {
        message: { type: 'image', from: PLAYER_PHONE, image: { id: 'media-2' } },
      }),
    )
    expect(ev).toMatchObject({ kind: 'inbound', messageKind: 'image', text: null })
  })

  it('imagen con texto: el caption llega como texto', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', {
        message: {
          type: 'image',
          from: PLAYER_PHONE,
          image: { id: 'media-3', caption: 'este es el comprobante' },
        },
      }),
    )
    expect(ev).toMatchObject({
      kind: 'inbound',
      messageKind: 'image',
      text: 'este es el comprobante',
    })
  })

  it('tipos que el bot no entiende (sticker, location…) → messageKind other', () => {
    const [sticker, location] = normalizeKapsoPayload({
      batch: true,
      data: [
        event('inbound', 'cloud_api', {
          message: { id: 'a', type: 'sticker', from: PLAYER_PHONE },
        }),
        event('inbound', 'cloud_api', {
          message: { id: 'b', type: 'location', from: PLAYER_PHONE },
        }),
      ],
    })
    expect(sticker).toMatchObject({ kind: 'inbound', messageKind: 'other', text: null })
    expect(location).toMatchObject({ kind: 'inbound', messageKind: 'other', text: null })
  })

  it('interactive (respuesta a botón) conserva su kind', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', { message: { type: 'interactive', from: PLAYER_PHONE } }),
    )
    expect(ev).toMatchObject({ kind: 'inbound', messageKind: 'interactive' })
  })

  it('el texto del mensaje gana sobre una transcripción presente', () => {
    const [ev] = normalizeKapsoPayload(
      inboundText('texto', { kapso: { transcript: { text: 'transcripción' } } }),
    )
    expect(ev).toMatchObject({ text: 'texto' })
  })

  it('un campo desconocido de Kapso no tira abajo el parseo (schema permisivo)', () => {
    const payload = inboundText('hola')
    payload['campo_nuevo'] = { cualquier: 'cosa' }
    ;(payload['message'] as Record<string, unknown>)['otro_campo'] = 123
    expect(normalizeKapsoPayload(payload)[0]).toMatchObject({ kind: 'inbound', text: 'hola' })
  })
})

describe('normalizeKapsoPayload — mensajes salientes', () => {
  it('el dueño contestando desde su app (outbound + business_app) → owner', () => {
    const [ev] = normalizeKapsoPayload(
      event('outbound', 'business_app', {
        message: { id: 'wamid.OWNER', to: PLAYER_PHONE, text: { body: 'Dale, te espero' } },
      }),
    )
    expect(ev).toEqual({
      kind: 'owner',
      phoneNumberId: PHONE_NUMBER_ID,
      waMessageId: 'wamid.OWNER',
      to: PLAYER_PHONE,
      text: 'Dale, te espero',
    })
  })

  it('owner: el destinatario sale de `message.to`, o de la conversación si falta', () => {
    const [conTo, sinTo] = normalizeKapsoPayload({
      batch: true,
      data: [
        event('outbound', 'business_app', { message: { id: 'a', to: '+54 9 11 5555-1234' } }),
        event('outbound', 'business_app', {
          message: { id: 'b' },
          conversation: { phone_number: '5491166667777' },
        }),
      ],
    })
    expect(conTo).toMatchObject({ kind: 'owner', to: '5491155551234' })
    expect(sinTo).toMatchObject({ kind: 'owner', to: '5491166667777' })
  })

  it('owner sin destinatario en ningún lado: se ignora (no_to)', () => {
    const [ev] = normalizeKapsoPayload(
      event('outbound', 'business_app', { message: { id: 'a' }, conversation: null }),
    )
    expect(ev).toEqual({ kind: 'ignored', reason: 'no_to' })
  })

  it('una reacción del dueño desde su app no calla al bot', () => {
    const [ev] = normalizeKapsoPayload(
      event('outbound', 'business_app', { message: { type: 'reaction', to: PLAYER_PHONE } }),
    )
    expect(ev).toEqual({ kind: 'ignored', reason: 'owner_reaction' })
  })

  it('owner con un audio o una imagen: texto null (el dueño no puso texto)', () => {
    const [ev] = normalizeKapsoPayload(
      event('outbound', 'business_app', { message: { type: 'image', to: PLAYER_PHONE } }),
    )
    expect(ev).toMatchObject({ kind: 'owner', text: null })
  })

  // CRÍTICO: si nuestro propio envío se normalizara como `owner`, el bot se
  // pausaría solo (OWNER_REPLY_PAUSE_MS) después de cada respuesta que da.
  it('NUESTRO envío (outbound + cloud_api) → ignored, nunca owner', () => {
    const [ev] = normalizeKapsoPayload(
      event('outbound', 'cloud_api', {
        message: { id: 'wamid.BOT', to: PLAYER_PHONE, text: { body: 'Hola, soy el asistente' } },
      }),
    )
    expect(ev).toEqual({ kind: 'ignored', reason: 'outbound:cloud_api' })
  })

  it('outbound sin origen → ignored (no se asume que es del dueño)', () => {
    const payload = event('outbound', 'cloud_api', { message: { to: PLAYER_PHONE } })
    delete ((payload['message'] as Record<string, unknown>)['kapso'] as Record<string, unknown>)[
      'origin'
    ]
    const [ev] = normalizeKapsoPayload(payload)
    expect(ev).toEqual({ kind: 'ignored', reason: 'outbound:sin_origen' })
  })

  it('historial sincronizado por Meta (outbound + history_sync) → ignored', () => {
    const [ev] = normalizeKapsoPayload(
      event('outbound', 'history_sync', { message: { to: PLAYER_PHONE } }),
    )
    expect(ev).toEqual({ kind: 'ignored', reason: 'history_sync' })
  })

  // El historial que sincroniza Meta al conectar trae mensajes viejos del
  // jugador: si llegaran como `inbound`, el bot contestaría charlas de hace
  // semanas. Se ignora por el origen, venga con la dirección que venga.
  it('historial sincronizado ENTRANTE (inbound + history_sync) → ignored', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'history_sync', {
        message: { from: PLAYER_PHONE, text: { body: 'mensaje viejo' } },
      }),
    )
    expect(ev?.kind).toBe('ignored')
  })

  it('dirección desconocida o ausente → ignored', () => {
    const sinDireccion = {
      phone_number_id: PHONE_NUMBER_ID,
      message: { id: 'x', type: 'text', from: PLAYER_PHONE },
    }
    expect(normalizeKapsoPayload(sinDireccion)[0]).toEqual({
      kind: 'ignored',
      reason: 'sin_direccion:sin_origen',
    })
    expect(normalizeKapsoPayload(event('sideways', 'cloud_api'))[0]).toMatchObject({
      kind: 'ignored',
    })
  })
})

describe('normalizeKapsoPayload — sobre de lote', () => {
  it('`{ batch: true, data: [...] }` devuelve un evento por elemento, en orden', () => {
    const events = normalizeKapsoPayload({
      batch: true,
      data: [
        inboundText('uno', { message: { id: 'm1' } }),
        event('outbound', 'business_app', { message: { id: 'm2', to: PLAYER_PHONE } }),
        event('outbound', 'cloud_api', { message: { id: 'm3', to: PLAYER_PHONE } }),
      ],
    })
    expect(events.map((e) => e.kind)).toEqual(['inbound', 'owner', 'ignored'])
    expect(events[0]).toMatchObject({ waMessageId: 'm1' })
    expect(events[1]).toMatchObject({ waMessageId: 'm2' })
  })

  it('un elemento roto del lote no tumba a los demás', () => {
    const events = normalizeKapsoPayload({
      batch: true,
      data: [{ basura: true }, inboundText('hola', { message: { id: 'ok' } }), 'string', null],
    })
    expect(events).toHaveLength(4)
    expect(events[0]).toEqual({ kind: 'ignored', reason: 'shape' })
    expect(events[1]).toMatchObject({ kind: 'inbound', waMessageId: 'ok' })
    expect(events[2]).toEqual({ kind: 'ignored', reason: 'shape' })
    expect(events[3]).toEqual({ kind: 'ignored', reason: 'shape' })
  })

  it('lote vacío → ningún evento', () => {
    expect(normalizeKapsoPayload({ batch: true, data: [] })).toEqual([])
  })

  it('`batch: false` no es un sobre de lote: se parsea como evento suelto', () => {
    expect(normalizeKapsoPayload({ batch: false, data: [inboundText('hola')] })).toEqual([
      { kind: 'ignored', reason: 'shape' },
    ])
  })
})

describe('normalizeKapsoPayload — basura', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['número', 42],
    ['string', 'hola'],
    ['array', []],
    ['objeto vacío', {}],
    ['sin message', { phone_number_id: PHONE_NUMBER_ID }],
    ['sin phone_number_id', { message: { id: 'x', type: 'text' } }],
    ['phone_number_id vacío', { phone_number_id: '', message: { id: 'x', type: 'text' } }],
    ['message sin id', { phone_number_id: PHONE_NUMBER_ID, message: { type: 'text' } }],
    ['message.id vacío', { phone_number_id: PHONE_NUMBER_ID, message: { id: '', type: 'text' } }],
    ['message.type no string', { phone_number_id: PHONE_NUMBER_ID, message: { id: 'x', type: 5 } }],
    ['`data` del lote no es array', { batch: true, data: 'no' }],
  ])('%s → un solo ignored (shape), sin tirar', (_name, body) => {
    expect(() => normalizeKapsoPayload(body)).not.toThrow()
    expect(normalizeKapsoPayload(body)).toEqual([{ kind: 'ignored', reason: 'shape' }])
  })

  it('`text.body` que no es string invalida el evento entero (sin tirar)', () => {
    const [ev] = normalizeKapsoPayload(
      event('inbound', 'cloud_api', { message: { from: PLAYER_PHONE, text: { body: 123 } } }),
    )
    expect(ev).toEqual({ kind: 'ignored', reason: 'shape' })
  })
})
