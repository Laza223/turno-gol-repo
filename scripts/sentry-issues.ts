/**
 * Lee los errores de Sentry desde la línea de comandos.
 *
 *   pnpm sentry:issues                    # sin resolver, últimas 24h
 *   pnpm sentry:issues 14d                # otra ventana
 *   pnpm sentry:issues 24h --all          # incluye los resueltos/ignorados
 *   pnpm sentry:issues --detail TURNOGOL-3A   # stack trace del último evento
 *
 * Existe porque el diagnóstico de un bug de producción no debería depender de
 * abrir un dashboard: así sale en texto, se puede grepear, y un agente lo puede
 * correr sin sesión de navegador. Complementa a los logs de Vercel, que solo
 * ven el servidor — Sentry además captura los errores del navegador del
 * usuario.
 *
 * Las credenciales salen del env file (default `.env.production`, configurable
 * con `SENTRY_ENV_FILE`) y NUNCA se imprimen. Mismo patrón que launch-check.ts.
 */
import { config } from 'dotenv'

config({ path: process.env.SENTRY_ENV_FILE ?? '.env.production', override: true })

const API = 'https://sentry.io/api/0'

type Issue = {
  shortId: string
  title: string
  culprit: string | null
  level: string | null
  count: string
  userCount: number
  firstSeen: string
  lastSeen: string
  permalink: string
  status: string
}

type EventEntry = {
  type: string
  data?: {
    values?: Array<{
      type?: string
      value?: string
      stacktrace?: { frames?: Array<{ filename?: string; function?: string; lineNo?: number }> }
    }>
  }
}

type LatestEvent = {
  id: string
  dateCreated: string
  entries?: EventEntry[]
  tags?: Array<{ key: string; value: string }>
}

class SalidaLimpia extends Error {}

/**
 * `SENTRY_READ_TOKEN` primero, `SENTRY_AUTH_TOKEN` como fallback.
 *
 * No son intercambiables: el `SENTRY_AUTH_TOKEN` que ya vive en el proyecto es
 * el que usa el plugin de Next para SUBIR sourcemaps en el build, y con el
 * scope `project:releases` alcanza. Leer issues necesita `event:read`, que ese
 * token no tiene — devuelve 403. Se separan para no tener que ampliarle los
 * permisos al token que corre en cada build.
 */
function credenciales(): { token: string; org: string; project: string } {
  const token = process.env.SENTRY_READ_TOKEN ?? process.env.SENTRY_AUTH_TOKEN
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  const faltan = [
    !token && 'SENTRY_READ_TOKEN (o SENTRY_AUTH_TOKEN)',
    !org && 'SENTRY_ORG',
    !project && 'SENTRY_PROJECT',
  ].filter(Boolean)
  if (faltan.length > 0) {
    throw new SalidaLimpia(
      `Faltan variables en ${process.env.SENTRY_ENV_FILE ?? '.env.production'}: ${faltan.join(', ')}`,
    )
  }
  return { token: token!, org: org!, project: project! }
}

async function pedir<T>(path: string): Promise<T> {
  const { token } = credenciales()
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    // El token nunca sale por acá: solo el path y lo que devolvió Sentry.
    const cuerpo = (await res.text()).slice(0, 400)
    let msg = `Sentry ${res.status} ${res.statusText} en ${path}`
    if (res.status === 403) {
      msg +=
        '\n\nEl token autentica pero no tiene permiso de lectura. Creá uno con scope' +
        '\n`event:read` + `project:read` en https://sentry.io/settings/account/api/auth-tokens/' +
        '\ny guardalo como SENTRY_READ_TOKEN (no pises SENTRY_AUTH_TOKEN: ese lo usa el' +
        '\nbuild para subir sourcemaps).'
    }
    if (cuerpo) msg += `\n${cuerpo}`
    throw new SalidaLimpia(msg)
  }
  return (await res.json()) as T
}

function listar(issues: Issue[], periodo: string): void {
  if (issues.length === 0) {
    console.log(`Sin issues en las últimas ${periodo}.`)
    return
  }
  console.log(`${issues.length} issue(s), últimas ${periodo}:\n`)
  for (const i of issues) {
    const nivel = (i.level ?? '?').toUpperCase().padEnd(7)
    console.log(`${nivel} ${i.count.padStart(5)}x  ${i.shortId}  ${i.title}`)
    if (i.culprit) console.log(`        en ${i.culprit}`)
    console.log(`        último ${i.lastSeen} · ${i.userCount} usuario(s) · ${i.status}`)
    console.log(`        ${i.permalink}`)
    console.log()
  }
  console.log(`Detalle de uno:  pnpm sentry:issues --detail ${issues[0]!.shortId}`)
}

function detalle(evento: LatestEvent): void {
  console.log(`Evento ${evento.id} — ${evento.dateCreated}\n`)

  const excepcion = evento.entries?.find((e) => e.type === 'exception')
  const valores = excepcion?.data?.values ?? []
  for (const v of valores) {
    console.log(`${v.type ?? 'Error'}: ${v.value ?? ''}`)
    // Sentry devuelve los frames de más externo a más interno; el que rompió es
    // el último, así que se muestran al revés (igual que un stack trace normal).
    const frames = [...(v.stacktrace?.frames ?? [])].reverse().slice(0, 12)
    for (const f of frames) {
      console.log(`    ${f.filename ?? '?'}:${f.lineNo ?? '?'}  ${f.function ?? ''}`)
    }
    console.log()
  }
  if (valores.length === 0) console.log('(el evento no trae stack trace)\n')

  // Los tags dicen ruta, release y entorno — casi siempre alcanzan para ubicarlo.
  const tags = evento.tags ?? []
  const interesantes = ['environment', 'release', 'url', 'transaction', 'server_name', 'level']
  const mostrar = tags.filter((t) => interesantes.includes(t.key))
  if (mostrar.length > 0) {
    console.log('Tags:')
    for (const t of mostrar) console.log(`    ${t.key} = ${t.value}`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const { org, project } = credenciales()

  const iDetalle = args.indexOf('--detail')
  if (iDetalle >= 0) {
    const shortId = args[iDetalle + 1]
    if (!shortId) throw new SalidaLimpia('Uso: pnpm sentry:issues --detail <SHORT-ID>')
    // El endpoint por shortId necesita resolverse primero al id numérico.
    const encontrados = await pedir<Issue[]>(
      `/projects/${org}/${project}/issues/?query=${encodeURIComponent(shortId)}&statsPeriod=90d`,
    )
    const issue = encontrados[0] as (Issue & { id?: string }) | undefined
    if (!issue?.id) {
      throw new SalidaLimpia(`No encontré el issue ${shortId} en los últimos 90 días.`)
    }
    detalle(await pedir<LatestEvent>(`/issues/${issue.id}/events/latest/`))
    return
  }

  const periodo = args.find((a) => /^\d+[hd]$/.test(a)) ?? '24h'
  const todos = args.includes('--all')
  const query = todos ? '' : 'is:unresolved'

  const issues = await pedir<Issue[]>(
    `/projects/${org}/${project}/issues/?statsPeriod=${periodo}` +
      `&query=${encodeURIComponent(query)}&limit=25`,
  )
  listar(issues, periodo)
}

// `process.exit()` en medio de un fetch pendiente hace explotar libuv en
// Windows con un assert feo que tapa el mensaje real. Se setea el código y se
// deja terminar al proceso solo.
main().catch((err: unknown) => {
  console.error(err instanceof SalidaLimpia ? err.message : err)
  process.exitCode = 1
})
