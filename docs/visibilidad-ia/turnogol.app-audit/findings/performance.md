# Performance / Core Web Vitals — turnogol.app

Fecha: 2026-11-02. Estado: FINAL (cortado por límite de turnos; ver "Qué quedó sin medir").

## 1. Puntaje y veredicto

**Puntaje de Performance: 80/100** (laboratorio, mobile primero). Es un criterio editorial, no una métrica de Lighthouse: páginas de embudo mobile (home, explorar, ficha) 74–85, páginas de contenido mobile 93–95, desktop 89–100.

| Métrica | Veredicto en LAB | Detalle |
|---|---|---|
| LCP | **Mobile: inestable/falla en el embudo.** Contenido pasa | Home 1,1–7,1 s según corrida (4 de 6 corridas > 2,5 s). Explorar 4,3 s y ficha 4,2 s (1 corrida cada una). `/para-complejos`, `/precios`, blog: 1,1–1,2 s. Desktop: todo pasa (home 2,2 s es el peor). |
| INP | **No medible en lab.** Riesgo medio | Sin campo ni interacciones simuladas. Proxy TBT mobile 210–560 ms (4x CPU simulado), desktop 5–40 ms. |
| CLS | **Pasa** | 0 a 0,004 en las 12 corridas base. |

Esto es dato de laboratorio, no de campo: **no dice si el sitio pasa Core Web Vitals en el p75 real**. PSI (UI y API v5 sin key) devolvió 429 por cuota diaria del proyecto compartido; no hay CrUX.

## 2. Método

- Lighthouse 13.6.0 (CLI vía `pnpm dlx`, y API Node + puppeteer-core para emular tema). Chrome 64-bit del equipo, headless, throttling **simulado** (Lantern). Mobile = 412x823, 4x CPU, Slow 4G. Desktop = preset desktop. Red real desde Argentina a Vercel gru1.
- TTFB y headers: curl, 3 pruebas por URL.
- **Trampa de método**: el Chrome headless de este equipo hereda el tema oscuro del SO. Las corridas "default" son de un visitante en **dark mode**. El flag `--blink-settings=preferredColorScheme=0` NO lo cambia; lo resolví con `page.emulateMediaFeatures` (puppeteer). Comprobado: en modo claro no se descarga ninguna imagen en la home (733 KB totales contra 1.547 KB en oscuro).
- **Lantern vs observado**: el LCP simulado incluye todo recurso pedido antes del LCP observado. En home, explorar y ficha el LCP observado sin throttling fue 1,34 s / 1,68 s / 1,45 s, mientras el simulado fue 7,1 / 4,3 / 4,2 s. Por eso el número de 7,1 s es un techo pesimista de lab, no una predicción de campo. La dirección del problema (peso de bytes y JS antes del primer pintado) sí es real.

## 3. Resultados medidos

### Mobile (dark mode, 1 corrida; home con más corridas abajo)

| Página | Score | FCP | LCP | TBT | CLS | JS transf. | Total transf. | Elemento LCP |
|---|---|---|---|---|---|---|---|---|
| `/` | 72 | 1,1 s | 7,1 s | 210 ms | 0 | 485 KB | 1.547 KB | texto `p[role=heading]` del hero |
| `/explorar` | 74 | 1,2 s | 4,3 s | 450 ms | 0,004 | 463 KB | 691 KB | texto `p.mt-3` del header |
| `/para-complejos` | 95 | 1,2 s | 1,2 s | 230 ms | 0 | 407 KB | 616 KB | texto |
| `/precios` | 93 | 1,1 s | 1,1 s | 300 ms | 0 | 406 KB | 616 KB | texto |
| `/el-vagon-deportivo` | 79 | 1,1 s | 4,2 s | 310 ms | 0,004 | 478 KB | 708 KB | `img` de portada (AVIF 6,8 KB) |
| `/blog/mejores-sistemas...` | 93 | 1,1 s | 1,1 s | 320 ms | 0 | 400 KB | 604 KB | texto |

### Home mobile, todas las corridas (6)

