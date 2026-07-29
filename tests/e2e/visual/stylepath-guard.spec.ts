/**
 * Control positivo del mecanismo que oculta el overlay de dev de Next.
 *
 * No compara ninguna baseline: no es una foto más. Prueba lo único de lo que
 * dependen las 8 fotos y que, si se rompe, se rompe EN SILENCIO — que
 * `screenshot.css` realmente haga desaparecer el overlay del pixel, incluido lo
 * que vive dentro del shadow root. Si un bump de Next renombra esos hooks, el CSS
 * deja de matchear y el overlay vuelve a las fotos sin que nada avise.
 *
 * La prueba es por equivalencia de bytes contra el mismo DOM sin overlay, así que
 * no hace falta decodificar PNG ni contar pixeles: si `display: none` dejara
 * aunque sea un pixel distinto, los dos buffers no serían iguales. Y el control
 * negativo (la foto sin el CSS TIENE que diferir) es lo que evita que el test pase
 * por vacuidad con un fixture que no pinta nada.
 *
 * El cableado del config (que `expect.toHaveScreenshot.stylePath` exista y apunte
 * a este archivo) NO se puede ver desde acá: Playwright resuelve `expect` en
 * `FullProjectInternal`, y el `FullProject` que expone `testInfo.project` no lo
 * lleva. Eso se cubre en `tests/unit/playwright-visual-config.test.ts`, que lee el
 * config directo y además corre en el job bloqueante.
 *
 * Ver docs/testing/VISUAL_REGRESSION.md y tests/e2e/visual/screenshot.css.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './_visual-test'

const CSS_PATH = path.resolve('tests/e2e/visual/screenshot.css')

/**
 * Réplica de lo que monta `renderAppDevOverlay` en Next 16: un `<script>` con
 * `data-nextjs-dev-overlay` y `position:absolute`, un `<nextjs-portal>` adentro,
 * y el contenido colgado de un shadow root (donde un `<style>` del documento no
 * llega). La caja es azul puro y `position:fixed` abajo a la izquierda, con las
 * mismas medidas que la del indicador real: 101×36.
 */
const MOUNT_FAKE_OVERLAY = () => {
  const wrapper = document.createElement('script')
  wrapper.setAttribute('data-nextjs-dev-overlay', 'true')
  wrapper.style.display = 'block'
  wrapper.style.position = 'absolute'
  const host = document.createElement('nextjs-portal')
  wrapper.appendChild(host)
  document.body.appendChild(wrapper)
  const shadow = host.attachShadow({ mode: 'open' })
  const box = document.createElement('div')
  box.setAttribute('data-nextjs-toast', 'true')
  box.style.cssText =
    'position:fixed;left:20px;bottom:20px;width:101px;height:36px;background:#0000ff'
  shadow.appendChild(box)
}

test('screenshot.css borra el overlay de dev del pixel @visual', async ({ page }) => {
  const css = readFileSync(CSS_PATH, 'utf8')

  await page.setContent('<main style="width:300px;height:200px;background:#fff"></main>')
  await page.evaluate(MOUNT_FAKE_OVERLAY)

  const overlayVisible = await page.screenshot()
  const overlayHiddenByCss = await page.screenshot({ style: css })

  await page.evaluate(() => document.querySelector('[data-nextjs-dev-overlay]')?.remove())
  const overlayAbsent = await page.screenshot()

  // Control negativo: sin el CSS el fixture SÍ pinta. Sin esto, un fixture roto
  // (shadow root vacío, caja fuera del viewport) haría pasar el test por nada.
  expect(
    overlayVisible.equals(overlayAbsent),
    'El fixture no pintó nada: el control positivo de abajo sería vacuo'
  ).toBe(false)

  // Lo que importa: con el CSS aplicado, el pixel es idéntico a que el overlay
  // no existiera. Eso es lo que un `mask` no daba — pintaba una caja magenta.
  expect(
    overlayHiddenByCss.equals(overlayAbsent),
    'screenshot.css dejó de ocultar el overlay de dev: revisá los selectores contra la versión de Next'
  ).toBe(true)
})
