// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useNowLine } from '@/hooks/use-now-line'

// happy-dom no hace layout: el alto del scroller y la posición del marcador se
// fijan a mano. Scroller arriba de todo (top 0), marcador a 400 px.
const MARKER_TOP = 400
const VISIBLE_HEIGHT = 500
// 400 - 0 + 0 - 500 * 0.3: la línea de "ahora" queda al 30% del alto.
const EXPECTED_SCROLL = 250

function setClientHeight(el: HTMLElement, height: number) {
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height })
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element[] = []
  disconnected = false
  private readonly callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
  trigger() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function Harness({ initialHeight }: { initialHeight: number }) {
  const { gridScrollRef, nowLineRef } = useNowLine({
    artNow: { date: '2026-10-22', time: '20:30' },
    date: '2026-10-22',
    visibleSlots: ['18:00', '19:00', '20:00', '21:00', '22:00'],
  })
  return (
    <div
      data-testid="scroller"
      ref={(el) => {
        gridScrollRef.current = el
        if (el) setClientHeight(el, initialHeight)
      }}
    >
      <div
        ref={(el) => {
          nowLineRef.current = el
          if (el) {
            el.getBoundingClientRect = () => ({ top: MARKER_TOP }) as DOMRect
          }
        }}
      />
    </div>
  )
}

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNowLine — auto-scroll a la hora de ahora', () => {
  it('visible al montar: scrollea enseguida, sin observar nada', () => {
    render(<Harness initialHeight={VISIBLE_HEIGHT} />)
    expect(screen.getByTestId('scroller').scrollTop).toBe(EXPECTED_SCROLL)
    expect(FakeResizeObserver.instances).toHaveLength(0)
  })

  it('montada oculta (matriz del teléfono): no gasta el scroll y se ancla la primera vez que se ve', () => {
    render(<Harness initialHeight={0} />)
    const scroller = screen.getByTestId('scroller')
    expect(scroller.scrollTop).toBe(0)
    const [observer] = FakeResizeObserver.instances
    expect(observer?.observed).toEqual([scroller])

    // Un resize con la matriz todavía oculta no cuenta.
    act(() => observer!.trigger())
    expect(scroller.scrollTop).toBe(0)
    expect(observer!.disconnected).toBe(false)

    // El dueño rota el teléfono: la matriz pasa a medir y se ancla en "ahora".
    setClientHeight(scroller, VISIBLE_HEIGHT)
    act(() => observer!.trigger())
    expect(scroller.scrollTop).toBe(EXPECTED_SCROLL)
    expect(observer!.disconnected).toBe(true)
  })
})