| Tema | Score | LCP | TBT |
|---|---|---|---|
| oscuro | 72 | 7,1 s | 210 ms |
| oscuro (re-corrida por CLI) | 86 | 2,9 s | 353 ms |
| claro | 79 | 3,1 s | 563 ms |
| claro | 83 | 3,0 s | 429 ms |
| claro | 88 | 1,1 s | 488 ms |
| claro | 86 | 1,1 s | 560 ms |

Mediana de score 84,5. LCP bimodal (1,1 s o 2,9–3,1 s, y un 7,1 s) y TBT de 210 a 563 ms: la varianza entre corridas es grande; una sola corrida no alcanza para esta página.

### Desktop (dark mode, 1 corrida)

| Página | Score | LCP | TBT | CLS |
|---|---|---|---|---|
| `/` | 89 | 2,2 s | 10 ms | 0 |
| `/explorar` | 99 | 0,8 s | 20 ms | 0,001 |
| `/para-complejos` | 100 | 0,3 s | 20 ms | 0 |
| `/precios` | 100 | 0,3 s | 40 ms | 0 |
| `/el-vagon-deportivo` | 100 | 0,7 s | 10 ms | 0,001 |
| blog | 100 | 0,3 s | 40 ms | 0 |

### Servidor / caché (curl)

- `/`, `/para-complejos`, `/precios`, `/el-vagon-deportivo`, blog: `x-vercel-cache: HIT`, `x-nextjs-prerender: 1`, TTFB 130–150 ms en caliente (picos de 300–375 ms con conexión TLS nueva). Brotli activo.
- `/explorar`: dinámica, `cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS`, TTFB 180–410 ms. Dentro del umbral bueno (< 800 ms).

## 4. Hallazgos

### P-1 · High · Fondos PNG del hero (832 KB mobile, 1,95 MB desktop) con AVIF/WebP ya generados y sin usar

- **Métrica**: LCP y bytes en la primera pantalla (mobile y desktop en dark mode).
- **Evidencia**: home mobile oscuro descarga `https://turnogol.app/bg-hero-2.png` = 813 KB de 1.547 KB totales (52%); el insight `image-delivery` estima 642 KiB de ahorro. Home desktop oscuro: `bg-hero-desktop.png` = 1.946 KB de 2.654 KB totales; es la única página desktop con LCP 2,2 s (las otras 0,3–0,8 s) y score 89. En modo claro mobile no se baja ninguna imagen (733 KB totales). En `/public` existen `bg-hero-2.avif` (96 KB), `.webp` (131 KB), `bg-hero-desktop.avif` (64 KB), `.webp` (106 KB), generados el 2026-08-18 y sin referencias en `src`.
- **Causa en el repo**: `src/app/home/HeroMobile.tsx:21` (`backgroundImage: "url('/bg-hero-2.png')"`) y `src/app/home/HeroDesktop.tsx:22` (`"url('/bg-hero-desktop.png')"`). Es el F-006 de `docs/qa/PROD_QA_2026-08-17.md`, quedó a medio hacer: se convirtieron los archivos pero nunca se cambió la referencia. Un fondo CSS con `url()` es candidato a LCP en Chrome; en campo el LCP puede terminar siendo esta imagen, no el título.
- **Fix**: mover el fondo a una clase en `globals.css` con declaración de respaldo y `image-set()` (el PNG primero, después el `image-set` con `type('image/avif')`, `type('image/webp')` y el PNG), no inline, para que un navegador sin `image-set` conserve el PNG. Mobile además puede bajar de resolución (la capa va a `opacity-30` con máscara). El CSP `img-src 'self'` ya lo permite. Después borrar los PNG si nadie más los usa.
- **Cómo sabríamos que falló**: Lighthouse mobile oscuro de `/` con `image-delivery-insight` vacío y transferencia de imágenes < ~150 KB; desktop oscuro < ~100 KB; LCP de `/` mobile por debajo de 2,5 s en 3 de 3 corridas; p75 de `web-vital:LCP` de `/` en Sentry.

### P-2 · High (lab) · LCP mobile > 2,5 s en home, explorar y ficha

