import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative, sep } from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '../..')

/** Camina `src/` y devuelve los `.stories.tsx`, en paths relativos con `/`. */
function findStories(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) findStories(full, out)
    else if (entry.name.endsWith('.stories.tsx')) {
      out.push(relative(ROOT, full).split(sep).join('/'))
    }
  }
  return out
}

/**
 * Una promesa que nunca resuelve dentro de una story deja viva una transición de
 * React. Como la transición vive en el scheduler y no en el árbol, un remount no
 * la toca: contamina a las stories SIGUIENTES del mismo archivo, que fallan por
 * no encontrar un `role="alert"` que su propio código sí renderiza.
 *
 * El helper `src/test/pending-action.ts` resuelve eso — la promesa queda en
 * vuelo y el `play` la libera al final. Este guard existe porque el patrón viejo
 * volvía a colarse: los archivos que "pasaban" lo hacían solo porque la story
 * colgada había quedado última, o sea seguros por posición y no por diseño.
 * Reordenar exports los rompía sin que nadie tocara una línea de lógica.
 *
 * Para agregar una excepción hay que escribir el motivo acá. Si no se puede
 * escribir el motivo, la excepción no corresponde.
 */
const ALLOWLIST: Record<string, string> = {
  'src/components/ui/image-uploader.stories.tsx':
    'ImageUploader no usa transiciones de React: `busy` es un useState y el upload ' +
    'resuelve en un `finally` de async normal. Migrarlo al helper introduce una espera ' +
    'que el flujo real no tiene y la story muere con "Test timed out in 30000ms" ' +
    '(medido el 2026-08-06, revertido).',
  'src/components/layout/admin-layout-shell.stories.tsx':
    '`signOut` está tipada `() => Promise<never>` porque es una Server Action que ' +
    'redirige del lado del servidor y nunca vuelve — una promesa que no resuelve es su ' +
    'representación correcta, no un descuido. Es el default de `meta.args` y ninguna ' +
    'story dispara el botón.',
  'src/components/layout/super-admin-layout-shell.stories.tsx':
    'Mismo caso que admin-layout-shell: `signOut` tipada `Promise<never>`, default de ' +
    '`meta.args`, ninguna story la dispara.',
}

/** `new Promise(() => {})`, con o sin parámetro de tipo. */
const DANGLING = /new Promise(?:<[^>]*>)?\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/

/**
 * Saca comentarios antes de buscar el patrón. Sin esto, un comentario que
 * EXPLICA el problema (como el de `StepIdentity.stories.tsx`, que documenta de
 * qué se migró) hace fallar el guard — y la salida sería pedirle a quien
 * documenta que deje de documentar.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('stories: ninguna promesa colgada fuera de la allowlist', () => {
  const files = findStories(resolve(ROOT, 'src')).sort()

  it('encuentra archivos de stories (el glob no quedó vacío)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  for (const rel of files) {
    const norm = rel.replace(/\\/g, '/')
    const motivo = ALLOWLIST[norm]

    it(`${norm}${motivo ? ' (allowlist)' : ''}`, () => {
      const src = stripComments(readFileSync(resolve(ROOT, rel), 'utf8'))
      const tiene = DANGLING.test(src)

      if (motivo) {
        // La allowlist no es un cajón: si el archivo ya no tiene el patrón, la
        // entrada sobra y hay que sacarla.
        expect(tiene, `${norm} está en la allowlist pero ya no tiene el patrón`).toBe(true)
        return
      }

      expect(
        tiene,
        `${norm} usa \`new Promise(() => {})\`. Usá \`pendingAction\` de ` +
          '`src/test/pending-action.ts`, o agregá el archivo a ALLOWLIST con el motivo escrito.',
      ).toBe(false)
    })
  }
})
