/**
 * Compuerta del fondo del portal. `PortalFrame` pinta `.player-shell-bg` (La Previa: la cancha) en
 * todo el portal; las páginas que montan `PortalWorld` lo neutralizan con UNA regla de globals.css
 * que solo actúa si la página trae el marcador del mundo. Acá se prueba la forma de esa regla:
 * lo que se pinta de verdad lo miden las stories (`PortalWorld.stories.tsx`).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse, type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.resolve(__dirname, '..', '..', 'src/app/globals.css'), 'utf8')

const NEUTRALIZER = "html:has([data-world='portal']) .player-shell-bg"
const DARK_SHELL = '.dark .player-shell-bg'

type Specificity = [ids: number, classes: number, types: number]

/**
 * Especificidad de un selector con los componentes que usa globals.css (clases, atributos,
 * pseudo-clases, tipos y combinadores de descendiente). `:has()` y `:not()` valen lo que su
 * argumento (CSS Selectors 4).
 */
function specificity(selector: string): Specificity {
  const total: Specificity = [0, 0, 0]
  const rest = selector.replace(
    /:(?:has|not)\(((?:[^()]|\([^()]*\))*)\)/g,
    (_match, arg: string) => {
      const inner = specificity(arg)
      for (const i of [0, 1, 2]) total[i] += inner[i]
      return ''
    },
  )
  total[0] += rest.match(/#[\w-]+/g)?.length ?? 0
  total[1] += rest.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)?.length ?? 0
  total[2] += rest.split(/[\s>+~]+/).filter((part) => /^[a-z]/i.test(part)).length
  return total
}

/** Orden lexicográfico (ids, clases, tipos): positivo si `a` gana a `b`. */
function compare(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

const normalize = (selector: string) => selector.replace(/"/g, "'").replace(/\s+/g, ' ')

/** Todas las reglas de globals.css que pintan el cascarón del portal. */
function shellRules(): Rule[] {
  const found: Rule[] = []
  parse(css).walkRules((rule) => {
    if (rule.selector.includes('.player-shell-bg')) found.push(rule)
  })
  return found
}

/** La que condiciona por el marcador del mundo, descubierta por su forma y no por su texto. */
const neutralizers = () => shellRules().filter((rule) => rule.selector.includes('data-world'))
const darkShell = () => shellRules().filter((rule) => normalize(rule.selector) === DARK_SHELL)

describe('Fondo del portal en el mundo PortalWorld', () => {
  it('hay UNA regla que neutraliza .player-shell-bg solo con el marcador del mundo', () => {
    const rules = neutralizers()
    expect(rules, 'falta la regla en globals.css (o está duplicada)').toHaveLength(1)
    expect(normalize(rules[0]!.selector)).toBe(NEUTRALIZER)
    const decls: string[] = []
    rules[0]!.each((child) => {
      if (child.type === 'decl') decls.push(`${child.prop}: ${child.value}`)
    })
    // El shorthand resetea imagen, tamaño, posición y `background-attachment` de La Previa.
    expect(decls).toEqual(['background: var(--color-background)'])
  })

  it('su especificidad supera a .dark .player-shell-bg, así que gana en claro y en oscuro', () => {
    const [mine, dark] = [neutralizers(), darkShell()]
    expect(mine).toHaveLength(1)
    expect(dark).toHaveLength(1)
    expect(compare(specificity(mine[0]!.selector), specificity(dark[0]!.selector))).toBeGreaterThan(
      0,
    )
  })

  it('las tres reglas viven fuera de todo @layer: entre capas la especificidad no decide', () => {
    const rules = shellRules()
    expect(rules).toHaveLength(3)
    expect(rules.map((rule) => rule.parent?.type)).toEqual(['root', 'root', 'root'])
  })
})
