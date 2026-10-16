/**
 * Contraste WCAG de lo que SE PINTA en un elemento: su color de texto contra su fondo, con la
 * opacidad propia ya mezclada con lo que hay detrás. axe no mide los controles deshabilitados, y
 * un `disabled:opacity-50` es justo lo que los baja de 4,5:1: acá se mide igual.
 *
 * Los colores salen de getComputedStyle (oklch, color-mix…) y pasan por un canvas para llegar a
 * sRGB. Antes de medir espera a que terminen las transiciones CSS (200 ms en `Button`): en el medio
 * de una sale un número que no es de ningún estado. Solo corre en el browser (stories).
 */
type Rgb = [number, number, number]
type Rgba = [number, number, number, number]

let pixel: CanvasRenderingContext2D | null = null

/** Cualquier color CSS → [r, g, b, a] en sRGB (r, g, b de 0 a 255; a de 0 a 1). */
function toRgba(css: string): Rgba {
  if (!pixel) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    pixel = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!pixel) throw new Error('contrast: el browser no da un canvas 2d')
  pixel.clearRect(0, 0, 1, 1)
  // Un valor que el canvas no entiende lo ignora y deja el centinela: mejor fallar que medir basura.
  pixel.fillStyle = '#123456'
  pixel.fillStyle = css
  if (pixel.fillStyle === '#123456' && css.toLowerCase() !== '#123456') {
    throw new Error(`contrast: color no soportado "${css}"`)
  }
  pixel.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

const over = ([r, g, b, a]: Rgba, base: Rgb): Rgb => [
  r * a + base[0] * (1 - a),
  g * a + base[1] * (1 - a),
  b * a + base[2] * (1 - a),
]

const mix = (top: Rgb, base: Rgb, t: number): Rgb => [
  top[0] * t + base[0] * (1 - t),
  top[1] * t + base[1] * (1 - t),
  top[2] * t + base[2] * (1 - t),
]

const luminance = ([r, g, b]: Rgb) => {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Espera a que no quede ninguna transición CSS corriendo (las animaciones infinitas no cuentan). */
async function transitionsSettled() {
  // Tope por cantidad de vueltas y no por Date.now(): el preview de Storybook congela la fecha.
  for (let i = 0; i < 100; i++) {
    if (!document.getAnimations().some((a) => a instanceof CSSTransition)) return
    await new Promise((r) => setTimeout(r, 20))
  }
}

/**
 * Con `pseudo` se mide el texto del pseudo-elemento (el `::placeholder` de un input) contra el
 * fondo del propio elemento: el pseudo no tiene fondo y su color puede traer alfa (`/60`).
 */
export async function paintedContrast(el: HTMLElement, pseudo?: '::placeholder'): Promise<number> {
  await transitionsSettled()
  // Lo que hay detrás del elemento: los fondos de sus ancestros, de afuera hacia adentro, sobre blanco.
  let backdrop: Rgb = [255, 255, 255]
  const ancestors: Element[] = []
  for (let n = el.parentElement; n; n = n.parentElement) ancestors.unshift(n)
  for (const n of ancestors) backdrop = over(toRgba(getComputedStyle(n).backgroundColor), backdrop)

  const style = getComputedStyle(el)
  const textStyle = pseudo ? getComputedStyle(el, pseudo) : style
  const opacity = Number(style.opacity)
  const ownBg = over(toRgba(style.backgroundColor), backdrop)
  const ink = over(toRgba(textStyle.color), ownBg)
  // La opacidad propia del pseudo (Firefox baja el placeholder así) afecta solo al texto.
  const text = pseudo ? mix(ink, ownBg, Number(textStyle.opacity)) : ink
  // El elemento se pinta como un grupo y recién ahí se mezcla con lo de atrás según su opacidad.
  const l1 = luminance(mix(text, backdrop, opacity))
  const l2 = luminance(mix(ownBg, backdrop, opacity))
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
