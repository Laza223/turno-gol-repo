import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard de la clase "URL con nombre de route group".
 *
 * `src/app/(admin)/grilla/page.tsx` se sirve en `/grilla`: los paréntesis marcan
 * un route *group* y el segmento NO aparece en la URL. Escribir `/admin/grilla`
 * produce un 404, y es un 404 que no rompe ningún build ni ningún type — solo
 * aparece cuando un usuario hace click.
 *
 * Pasó de verdad: el destino de las notificaciones push apuntaba a
 * `/admin/grilla`, así que cada vez que llegaba una reserva online y el dueño
 * tocaba la notificación, aterrizaba en un 404. El service worker además se
 * registraba con `scope: '/admin/'`, un scope que no cubría ninguna página.
 */

const projectRoot = path.resolve(__dirname, '..', '..')

/**
 * Route groups cuyo nombre NO corresponde a ningún segmento de URL real.
 *
 * `(super-admin)` queda afuera a propósito: contiene una carpeta homónima
 * (`src/app/(super-admin)/super-admin/`), así que `/super-admin/tenants` sí es
 * una URL válida. El grupo que importa es el del tipo `(admin)`, que no tiene
 * subcarpeta propia y cuyas páginas se sirven en la raíz.
 */
function routeGroupsWithoutRealSegment(): string[] {
  const appDir = path.join(projectRoot, 'src', 'app')
  return readdirSync(appDir)
    .filter((name) => name.startsWith('(') && name.endsWith(')'))
    .map((name) => name.slice(1, -1))
    .filter((group) => {
      const homonym = path.join(appDir, `(${group})`, group)
      return !existsSync(homonym)
    })
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (/\.(ts|tsx|js)$/.test(entry) && !/\.(test|spec|stories)\./.test(entry)) acc.push(full)
  }
  return acc
}

describe('URLs de navegación no incluyen nombres de route group', () => {
  const groups = routeGroupsWithoutRealSegment()

  it('el proyecto tiene route groups (si no, este guard no aplica)', () => {
    expect(groups.length).toBeGreaterThan(0)
  })

  it.each(groups)('ninguna URL empieza con /%s/', (group) => {
    // Solo strings que arrancan una URL: `'/admin/...'`, `"/admin/..."`,
    // `` `/admin/...` ``. Así no matchea imports (`@/components/admin/...`)
    // ni rutas de API (`/api/admin/...`), que son directorios reales.
    const urlLiteral = new RegExp(`['"\`]/${group}/`)

    const offenders: string[] = []
    for (const file of [
      ...sourceFiles(path.join(projectRoot, 'src')),
      path.join(projectRoot, 'public', 'sw.js'),
    ]) {
      const source = readFileSync(file, 'utf8')
      source.split('\n').forEach((line, i) => {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return
        if (urlLiteral.test(line)) {
          offenders.push(`${path.relative(projectRoot, file)}:${i + 1}  ${line.trim().slice(0, 100)}`)
        }
      })
    }

    expect(
      offenders,
      `\`(${group})\` es un route group: no aparece en la URL. Sacá el prefijo.\n` +
        offenders.join('\n'),
    ).toEqual([])
  })
})