- **Métrica**: LCP.
- **Evidencia**: home 1,1–7,1 s (4 de 6 corridas > 2,5 s); explorar 4,3 s; ficha 4,2 s. Observado sin throttling: 1,34 / 1,68 / 1,45 s con TTFB 120–310 ms y "element render delay" de 1,2–1,4 s en las tres. El elemento LCP de home y explorar es texto; el de la ficha es una imagen de 6,8 KB cuya carga dura 73 ms. O sea: no es la imagen ni el servidor, es el tiempo hasta el primer pintado más la cola de JS que el simulador mete en la ventana.
- **Causa probable (no confirmada con traza)**: JS que se hidrata antes del primer pintado (ver P-3), 2 CSS bloqueantes (P-6) y, solo en home oscuro, P-1. En explorar suma el SSR no cacheable (P-5).
- **Fix**: resolver P-1, P-3 y P-4; recién después re-medir. No hay un cambio puntual que arregle esto solo.
- **Cómo sabríamos que falló**: 5 corridas por página (mediana) con LCP mobile ≤ 2,5 s; y, lo que de verdad decide, CrUX/PSI p75 de LCP ≤ 2,5 s cuando haya key.

### P-3 · Medium · Cadena de JS: ~400–485 KB por página, incluso las estáticas, y el SDK de Sentry sin recortar

- **Métrica**: TBT (proxy de INP) y LCP.
- **Evidencia**: blog y `/precios`, páginas sin interacción, bajan 400–406 KB de JS. En home: 18 chunks iniciales (~244 KB; el mayor `1v54029_6sf0y.js` = 75,9 KB, react-dom) y otros 17 después de hidratar. Chunk `3lqogcvmcguz2.js` = 141,8 KB transferidos / 434 KB crudos, 75% sin usar según Lighthouse (106 KiB), contiene 90 apariciones de "replay"; genera un long task de 171 ms. Home: 5 long tasks (171, 118, 116, 85, 68 ms), 1,05 s de evaluación de scripts. Polyfills heredados: 25 KiB (`Array.prototype.at/flat/flatMap`, `Object.fromEntries/hasOwn`, `trimStart/End`, `Array.from`).
- **Causa en el repo**: `instrumentation-client.ts` ya difiere el SDK (`import()` en `requestIdleCallback`, bien), pero `filterReplay` solo lo saca de los integrations en runtime: el código de Replay sigue en el bundle. En `next.config.ts` la única optimización de Sentry es `webpack: { treeshake: { removeDebugLogging: true } }`, que es **solo para webpack**; este build es Turbopack, así que no aplica. Verificado en `node_modules/@sentry/nextjs` 10.78.0 (`types/config/types.d.ts`): el `bundleSizeOptimizations` de nivel superior "works for both webpack and Turbopack builds" (`excludeDebugStatements`, `excludeReplayIframe`, `excludeReplayShadowDom`, `excludeReplayWorker`, `excludeTracing`).
- **Fix**: agregar `bundleSizeOptimizations: { excludeDebugStatements: true, excludeReplayIframe: true, excludeReplayShadowDom: true, excludeReplayWorker: true }` a `withSentryConfig` (dejar `excludeTracing` en false: se usa `tracesSampleRate: 0.1`). Medir el chunk antes/después con `ANALYZE=true pnpm build` (el ahorro real no está medido; no prometo cifra). Revisar `browserslist` para sacar los polyfills si el objetivo mínimo lo permite.
- **Cómo sabríamos que falló**: el chunk de Sentry no baja de tamaño en `ANALYZE`, o el long task de init sigue > 100 ms, o el TBT mobile de `/precios` y blog no baja de ~300 ms.

### P-4 · Medium · Tormenta de prefetch en la home tras hidratar

- **Métrica**: TBT/INP (indirecto) y datos móviles.
- **Evidencia**: en la primera corrida de home, entre ~1,3 y ~3,1 s aparecen ~20 requests `_rsc` de prefetch y ~16 chunks JS extra (~99 KB sin contar Sentry), incluyendo rutas que un visitante anónimo no puede usar: `/mis-reservas`, `/configuracion`, `/ingresar`, `/rival`. Varias se piden dos veces con distinto `_rsc`.
- **Causa probable (NO verificada leyendo los componentes)**: `<Link>` con prefetch por defecto en `PlayerBottomNav` (ítems `/explorar`, `/rival`, `/mis-reservas`, `/configuracion`), `SiteNav` y `SiteFooter`, que viven en `src/components/site/`.
- **Fix**: `prefetch={false}` en los links de rutas de sesión mientras `session` sea `null` en `PortalSessionProvider`; dejar el prefetch solo en `/explorar` y `/para-complejos`.
- **Cómo sabríamos que falló**: más de ~5 requests `_rsc` en los primeros 5 s de la home sin sesión.

