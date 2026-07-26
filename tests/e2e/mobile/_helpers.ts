/**
 * Probes compartidos de los specs mobile.
 *
 * Los tres devuelven la LISTA DE CULPABLES, no un booleano. Un test que solo
 * dice "hay overflow" obliga a abrir el browser a mano para averiguar de quién;
 * uno que dice `<table class="min-w-[640px]"> right=712 vs innerWidth=390`
 * se arregla leyendo el output. Ese detalle es lo que hace que el probe sirva
 * también como herramienta del barrido manual, no solo como aserción de CI.
 *
 * Los tres corren enteros dentro de un único `page.evaluate` — recorrer el DOM
 * desde Node con un round-trip CDP por elemento tarda minutos en páginas reales.
 */

import type { Page } from '@playwright/test'

/** WCAG 2.5.5 Level AA. */
export const TOUCH_TARGET_MIN_PX = 44

/**
 * iOS WebKit hace zoom al enfocar cualquier campo por debajo de esto. El
 * síntoma es exclusivo de iOS, pero el font-size computado se mide en
 * cualquier motor — por eso el guard no necesita WebKit para servir.
 */
export const FIELD_MIN_FONT_PX = 16

/** Campos que muestran texto tipeable. Los otros type no disparan el zoom. */
const FIELD_SELECTOR = [
  'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range])',
  'input:not([type=color]):not([type=file]):not([type=submit]):not([type=button]):not([type=reset])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type=hidden])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
].join(',')

export type OverflowCulprit = {
  tag: string
  classes: string
  text: string
  right: number
  innerWidth: number
}

export type SmallTarget = {
  tag: string
  classes: string
  text: string
  w: number
  h: number
}

export type SmallField = {
  tag: string
  type: string
  id: string
  name: string
  classes: string
  fontSizePx: number
}

/**
 * Elementos que se salen del viewport por derecha y cuyo desborde NO está
 * contenido por un ancestro scrolleable.
 *
 * La distinción importa: una tabla ancha dentro de un `overflow-x-auto` es el
 * patrón correcto (scrollea la tabla, no la página). Contar eso como violación
 * llevaría a "arreglarlo" achicando la tabla, que es peor.
 */
export async function collectHorizontalOverflow(page: Page): Promise<OverflowCulprit[]> {
  return page.evaluate(() => {
    function isVisible(el: Element): boolean {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false
      }
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    /** ¿Algún ancestro recorta o scrollea el eje X? Entonces el desborde está contenido. */
    function hasScrollableAncestor(el: Element): boolean {
      let node = el.parentElement
      while (node && node !== document.documentElement) {
        const overflowX = getComputedStyle(node).overflowX
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return true
        node = node.parentElement
      }
      return false
    }

    const limit = window.innerWidth + 1 // 1px de tolerancia por redondeo sub-pixel
    const culprits: OverflowCulprit[] = []
    const seen = new Set<Element>()

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!isVisible(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.right <= limit) continue
      if (hasScrollableAncestor(el)) continue
      // Si el padre ya desborda, el hijo es consecuencia: reportamos el ancestro.
      if (el.parentElement && seen.has(el.parentElement)) continue
      seen.add(el)
      culprits.push({
        tag: el.tagName.toLowerCase(),
        classes: el.className.toString().slice(0, 100),
        text: (el.textContent ?? '').trim().slice(0, 50),
        right: Math.round(rect.right),
        innerWidth: window.innerWidth,
      })
    }
    return culprits
  })
}

