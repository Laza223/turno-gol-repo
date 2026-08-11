#!/usr/bin/env node
/**
 * Verifica que la cobertura declarada en storybook-coverage.json sea REAL.
 *
 * El script anterior (embebido en STORYBOOK_COVERAGE.md) solo comparaba la LISTA DE
 * ARCHIVOS del json contra `git ls-files`: detectaba fantasmas y faltantes en el
 * inventario, pero daba por buena la clasificación. O sea que un componente marcado
 * "tiene story propia" pasaba el check aunque no existiera una sola story que lo
 * importara. Así se colaron 8 componentes con cobertura CERO —- entre ellos
 * BookingCharges, que maneja dinero.
 *
 * Este script chequea lo otro, que es lo que importa: para cada componente que el
 * inventario dice que TIENE story, ¿existe algún .stories.tsx que efectivamente lo
 * IMPORTE? Una mención en un comentario no cuenta.
 *
 *   node scripts/verify-story-coverage.mjs
 *
 * Sale con código 1 si encuentra cobertura declarada pero inexistente.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const COVERED = new Set([
  'DIRECT_STORY_REQUIRED',
  'PRESENTATIONAL_EXTRACTION_REQUIRED',
  'STORY_COMPLETED',
])

// `--others --exclude-standard` además de los trackeados: si no, una story recién escrita
// y todavía sin commitear es INVISIBLE para el script, y este reporta un hueco que no
// existe. (Pasó: las 10 stories nuevas seguían saliendo como faltantes después de
// escritas.) `-c` = cached/trackeados, `-o` = untracked, `--exclude-standard` respeta el
// .gitignore para no barrer node_modules ni storybook-static.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean)

const inventory = JSON.parse(readFileSync('docs/storybook/storybook-coverage.json', 'utf8'))
const entries = Array.isArray(inventory)
  ? inventory
  : (inventory.files ?? inventory.components ?? [])

const storyFiles = [
  ...new Set(git('ls-files', '-c', '-o', '--exclude-standard', 'src/**/*.stories.tsx')),
]

// Un solo blob con TODOS los imports de TODAS las stories. Se matchea contra los
// specifiers de import, no contra el texto entero del archivo: una mención en un
// comentario ("reproduce QuickActions.tsx") NO es cobertura, y contarla es
// exactamente cómo se inflan estos números.
const importSpecifiers = new Set()
for (const f of storyFiles) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    if (spec.startsWith('.')) {
      importSpecifiers.add(
        path.posix.normalize(path.posix.join(path.posix.dirname(f.replace(/\\/g, '/')), spec)),
      )
    } else if (spec.startsWith('@/')) {
      importSpecifiers.add(path.posix.normalize(spec.replace(/^@\//, 'src/')))
    }
  }
}

const stripExt = (p) => p.replace(/\.tsx?$/, '')
const imported = new Set([...importSpecifiers].map(stripExt))

// Una `page.tsx` NUNCA la importa una story (no se puede importar una page de Next).
// Cuando el inventario la marca PRESENTATIONAL_EXTRACTION_REQUIRED, la cobertura la da
// el componente HERMANO que se le extrajo. Así que para las pages el check es: ¿hay
// alguna story en su mismo directorio?
const storyDirs = new Set(storyFiles.map((f) => path.posix.dirname(f.replace(/\\/g, '/'))))

const uncovered = []
for (const e of entries) {
  const file = (e.path ?? e.file ?? '').replace(/\\/g, '/')
  if (!file || !COVERED.has(e.classification)) continue
  if (file.endsWith('.stories.tsx')) continue

  const dir = path.posix.dirname(file)
  const covered = file.endsWith('/page.tsx')
    ? [dir, `${dir}/components`, `${dir}/_components`].some((d) => storyDirs.has(d))
    : imported.has(stripExt(file))

  if (!covered) uncovered.push({ file, classification: e.classification, role: e.role ?? '' })
}

const totalStories = storyFiles.reduce(
  (n, f) => n + (readFileSync(f, 'utf8').match(/^export const /gm) ?? []).length,
  0,
)

console.log(`archivos .stories.tsx:  ${storyFiles.length}   (${totalStories} stories)`)
console.log(
  `declarados con story:   ${entries.filter((e) => COVERED.has(e.classification)).length}`,
)
console.log(`SIN story real:         ${uncovered.length}`)

if (uncovered.length) {
  console.log('\nCobertura declarada pero INEXISTENTE (ninguna story los importa):')
  for (const u of uncovered) console.log(`  ${u.file}   [${u.classification}]`)
  process.exit(1)
}
console.log('\nOK: todo lo que el inventario declara cubierto tiene una story que lo importa.')
