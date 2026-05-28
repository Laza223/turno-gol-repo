import { describe, expect, it } from 'vitest'
import { absoluteUrl, buildMetadata, SITE_URL } from '@/lib/seo/metadata'

describe('absoluteUrl', () => {
  it('prepends slash when missing', () => {
    expect(absoluteUrl('foo')).toBe(`${SITE_URL}/foo`)
  })
  it('preserves leading slash', () => {
    expect(absoluteUrl('/foo')).toBe(`${SITE_URL}/foo`)
  })
  it('handles root path', () => {
    expect(absoluteUrl('/')).toBe(`${SITE_URL}/`)
  })
  it('does not mutate input', () => {
    const path = 'foo'
    absoluteUrl(path)
    expect(path).toBe('foo')
  })
})

describe('buildMetadata', () => {
  it('emits canonical, openGraph, twitter, noIndex robots when noIndex=true', () => {
    const md = buildMetadata({
      title: 'X',
      description: 'Y',
      path: '/foo',
      noIndex: true,
    })
    expect(md.alternates?.canonical).toBe(`${SITE_URL}/foo`)
    expect(md.openGraph?.title).toBe('X')
    expect(md.twitter?.card).toBe('summary_large_image')
    // robots is an object when noIndex=true
    const robots = md.robots as { index: boolean; follow: boolean }
    expect(robots.index).toBe(false)
    expect(robots.follow).toBe(false)
  })

  it('absolutes a relative image path', () => {
    const md = buildMetadata({
      title: 'X',
      description: 'Y',
      path: '/',
      image: '/custom.png',
    })
    const og = md.openGraph as { images: Array<{ url: string }> }
    expect(og.images[0]!.url).toBe(`${SITE_URL}/custom.png`)
  })

  it('preserves an absolute image url', () => {
    const md = buildMetadata({
      title: 'X',
      description: 'Y',
      path: '/',
      image: 'https://cdn/img.png',
    })
    const og = md.openGraph as { images: Array<{ url: string }> }
    expect(og.images[0]!.url).toBe('https://cdn/img.png')
  })

  it('emits title as { absolute } when titleAbsolute=true', () => {
    const md = buildMetadata({
      title: 'TurnoGol — Reservá',
      description: 'Y',
      path: '/',
      titleAbsolute: true,
    })
    const title = md.title as { absolute: string }
    expect(title.absolute).toBe('TurnoGol — Reservá')
  })
})
