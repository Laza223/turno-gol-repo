import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * `bg-muted` + `text-muted-foreground` en el mismo elemento da **4.21:1** sobre
 * el fondo de card y FALLA AA. Está medido y documentado en
 * `src/lib/status-tone.ts:5-10`, que existe justamente porque esa receta se
 * había copiado a mano en cuatro superficies del admin. El tono `neutral` de
 * `TONE_BADGE` la reemplaza con una receta de slate que sí pasa.
 *
 * Este archivo es el trinquete: cada archivo que se migra entra a la lista y ya
 * no puede volver atrás. La lista crece de a lotes; los que faltan viven en el
 * plan del refactor, no acá, para que este test nunca esté en rojo por trabajo
 * que todavía no se hizo.
 *
 * Lo que NO cuenta como violación, a propósito:
 * - `hover:bg-muted` o `bg-muted/50` — el tinte opaco al 100% es el que apaga
 *   el texto; un hover o un tinte parcial no reproducen la medición.
 * - un ícono sobre `bg-muted` — para contenido no textual el piso es 3:1 y
 *   4.21:1 lo pasa. Solo el TEXTO sobre ese fondo es el bug.
 */
const YA_MIGRADOS = [
  'src/app/(admin)/caja/devoluciones/PendingRefundsList.tsx',
  'src/app/(admin)/jugadores/JugadoresView.tsx',
  'src/app/(admin)/reservas/(list)/page.tsx',
  'src/app/(admin)/torneos/torneos-lib.ts',
  'src/components/booking/BookingFormModal.tsx',
  'src/components/schedule/ScheduleFields.tsx',
  'src/lib/tournaments/status-visual.ts',
]

/**
 * Todas las tandas de clases que aparecen como string en el fuente. Los
 * comentarios se sacan primero: varios de estos archivos NOMBRAN la receta
 * prohibida para explicar por qué la sacaron, y un comentario no pinta nada.
 */
function stringLiterals(src: string): string[] {
  const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const out: string[] = []
  const re = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sinComentarios)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return out
}

describe('la receta que falla AA no vuelve', () => {
  for (const rel of YA_MIGRADOS) {
    it(`${rel} no pinta texto muted sobre fondo muted`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
      const culpables = stringLiterals(src).filter((lit) => {
        const tokens = lit.split(/\s+/)
        return tokens.includes('bg-muted') && tokens.includes('text-muted-foreground')
      })
      expect(culpables, 'usá TONE_BADGE.neutral de @/lib/status-tone').toEqual([])
    })
  }
})