/** Elementos tocables por debajo de 44x44 CSS px (WCAG 2.5.5 AA). */
export async function collectSmallTouchTargets(
  page: Page,
  selector: string = INTERACTIVE_SELECTOR,
  min: number = TOUCH_TARGET_MIN_PX,
): Promise<SmallTarget[]> {
  return page.evaluate(
    ({ sel, minPx }) => {
      function isVisible(el: Element): boolean {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false
        }
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return false
        if (rect.bottom <= 0 || rect.right <= 0) return false
        if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false
        return true
      }

      /**
       * Patrón "stretched link": un `<a>` con `::after { position:absolute;
       * inset:0 }` dentro de un contenedor `relative` — el área tocable real es
       * la card entera, no el texto del link. `getBoundingClientRect()` mide el
       * elemento, no su pseudo-elemento, así que sin esto el probe reporta
       * cada título de card como violación cuando en realidad es el patrón
       * correcto (MASTER §9: "en listas, la fila entera es el blanco").
       */
      function coversAncestor(el: Element): boolean {
        const after = getComputedStyle(el, '::after')
        if (after.position !== 'absolute') return false
        return (
          after.inset === '0px' ||
          (after.top === '0px' &&
            after.right === '0px' &&
            after.bottom === '0px' &&
            after.left === '0px')
        )
      }

      const fails: SmallTarget[] = []
      for (const el of Array.from(document.querySelectorAll(sel)) as HTMLElement[]) {
        if (!isVisible(el)) continue
        if (el.matches('[disabled], [aria-disabled="true"]')) continue
        if (el.classList.contains('sr-only')) continue
        if (coversAncestor(el)) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < minPx || rect.height < minPx) {
          fails.push({
            tag: el.tagName.toLowerCase(),
            classes: el.className.toString().slice(0, 80),
            text: (el.textContent ?? '').trim().slice(0, 50),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          })
        }
      }
      return fails
    },
    { sel: selector, minPx: min },
  )
}

/**
 * Campos visibles cuyo font-size computado está por debajo del piso de 16px.
 *
 * Este es el probe que hubiera cazado el bug original: `ui/input.tsx` declaraba
 * `text-sm` (14px) y en iPhone eso hace que la página zoomee al enfocar.
 */
export async function collectSmallFields(
  page: Page,
  min: number = FIELD_MIN_FONT_PX,
): Promise<SmallField[]> {
  return page.evaluate(
    ({ sel, minPx }) => {
      function isVisible(el: Element): boolean {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false
        }
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }

      const fails: SmallField[] = []
      for (const el of Array.from(document.querySelectorAll(sel)) as HTMLElement[]) {
        if (!isVisible(el)) continue
        const fontSizePx = Number.parseFloat(getComputedStyle(el).fontSize)
        if (Number.isNaN(fontSizePx) || fontSizePx >= minPx) continue
        fails.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? '',
          id: el.id,
          name: el.getAttribute('name') ?? '',
          classes: el.className.toString().slice(0, 80),
          fontSizePx: Math.round(fontSizePx * 100) / 100,
        })
      }
      return fails
    },
    { sel: FIELD_SELECTOR, minPx: min },
  )
}

/** Formateo compartido para que el fallo se lea sin abrir el browser. */
export function formatOverflow(route: string, culprits: OverflowCulprit[]): string {
  return [
    `Scroll horizontal en ${route} (viewport ${culprits[0]?.innerWidth ?? '?'}px):`,
    ...culprits.map((c) => `  <${c.tag}> right=${c.right}px "${c.text}" [${c.classes}]`),
  ].join('\n')
}

export function formatSmallFields(route: string, fields: SmallField[]): string {
  return [
    `Campos por debajo de ${FIELD_MIN_FONT_PX}px en ${route} (iOS zoomea al enfocarlos):`,
    ...fields.map(
      (f) =>
        `  <${f.tag}${f.type ? ` type=${f.type}` : ''}> ${f.fontSizePx}px` +
        ` id="${f.id}" name="${f.name}" [${f.classes}]`,
    ),
  ].join('\n')
}

export function formatSmallTargets(route: string, targets: SmallTarget[]): string {
  return [
    `Touch targets por debajo de ${TOUCH_TARGET_MIN_PX}px en ${route}:`,
    ...targets.map((t) => `  <${t.tag}> "${t.text}" ${t.w}x${t.h}px [${t.classes}]`),
  ].join('\n')
}