### P-5 · Medium · `/explorar` mobile: TBT 450 ms y SSR sin caché

- **Métrica**: LCP y TBT.
- **Evidencia**: score 74, TBT 450 ms (el más alto de las seis; JS 463 KB, similar al resto, así que parte puede ser ruido de una sola corrida), TTFB 180–410 ms, `cache-control: private, no-store`.
- **Causa en el repo**: `src/app/(public)/explorar/page.tsx` es siempre dinámica (lee `searchParams` y cookies para favoritos; el comentario del archivo lo reconoce y deja PPR/Cache Components como discusión aparte). Los datos sí están cacheados con `unstable_cache` 5 min.
- **Fix**: no cambiar la estrategia de render por esto. Primero medir 5 corridas para descartar ruido; si se confirma, evaluar mover favoritos al cliente (`PortalSessionProvider` ya expone `favoriteTenantIds` desde `/api/player/session`) para que la carga sin filtros pueda cachearse. Es decisión de arquitectura, no un arreglo menor.
- **Cómo sabríamos que falló**: TBT de `/explorar` mobile sigue > 300 ms en la mediana de 5 corridas.

### P-6 · Low · CSS bloqueante y fuentes

- **Métrica**: FCP/LCP.
- **Evidencia**: 2 hojas bloqueantes (44,1 KB + 1,3 KB transferidos; `main.css` = 329 KB crudos, Tailwind 4), ahorro estimado 210 ms. Fuentes: 3 woff2 precargados, 107 KB (Inter 47,6, Archivo 34,4, Sora 24,9), con `display: swap` y fallbacks con `size-adjust` generados por `next/font`: el insight `font-display` y el CLS salen limpios.
- **Causa**: `src/app/layout.tsx` carga tres familias (Inter, Archivo, Sora 600/700/800); Sora solo se usa en el logotipo.
- **Fix**: nada urgente. Si se quiere recortar, evaluar si Sora puede resolverse con Archivo en el wordmark (decisión de diseño, no de performance; DESIGN.md manda).
- **Falla si**: el FCP mobile sube de 1,1–1,2 s.

### P-7 · Low · CLS 0,004 en la ficha por la barra inferior del jugador

- **Métrica**: CLS.
- **Evidencia**: `layout-shifts` de la ficha: único desplazamiento 0,004 en `nav.fixed > a` ("Reservas", `/mis-reservas`).
- **Causa en el repo**: `src/components/site/PlayerBottomNav.tsx:66` arma `items` según `rivalEnabled`, que llega después de `/api/player/session` (`PortalSessionProvider`, "false mientras hidrata"). Al activarse el flag cambia el reparto de los `flex-1`. Hoy es despreciable, pero crece si el flag RIVAL se prende para más usuarios.
- **Fix**: reservar el espacio del ítem Rival (o renderizarlo siempre oculto con ancho fijo) hasta resolver la sesión.
- **Falla si**: CLS de cualquier página con barra inferior > 0,02.

### P-8 · Low · Detalles menores

- La ficha ya usa `priority` en la portada (`ComplexHero.tsx`) y la imagen sale AVIF de 6,8 KB; Lighthouse marca `priorityHinted: false`. Agregar `fetchPriority="high"` explícito si no lo emite. Impacto bajo.
- `manifest.webmanifest` se pide dos veces en la home (55 B y 1.563 B).
- TTFB con TLS nuevo llega a 300–410 ms en algunas pruebas; es red, no servidor (gru1 con HIT).

## 5. Lo que está bien (no tocar)

