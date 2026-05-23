import { describe, expect, it, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGINAL_E2E = process.env.NEXT_PUBLIC_E2E
const ORIGINAL_NODE = process.env.NODE_ENV

afterEach(() => {
  process.env.NEXT_PUBLIC_E2E = ORIGINAL_E2E
  ;(process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE
})

describe('/api/__e2e__/create-booking guards', () => {
  it('returns 404 when NEXT_PUBLIC_E2E is not "1"', async () => {
    process.env.NEXT_PUBLIC_E2E = ''
    ;(process.env as Record<string, string>).NODE_ENV = 'development'
    const { POST } = await import('@/app/api/__e2e__/create-booking/route')
    const req = new NextRequest('http://localhost/api/__e2e__/create-booking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 404 when NODE_ENV is "production" even with E2E=1', async () => {
    process.env.NEXT_PUBLIC_E2E = '1'
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    const { POST } = await import('@/app/api/__e2e__/create-booking/route')
    const req = new NextRequest('http://localhost/api/__e2e__/create-booking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })
})
