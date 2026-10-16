import { describe, expect, it } from 'vitest'
import { PendingReplies } from '@/shared/db/stalled-query-guard'

// El corte solo puede armarse con una respuesta PENDIENTE. Si este contador se
// equivoca para el lado de "ocupada", una conexión ociosa queda con el timer
// armado y se corta al descongelarse la instancia (el modo de falla del #426);
// si se equivoca para el otro lado, una query colgada no se corta nunca.

function msg(type: string, payload = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(5)
  header.write(type, 0, 'latin1')
  header.writeInt32BE(4 + payload.length, 1)
  return Buffer.concat([header, payload])
}

function untyped(code: number, payload = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8)
  header.writeInt32BE(8 + payload.length, 0)
  header.writeInt32BE(code, 4)
  return Buffer.concat([header, payload])
}

const STARTUP = untyped(196608, Buffer.from('user\0postgres\0\0'))
const CANCEL = untyped(80877102, Buffer.alloc(8))
const READY = msg('Z', Buffer.from('I'))

function connected(): PendingReplies {
  const r = new PendingReplies()
  r.sent(STARTUP)
  r.received(Buffer.concat([msg('R', Buffer.alloc(4)), msg('S', Buffer.from('a\0b\0')), READY]))
  return r
}

describe('PendingReplies', () => {
  it('el arranque espera su ReadyForQuery', () => {
    const r = new PendingReplies()
    expect(r.busy).toBe(false)
    r.sent(STARTUP)
    expect(r.busy).toBe(true)
    r.received(msg('R', Buffer.alloc(4)))
    expect(r.busy).toBe(true)
    r.received(READY)
    expect(r.busy).toBe(false)
  })

  it('query extendida: Parse/Bind/Execute/Sync queda ocupada hasta el Z', () => {
    const r = connected()
    r.sent(Buffer.concat([msg('P'), msg('D'), msg('B'), msg('E'), msg('S')]))
    expect(r.busy).toBe(true)
    r.received(Buffer.concat([msg('1'), msg('2'), msg('T'), msg('D'), msg('C')]))
    expect(r.busy).toBe(true)
    r.received(READY)
    expect(r.busy).toBe(false)
  })

  it('Parse/Describe/Flush sin Sync (queries con parámetros) también espera respuesta', () => {
    const r = connected()
    r.sent(Buffer.concat([msg('P'), msg('D'), msg('H')]))
    expect(r.busy).toBe(true)
    r.received(Buffer.concat([msg('1'), msg('t'), msg('T')]))
    expect(r.busy).toBe(true)
    r.sent(Buffer.concat([msg('B'), msg('E'), msg('S')]))
    r.received(Buffer.concat([msg('2'), msg('C'), READY]))
    expect(r.busy).toBe(false)
  })

  it('pipeline: dos Sync necesitan dos ReadyForQuery', () => {
    const r = connected()
    r.sent(
      Buffer.concat([msg('Q', Buffer.from('select 1\0')), msg('Q', Buffer.from('select 2\0'))]),
    )
    r.received(Buffer.concat([msg('C'), READY]))
    expect(r.busy).toBe(true)
    r.received(Buffer.concat([msg('C'), READY]))
    expect(r.busy).toBe(false)
  })

  it('mensajes partidos en cualquier byte, incluso el header', () => {
    const r = connected()
    r.sent(msg('Q', Buffer.from('select 1\0')))
    const reply = Buffer.concat([msg('T', Buffer.alloc(30)), msg('D', Buffer.alloc(50)), READY])
    for (let i = 0; i < reply.length - 1; i++) {
      r.received(reply.subarray(i, i + 1))
      expect(r.busy).toBe(true)
    }
    r.received(reply.subarray(reply.length - 1))
    expect(r.busy).toBe(false)
  })

  it('mensajes del servidor sin pedido (Notice, ParameterStatus) no arman nada', () => {
    const r = connected()
    r.received(Buffer.concat([msg('N', Buffer.alloc(10)), msg('S', Buffer.from('x\0y\0'))]))
    expect(r.busy).toBe(false)
  })

  it('el Terminate del cierre no arma el corte', () => {
    const r = connected()
    r.sent(msg('X'))
    expect(r.busy).toBe(false)
  })

  it('un CancelRequest no espera respuesta', () => {
    const r = new PendingReplies()
    r.sent(CANCEL)
    expect(r.busy).toBe(false)
  })
})
