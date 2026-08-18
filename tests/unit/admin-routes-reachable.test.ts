import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard del criterio de salida #1 de Fase 4: "navegación de 6 espacios activa;
 * cero rutas huérfanas ni ítems del menú viejo colgando"
 * (`docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3).
 *
 * Un criterio que sólo se verifica a ojo deja de ser cierto en cuanto alguien
 * agrega una página. Este test lo vuelve mecánico, en las dos direcciones:
 *
 *   1. Toda página de `(admin)` tiene un camino declarado: está en el menú, en
 *      una barra de pestañas, en la allowlist de rutas contextuales (con su
 *      motivo escrito) o es un redirect de compat verificado contra el archivo.
 *   2. Todo href del menú y de las pestañas apunta a una página que existe —
 *      lo contrario es el "ítem del menú viejo colgando".
 *
 * No corre la app: lee el árbol de `src/app` y el texto de los componentes de
 * navegación, igual que `route-group-urls.test.ts`.
 */

const projectRoot = path.resolve(__dirname, '..', '..')
const adminDir = path.join(projectRoot, 'src', 'app', '(admin)')

/** Archivos que declaran navegación. Sumar uno acá al crear una barra nueva. */
const NAV_SOURCES = [
  'src/components/layout/admin-sidebar.tsx',
  'src/app/(admin)/settings/SettingsTabs.tsx',
  'src/app/(admin)/caja/components/CajaTabs.tsx',
  'src/app/(admin)/jugadores/ClientesTabs.tsx',
  'src/app/(admin)/grilla/GrillaTabs.tsx',
]

/**
 * Rutas sin ítem propio de navegación, con el link que sí las alcanza. El
 * motivo es obligatorio: si nadie puede escribir por qué una página no está en
 * el menú, esa página no debería existir.
 */
const CONTEXTUAL_ROUTES: Record<string, string> = {
  '/abonados/nuevo': 'CTA "Nuevo turno fijo" en /abonados',
  '/reservas/[id]': 'fila de la lista, "Mientras no estabas" de Hoy y Plata en la calle',
  '/jugadores/[playerId]': 'fila de la lista de clientes y nombre del deudor en Plata en la calle',
  '/torneos/nuevo': 'CTA "Nuevo torneo" en /torneos (solo admin)',
  '/torneos/[id]': 'fila de la lista de torneos',
  '/torneos/[id]/fixture': 'pestaña de TorneoTabs (href dinámico por torneo)',
  '/torneos/[id]/posiciones': 'pestaña de TorneoTabs (href dinámico por torneo)',
  '/torneos/[id]/inscripciones': 'pestaña de TorneoTabs (href dinámico por torneo)',
  '/torneos/[id]/partidos/[matchId]': 'partido del fixture',
}

/**
 * Recorre `dir` una sola vez y arma url → archivo real de `page.tsx`.
 *
 * `(list)`/`(grupo)` son route groups: no aportan segmento de URL, pero SÍ
 * son parte del path real en disco — reconstruir el path desde la URL a mano
 * (join(adminDir, ...url.split('/'), 'page.tsx')) rompe apenas una página se
 * mueve adentro de un grupo. Este map es la única fuente de verdad de "dónde
 * vive el archivo de esta URL".
 */
function walkAdminPages(): Map<string, string> {
  const byUrl = new Map<string, string>()
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        // `(grupo)` y `_privado` no aportan segmento de URL.
        const isGroup = entry.startsWith('(') && entry.endsWith(')')
        const isPrivate = entry.startsWith('_')
        if (isPrivate) continue
        walk(full, isGroup ? segments : [...segments, entry])
      } else if (entry === 'page.tsx') {
        byUrl.set('/' + segments.join('/'), full)
      }
    }
  }
  walk(adminDir, [])
  return byUrl
}

const ADMIN_PAGES = walkAdminPages()

/** URLs de cada `page.tsx`, sin los route groups. */
function adminPageUrls(): string[] {
  return [...ADMIN_PAGES.keys()].sort()
}

/** `href: '/x'` de cualquier archivo de navegación. */
function declaredNavHrefs(): Map<string, string> {
  const found = new Map<string, string>()
  for (const rel of NAV_SOURCES) {
    const src = readFileSync(path.join(projectRoot, rel), 'utf8')
    for (const m of src.matchAll(/href:\s*'(\/[^']*)'/g)) {
      if (!found.has(m[1]!)) found.set(m[1]!, rel)
    }
  }
  return found
}

/**
 * Rutas cuyo `page.tsx` SÓLO redirige: puentes de compat, no huérfanas.
 *
 * El criterio tiene que ser estricto. La primera versión pedía "tiene un
 * `redirect()` y no contiene `return (`", y eso clasificaba como stub a
 * cualquier página con guard de auth — que es el patrón más común del repo:
 * `if (!auth.ok) redirect('/dashboard')` seguido de `return <Componente />`
 * (un solo elemento, sin paréntesis). Con ese agujero, una página realmente
 * huérfana escrita con ese patrón pasaba el test en verde.
 *
 * Un stub de verdad no devuelve nada: no tiene un solo `return`.
 */
function redirectStubs(urls: string[]): Set<string> {
  const stubs = new Set<string>()
  for (const url of urls) {
    const file = ADMIN_PAGES.get(url)!
    const src = readFileSync(file, 'utf8')
    if (/redirect\('\/[^']*'\)/.test(src) && !/\breturn\b/.test(src)) stubs.add(url)
  }
  return stubs
}

describe('navegación admin — cero rutas huérfanas (Fase 4)', () => {
  const urls = adminPageUrls()
  const navHrefs = declaredNavHrefs()
  const stubs = redirectStubs(urls)

  it('hay páginas admin para auditar (si no, el guard no aplica)', () => {
    expect(urls.length).toBeGreaterThan(20)
  })

  it('el menú declara exactamente los 6 espacios más Configuración', () => {
    const sidebar = readFileSync(
      path.join(projectRoot, 'src/components/layout/admin-sidebar.tsx'),
      'utf8',
    )
    const espacios = [...sidebar.matchAll(/href:\s*'(\/[^']*)'/g)].map((m) => m[1]!)
    expect(espacios).toEqual([
      '/dashboard',
      '/grilla',
      '/caja',
      '/jugadores',
      '/torneos',
      '/analiticas',
      // Configuración apunta a la sub-ruta y no al stub `/settings`, que solo
      // hace `redirect('/settings/reservas')`: mismo destino, un render de
      // servidor menos.
      '/settings/reservas',
    ])
  })

  it.each(adminPageUrls())('%s tiene un camino de navegación declarado', (url) => {
    const reachable = navHrefs.has(url) || url in CONTEXTUAL_ROUTES || stubs.has(url)

    expect(
      reachable,
      `La ruta admin ${url} no está en el menú, ni en una pestaña, ni en ` +
        `CONTEXTUAL_ROUTES, ni es un redirect de compat. O le das un camino, o ` +
        `la agregás a CONTEXTUAL_ROUTES de este archivo con el motivo.`,
    ).toBe(true)
  })

  it('ningún ítem del menú apunta a una página inexistente', () => {
    const existing = new Set(adminPageUrls())
    const colgando = [...navHrefs.entries()].filter(([href]) => !existing.has(href))
    expect(colgando, `Ítems de menú sin página: ${JSON.stringify(colgando)}`).toEqual([])
  })

  it('el detector de stubs no confunde una página real con un redirect', () => {
    // `/jugadores` tiene guard (`redirect('/dashboard')` si falla) Y devuelve
    // JSX: es una página de verdad. Si se cuela como "stub", el guard deja de
    // exigirle camino de navegación a cualquier página escrita con ese patrón.
    expect(stubs.has('/jugadores')).toBe(false)
    expect(stubs.has('/grilla')).toBe(false)
    // Y los stubs de verdad sí se detectan.
    expect(stubs.has('/canchas')).toBe(true)
    expect(stubs.has('/jugadores/deudas')).toBe(true)
  })

  it('cada ruta contextual de la allowlist existe y tiene motivo escrito', () => {
    const existing = new Set(adminPageUrls())
    for (const [url, motivo] of Object.entries(CONTEXTUAL_ROUTES)) {
      expect(existing.has(url), `${url} está en la allowlist pero ya no existe`).toBe(true)
      expect(motivo.length, `${url} no tiene motivo`).toBeGreaterThan(10)
    }
  })

  it('robots.txt declara toda ruta admin de primer nivel', () => {
    const robots = readFileSync(path.join(projectRoot, 'src/app/robots.ts'), 'utf8')
    const topLevel = new Set(adminPageUrls().map((u) => '/' + u.split('/')[1]))
    for (const seg of topLevel) {
      expect(robots.includes(`'${seg}'`), `robots.ts no bloquea ${seg}`).toBe(true)
    }
  })
})
