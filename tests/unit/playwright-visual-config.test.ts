/**
 * Invariantes del config de regresión visual que se rompen EN SILENCIO.
 *
 * Vive en `tests/unit` a propósito: el step visual de `ci.yml` es
 * `continue-on-error: true`, así que un guard puesto ahí puede podrirse sin que
 * nadie lo vea (ya pasó: las 8 fotos fallaron durante semanas con CI verde). Acá
 * corre en el job bloqueante y no cuesta nada — es lectura de un objeto, no
 * levanta browser ni servidor.
 *
 * Ver docs/testing/VISUAL_REGRESSION.md.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import config from '../../playwright.config'

const toHaveScreenshot = config.expect?.toHaveScreenshot

describe('playwright.config — regresión visual', () => {
  it('inyecta screenshot.css en cada foto vía stylePath', () => {
    const stylePath = toHaveScreenshot?.stylePath
    expect(
      stylePath,
      'expect.toHaveScreenshot.stylePath desapareció: las fotos vuelven a depender de si el overlay de dev de Next apareció'
    ).toBeDefined()

    const paths = Array.isArray(stylePath) ? stylePath : [stylePath!]
    for (const p of paths) {
      // Playwright tira un error de runtime si el archivo no existe, y solo al
      // momento de la primera foto — con el stack server + seed ya pagados.
      expect(existsSync(p), `stylePath apunta a un archivo que no existe: ${p}`).toBe(true)
    }

    const css = paths.map((p) => readFileSync(p, 'utf8')).join('\n')
    // Los hooks del overlay son internos de Next. Que el archivo exista no dice
    // nada si alguien lo vació; que oculte de verdad lo prueba
    // tests/e2e/visual/stylepath-guard.spec.ts.
    expect(css).toMatch(/nextjs-portal/)
    expect(css).toMatch(/data-nextjs-dev-overlay/)
    expect(css).toMatch(/display:\s*none/)
  })

  it('no afloja el umbral del gate', () => {
    // El fix del overlay existe justamente para NO tener que subir esto. Si un
    // diff visual molesta, se arregla la causa o se re-bendice la baseline.
    expect(toHaveScreenshot?.maxDiffPixelRatio).toBeLessThanOrEqual(0.01)
    expect(toHaveScreenshot?.threshold).toBeLessThanOrEqual(0.2)
  })

  it('ningún project define su propio `expect`', () => {
    // Playwright resuelve el expect del project con
    // `takeFirst(projectConfig.expect, config.expect, {})` — NO hace merge. Un
    // `expect` a nivel project descarta el global COMPLETO: se irían stylePath,
    // threshold y maxDiffPixelRatio de una, y las fotos seguirían "pasando" con
    // los defaults de Playwright.
    const withOwnExpect = (config.projects ?? []).filter((p) => p.expect).map((p) => p.name)
    expect(
      withOwnExpect,
      'un project define `expect` y eso descarta el global entero (takeFirst, no merge): mové esas opciones al expect de arriba'
    ).toEqual([])
  })

  it('las baselines viven donde snapshotPathTemplate las busca', () => {
    // El template es la única fuente de verdad del path. Ya pasó una vez que las
    // PNG quedaran un nivel más abajo (subcarpeta con el nombre del artifact) y
    // que las 8 fotos fallaran con "A snapshot doesn't exist" en silencio.
    const template = config.snapshotPathTemplate
    expect(template).toBeDefined()

    for (const project of ['visual', 'visual-mobile']) {
      const dir = template!
        .replace('{projectName}', project)
        .replace('{platform}', 'linux')
        .replace('{arg}{ext}', '')
      expect(
        existsSync(path.resolve(dir)),
        `no hay baselines linux para el project ${project} en ${dir} — si el workflow las dejó en otra carpeta, ver la "trampa del artifact" en docs/testing/VISUAL_REGRESSION.md`
      ).toBe(true)
    }
  })
})
