import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/public/availability/route'
import { NextRequest } from 'next/server'

function reqUrl(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/public/availability?${qs}`)
}

describe('public availability validation', () => {
  it('rejects missing slug', async () => {
    const res = await GET(reqUrl('date=2026-05-22'))
    expect(res.status).toBe(400)
  })
  it('rejects invalid slug (uppercase / underscores)', async () => {
    const res = await GET(reqUrl('slug=Bad_Slug&date=2026-05-22'))
    expect(res.status).toBe(400)
  })
  it('rejects payload-bomb slug', async () => {
    const big = 'a'.repeat(10_000)
    const res = await GET(reqUrl(`slug=${big}&date=2026-05-22`))
    expect(res.status).toBe(400)
  })
  it('rejects missing date', async () => {
    const res = await GET(reqUrl('slug=demo'))
    expect(res.status).toBe(400)
  })
  it('rejects malformed date', async () => {
    const res = await GET(reqUrl('slug=demo&date=2026/05/22'))
    expect(res.status).toBe(400)
  })
  it('rejects SQL-injection-like slug', async () => {
    const res = await GET(reqUrl("slug=' OR 1=1--&date=2026-05-22"))
    expect(res.status).toBe(400)
  })
})
