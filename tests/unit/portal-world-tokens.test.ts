/**
 * Compuertas del mundo del portal (`src/components/world`). Prueban dos cosas, ninguna visual:
 * que el CSS del mundo solo puede actuar cuando la página trae el marcador
 * `[data-world="portal"]`, y que los tokens que panel y portal comparten (`:root`, `.dark`,
 * `.dark-surface` y `@theme` de globals.css) no cambiaron. Lo que el portal pinta con el
 * marcador puesto lo miden las stories (`PortalWorld.stories.tsx`).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse, type Container } from 'postcss'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(projectRoot, rel), 'utf8')

/**
 * sha256 de las declaraciones de `:root`, `.dark`, `.dark-surface` y `@theme` de globals.css,
 * sin comentarios ni espacios, con `!important`. Si se cambian tokens del panel A PROPÓSITO, se
 * actualiza este hash en el mismo PR (el mensaje del test imprime el valor nuevo).
 */
const PANEL_TOKENS_SHA256 = 'a5e06e884563a438cc6b90cfd00b99dd67460c9211224f47df8e83b0b172b154'

const PANEL_SELECTORS = [':root', '.dark', '.dark-surface']

/** Forma exacta de un selector del mundo: html, `:not(.dark)` o `.dark` opcionales, y el marcador. */
const WORLD_SELECTOR = /^html(?::not\(\.dark\)|\.dark)?:has\(\[data-world=["']portal["']\]\)$/

function panelBlocks(css: string): Array<[label: string, decls: string[]]> {
  const blocks: Array<[string, string[]]> = []
  const take = (label: string, node: Container) => {
    const decls: string[] = []
    node.each((child) => {
      if (child.type !== 'decl') return
      const important = child.important ? ' !important' : ''
      decls.push(`${child.prop}: ${child.value.replace(/\s+/g, ' ')}${important}`)
    })
    blocks.push([label, decls])
  }
  const root = parse(css)
  root.walkRules((rule) => {
    if (PANEL_SELECTORS.includes(rule.selector)) take(rule.selector, rule)
  })
  // Solo las declaraciones propias de @theme: los @keyframes anidados no entran.
  root.walkAtRules('theme', (theme) => take('@theme', theme))
  return blocks
}

describe('Mundo del portal — compuertas', () => {
  it('los tokens de :root, .dark, .dark-surface y @theme son los de siempre', () => {
    const blocks = panelBlocks(read('src/app/globals.css'))
    // Un bloque renombrado o duplicado achicaría o duplicaría lo que se hashea.
    const labels = blocks.map(([label]) => label)
    expect(labels).toEqual([':root', '.dark', '.dark-surface', '@theme'])
    const text = blocks.map(([label, decls]) => `${label} { ${decls.join('; ')} }`).join('\n')
    expect(
      createHash('sha256').update(text).digest('hex'),
      'Cambiaron los tokens del panel (:root, .dark, .dark-surface o @theme). Si fue a ' +
        'propósito, actualizá PANEL_TOKENS_SHA256 y revisá src/components/world/portal-world.css: ' +
        'el portal redeclara algunos de esos tokens.',
    ).toBe(PANEL_TOKENS_SHA256)
  })

  const world = () => parse(read('src/components/world/portal-world.css'))

  it('cada selector del CSS del mundo es html[:not(.dark)|.dark]:has([data-world="portal"])', () => {
    const selectors: string[] = []
    world().walkRules((rule) => {
      selectors.push(...rule.selectors)
    })
    expect(selectors, 'el CSS del mundo no tiene reglas').not.toHaveLength(0)
    expect(
      selectors.filter((s) => !WORLD_SELECTOR.test(s)),
      'selectores fuera de la forma permitida: podrían actuar sin el marcador',
    ).toEqual([])
  })

  it('el CSS del mundo no usa at-rules (@import, @media, @layer…)', () => {
    const atRules: string[] = []
    world().walkAtRules((at) => {
      atRules.push(`@${at.name}`)
    })
    expect(atRules).toEqual([])
  })

  it('el CSS del mundo solo declara custom properties', () => {
    const foreign: string[] = []
    world().walkDecls((d) => {
      if (!d.prop.startsWith('--')) foreign.push(d.prop)
    })
    expect(foreign).toEqual([])
  })
})