TTFB 130–150 ms con HIT en gru1; páginas de marketing y blog estáticas (ISR, `revalidate` 300); brotli; imágenes de complejos por `next/image` con AVIF y TTL de 1 año; CLS ~0; fuentes self-hosted con fallback ajustado; Sentry ya cargado de forma diferida; DOM chico (250 elementos en home).

## 6. Qué quedó sin medir

- **Sin datos de campo**: no hay CrUX ni PSI (429). Nada de este informe prueba aprobar o fallar el p75 real.
- **INP**: sin interacciones simuladas (buscador del hero, menú, selección de fecha). TBT es solo un proxy.
- **Modo claro**: medido solo en la home mobile (4 corridas). Sin medir en claro: explorar, ficha, `/para-complejos`, `/precios`, blog (estas tres últimas son siempre oscuras por su layout, así que el cambio esperado es nulo) y todo desktop.
- **Repeticiones**: explorar, ficha, `/para-complejos`, `/precios` y blog tienen **una sola corrida** mobile y una desktop. Dada la varianza vista en la home (score 72–88), sus números son orientativos.
- **No cubierto**: fichas de complejo sin portada u otras fichas distintas de El Vagón; otros posts del blog; `/explorar` con filtros; sesión iniciada (aparece la barra inferior y el avatar); iOS/Safari; dispositivos reales; throttling aplicado (DevTools) como contraste de Lantern.
- **Proceso en background**: un batch de Lighthouse (modo claro y repeticiones) quedó corriendo en el scratchpad cuando se pidió cortar. No se pudo detener (el clasificador bloqueó el `kill`, y `taskkill chrome.exe` habría matado el Chrome del usuario). Solo escribe en el scratchpad y termina solo; sus resultados no están incluidos acá salvo las 3 primeras corridas de la home en modo claro, que ya estaban en el log.

## 7. JSON para audit-data.json (categoría Performance)

```json
{
  "category": "Performance",
  "score": 80,
  "data_type": "lab",
  "tool": "Lighthouse 13.6.0 local (simulated throttling); PSI/CrUX unavailable (429)",
  "cwv_lab": {
    "lcp": "mobile unstable/fail on funnel pages (home 1.1-7.1s, explorar 4.3s, ficha 4.2s); content pages 1.1-1.2s",
    "inp": "not measurable in lab; TBT mobile 210-560ms",
    "cls": "pass (0-0.004)"
  },
  "findings": [
    {"id": "P-1", "severity": "High", "metric": "LCP/bytes", "summary": "bg-hero-2.png 832KB and bg-hero-desktop.png 1.95MB served; AVIF/WebP exist unused", "file": "src/app/home/HeroMobile.tsx:21, src/app/home/HeroDesktop.tsx:22"},
    {"id": "P-2", "severity": "High", "metric": "LCP", "summary": "Mobile LCP >2.5s in 4/6 home runs, explorar and ficha (lab, single run for last two)", "file": "src/app/layout.tsx"},
    {"id": "P-3", "severity": "Medium", "metric": "TBT/INP", "summary": "400-485KB JS per page; Sentry chunk 142KB (434KB raw) without bundleSizeOptimizations", "file": "next.config.ts, instrumentation-client.ts"},
    {"id": "P-4", "severity": "Medium", "metric": "TBT/data", "summary": "~20 RSC prefetches + ~16 JS chunks after hydration on home, including auth-only routes", "file": "src/components/site/PlayerBottomNav.tsx"},
    {"id": "P-5", "severity": "Medium", "metric": "LCP/TBT", "summary": "/explorar dynamic no-store, TBT 450ms mobile (single run)", "file": "src/app/(public)/explorar/page.tsx"},
    {"id": "P-6", "severity": "Low", "metric": "FCP", "summary": "2 render-blocking CSS (44KB), 3 preloaded fonts 107KB", "file": "src/app/layout.tsx"},
    {"id": "P-7", "severity": "Low", "metric": "CLS", "summary": "0.004 shift from bottom nav when rivalEnabled resolves", "file": "src/components/site/PlayerBottomNav.tsx:66"},
    {"id": "P-8", "severity": "Low", "metric": "LCP", "summary": "priorityHinted=false on ficha cover; manifest requested twice", "file": "src/app/(public)/[slug]/components/ComplexHero.tsx"}
  ]
}
```
