// Edición ffmpeg del video crudo de record.ts: recorta la carga inicial,
// quema subtítulos (captions del timeline), mezcla narración si existe y
// exporta 9:16 1080×1920 H.264 listo para Instagram.
//
// Uso: node scripts/demo/build.mjs <flow> [--audio <narracion.mp3>]
// Entrada:  scripts/demo/out/<flow>/{raw.webm,timeline.json}
// Salida:   scripts/demo/out/<flow>/<flow>-final.mp4
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'node:fs'

const __dir = dirname(fileURLToPath(import.meta.url))

function findFfmpeg() {
  const links = join(process.env.LOCALAPPDATA ?? '', 'Microsoft/WinGet/Links/ffmpeg.exe')
  if (existsSync(links)) return links
  const hits = globSync(
    join(
      process.env.LOCALAPPDATA ?? '',
      'Microsoft/WinGet/Packages/Gyan.FFmpeg*/ffmpeg-*/bin/ffmpeg.exe',
    ),
  )
  if (hits.length) return hits[0]
  return 'ffmpeg' // PATH
}

const FFMPEG = findFfmpeg()

const flowName = process.argv[2]
if (!flowName) {
  console.error('Uso: node scripts/demo/build.mjs <flow> [--audio narracion.mp3]')
  process.exit(1)
}
const audioIdx = process.argv.indexOf('--audio')
const audioPath = audioIdx > -1 ? process.argv[audioIdx + 1] : null

const outDir = join(__dir, 'out', flowName)
const raw = join(outDir, 'raw.webm')
const tl = JSON.parse(readFileSync(join(outDir, 'timeline.json'), 'utf8'))

// ── Corte inicial: el primer goto tarda lo que tarde el dev server en compilar.
// Arrancamos 1.2s antes del primer click/caption POSTERIOR al primer goto real.
const events = tl.timeline
const firstReady = events.find((e) => e.type === 'ready')
const firstAction = events.find((e) => e.type === 'click') ?? events.find((e) => e.type === 'caption' && e.t > 0)
const startMs = Math.max(0, firstReady ? firstReady.t - 300 : (firstAction?.t ?? 0) - 1200)
const endMs = (events.find((e) => e.type === 'done')?.t ?? startMs) + 800

// ── Subtítulos .ass desde los captions (relativos al corte).
function assTime(ms) {
  const cs = Math.max(0, Math.round(ms / 10))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}
// Rangos a excluir (pares cutStart/cutEnd) — se calculan ANTES de los subs
// para poder remapear sus timestamps al video ya recortado.
const cutRangesPre = []
{
  let open = null
  for (const e of events) {
    if (e.type === 'cutStart') open = e.t
    if (e.type === 'cutEnd' && open != null) {
      cutRangesPre.push([open, e.t])
      open = null
    }
  }
}
/** ms absoluto del raw → ms del video final (descuenta startMs y lo cortado antes). */
function remap(t) {
  let cut = 0
  for (const [a, b] of cutRangesPre) {
    if (t >= b) cut += b - a
    else if (t > a) cut += t - a
  }
  return Math.max(0, t - startMs - cut)
}

const captions = events.filter((e) => e.type === 'caption')
const assEvents = captions
  .map((c, i) => {
    const from = remap(c.t)
    const to = Math.max(from + 1500, remap(captions[i + 1]?.t ?? endMs))
    const text = c.text.replace(/\n/g, '\\N')
    return `Dialogue: 0,${assTime(from)},${assTime(to)},Demo,,0,0,0,,${text}`
  })
  .join('\n')

const W = 1080
const H = 1920
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Demo,Arial,64,&H00FFFFFF,&H00FFFFFF,&H00101010,&H88101010,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,110,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${assEvents}
`
const assPath = join(outDir, 'subs.ass')
writeFileSync(assPath, ass)

// ── ffmpeg: trim → scale a 1080×1920 (pad si hace falta) → subs → audio.
const finalPath = join(outDir, `${flowName}-final.mp4`)
// Los paths de filtro en Windows necesitan escape de ':' y '\'.
const assFilter = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,ass='${assFilter}'`

const cutRanges = cutRangesPre
// Keep-segments dentro de [startMs, endMs] excluyendo los cutRanges.
const keep = []
{
  let cursor = startMs
  for (const [a, b] of cutRanges) {
    if (b <= cursor || a >= endMs) continue
    if (a > cursor) keep.push([cursor, Math.min(a, endMs)])
    cursor = Math.max(cursor, b)
  }
  if (cursor < endMs) keep.push([cursor, endMs])
}

const args = ['-y', '-v', 'error', '-i', raw]
if (audioPath) args.push('-i', audioPath)

if (keep.length === 1) {
  args.push('-ss', String(keep[0][0] / 1000), '-to', String(keep[0][1] / 1000))
  // -ss/-to como opciones de OUTPUT no funcionan con -i ya dado; rearmamos:
  args.length = 0
  args.push('-y', '-v', 'error', '-ss', String(keep[0][0] / 1000), '-to', String(keep[0][1] / 1000), '-i', raw)
  if (audioPath) args.push('-i', audioPath)
  args.push('-vf', vf, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p')
  if (audioPath) args.push('-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '160k', '-shortest')
  else args.push('-an')
  args.push(finalPath)
} else {
  // trim+concat: cada segmento se recorta y se re-encadena; los subtítulos van
  // después del concat con timestamps REMAPEADOS (restando lo cortado antes).
  const segs = keep
    .map(
      ([a, b], i) =>
        `[0:v]trim=start=${(a / 1000).toFixed(3)}:end=${(b / 1000).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
    )
    .join(';')
  const concat = keep.map((_s, i) => `[v${i}]`).join('') + `concat=n=${keep.length}:v=1:a=0[vc]`
  const graph = `${segs};${concat};[vc]${vf}[vout]`
  args.push('-filter_complex', graph, '-map', '[vout]', '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p')
  if (audioPath) args.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '160k', '-shortest')
  else args.push('-an')
  args.push(finalPath)
}

execFileSync(FFMPEG, args, { stdio: 'inherit' })
console.log(`final: ${finalPath} (keep: ${keep.map(([a, b]) => `${Math.round(a)}–${Math.round(b)}ms`).join(', ')})`)
