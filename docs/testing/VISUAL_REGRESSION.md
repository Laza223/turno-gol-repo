# Regresión visual

8 fotos de pantalla completa que vigilan una sola clase de bug: **un cambio en
`globals.css`, en un token de Tailwind o en una fuente que rompe el layout de una
pantalla que no abriste en tres semanas.** Nada más.

Todo lo que se pueda afirmar con un assert de texto va en un spec funcional.

## Estado: ADVISORY

Job `visual-regression` de `ci.yml`, con `continue-on-error: true` a nivel **job**.
No bloquea nada todavía.

> **El color del check no dice nada.** Con `continue-on-error`, GitHub reporta el
> job como `success` aunque los tests hayan fallado adentro. Para saber si comparó
> hay que abrir el log. Ya engañó dos veces: hay que leer el `N passed` / `N
> failed`, no el ✓.

**Se endurece** después de 10 PRs consecutivos sin una sola falsa alarma. El
contador arranca en el primer run que **realmente comparó las 8**, y hasta ahora
ninguno lo hizo:

| Época | Qué pasaba |
|---|---|
| `be8813a` → fix del path | las 8 fallaban con `A snapshot doesn't exist`: las baselines estaban en un path que `snapshotPathTemplate` no mira |
| fix del path → 2026-07-29 | el step compartía runner con la suite @critical y las 3 fotos de admin de escritorio morían en `page.goto` sin comparar (30s, después 90s) |
| desde el job propio | pendiente: el primer run que compare 8/8 arranca el contador |
**Se borra** si a las 6 semanas nunca llegó a 10 seguidos. La conclusión en ese
caso no es aflojar el umbral — es que la pieza no se ganó el lugar. Ver el ADR:
`docs/decisions/2026-07-29-regresion-visual.md`.

## Las 8 fotos

| Project | Foto | Auth | Por qué esta |
|---|---|---|---|
| `visual` | `login.png` | — | El canario perfecto: cero datos, cero fechas, cero auth. Si se rompe, es el CSS base o una fuente, y no hay otra explicación posible |
| `visual` | `landing.png` | — | Superficie de conversión #1, la que más se toca |
| `visual` | `perfil-publico.png` | — | Superficie de conversión #2 |
| `visual` | `admin-grilla.png` | admin | La pantalla del producto: donde el complejo pasa el día |
| `visual` | `admin-canchas.png` | admin | Shell de lista del admin — representa `/staff`, `/jugadores`, `/abonados` |
| `visual` | `admin-settings-reservas.png` | admin | Formulario denso — representa todos los formularios |
| `visual-mobile` | `perfil-publico-mobile.png` | — | El 70% del tráfico público es mobile |
| `visual-mobile` | `admin-grilla-mobile.png` | admin | Layout propio (GridScroller, banda de madrugada): la que más se rompe y la que menos se mira |

**Fuera de alcance a propósito**: `/caja` y `/reportes` (dependen fuerte de "hoy"
y de agregaciones — el seed fijo cuesta más de lo que aportan) y `/dashboard`
(checklist de onboarding con estado mutante).

`tests/e2e/capture-screenshots.spec.ts` **no** es esto: es un capturador manual
para auditoría UX que escribe a `docs/audit/screenshots/`. No compara nada y no
se toca.

El project `visual` lista **9** tests y no 8: el noveno es
`stylepath-guard.spec.ts`, que no compara ninguna baseline (ver más abajo).

## Cómo se logra el determinismo

| Problema | Solución |
|---|---|
| Las fechas se renderizan en **Server Components** | `page.clock` NO alcanza (solo intercepta el browser). Se pinnea la fecha por URL: `/grilla?date=2030-06-17` |
| La línea roja de "ahora" se mueve | Sale gratis: `useNowLine` devuelve `null` cuando `artNow.date !== date` (`src/hooks/use-now-line.ts:28`). Con la fecha pinneada a una distinta de hoy, no se dibuja |
| `useArtNow` / `ExpiryCountdown` leen `Date.now()` en el cliente | `page.clock.setFixedTime(FROZEN_NOW)`. Misma constante que Storybook |
| Los seeds funcionales usan fechas relativas | Seed propio (`tests/e2e/visual/_seed.ts`) con UUIDs, horarios y fecha **absolutos**, idempotente |
| Animaciones | `reducedMotion: 'reduce'` engancha el `@media` que ya existe en `globals.css`. Cero CSS nuevo, y de paso se fotografía el camino accesible |
| Banner de push (`fixed bottom-left z-40`) | `addInitScript` + `localStorage` antes del primer `goto` |
| Overlay de devtools de Next | `stylePath` → `tests/e2e/visual/screenshot.css` lo hace `display: none` al momento de la foto. `devIndicators: false` (`next.config.ts`) se mantiene, pero **no alcanza solo**: apaga el indicador, no el portal — ver abajo |
| Disponibilidad del perfil público | **No se estabiliza**: se clampea a `[hoy, hoy+anticipación]` en cliente Y servidor. Se enmascara ese bloque por su `aria-label` |

Los projects declaran `viewport`, `deviceScaleFactor`, `colorScheme`, `locale` y
`timezoneId` **explícitos** en vez de heredarlos de `devices[]`: un bump de
Playwright puede cambiar el descriptor del device e invalidar todas las baselines
en silencio.

### Por qué la regresión visual tiene su propio job (RESUELTO 2026-07-29)

Vivía como **step** del job de E2E, después de `--grep @critical`, sobre el mismo
runner de 2 cores. El razonamiento era de costo: el stack (Supabase + migraciones +
browsers) cuesta ~8 min y ahí ya estaba pago, así que un job aparte sumaba ~9 min de
minutos facturados para ahorrar ~70s de wall clock.

**Ese step no podía terminar.** Las 3 fotos de admin de escritorio morían en
`page.goto` sin llegar a comparar — auth + queries + compilación en frío de
Turbopack sobre un runner que la suite @critical ya dejó saturado:

| Run | `navigationTimeout` | Resultado |
|---|---|---|
| 30494580493 | 30s | las de admin mueren con `Timeout 30000ms exceeded` |
| 30498550346 | 90s | **igual**, más un panic de Turbopack (`aggregation_update.rs:1677`) *después* de las 2 primeras fallas, o sea consecuencia y no causa |

La prueba de que la causa era compartir el runner y no las fotos: `visual-baseline.yml`
corre **exactamente los mismos 9 tests** sobre un runner fresco en ~2 min, 9/9 verde.
Mismo commit, mismo stack, mismo browser.

Así que se movió a su propio job (`visual-regression`), que además cuelga solo de
`lint-and-types` + `unit-tests` y corre **en paralelo** con integración y e2e: los
~9 min son de minutos facturados, no de wall clock. Un gate que no compara 3 de 8
fotos no es un gate, y ese es el precio de que exista.

Los `timeout: 180s` + `navigationTimeout: 90s` de los projects visuales quedan como
margen para la compilación en frío, no como línea de flotación.

### El overlay de dev se oculta con CSS, no se enmascara (RESUELTO)

**El problema (medido el 2026-07-29).** El overlay de devtools de Next se
enmascaraba con `devChrome(page)` (`nextjs-portal` + `[data-nextjs-toast]`). Pero
un `mask` de Playwright no oculta: **pinta una caja magenta** (`#FF00FF` exacto)
del tamaño del elemento. Esa caja mide 101×36 px abajo a la izquierda — 0.28% de
una foto de escritorio (1440×900), pero **1.09% de una mobile** (393×851). O sea
que su sola aparición o desaparición movía el diff por encima de
`maxDiffPixelRatio: 0.01` sin que hubiera cambiado un pixel de producto: entre las
baselines de `e1f1284` y las de `0c09296`, `perfil-publico-mobile.png` dio 1.15% de
diff, del cual 1.09% era la caja (presente en la vieja, ausente en la nueva) y
225 px (0.07%) la pantalla.

Y era intermitente **dentro de la misma corrida**. Contando pixeles `#FF00FF` en
las 8 baselines de `0c09296` (mismo `pnpm dev`, misma sesión):

| Foto | `#FF00FF` | Qué es |
|---|---|---|
| `visual/landing.png` | 3636 px (0.281%) — bbox 101×36 en `[20,844]` | caja del overlay |
| `visual/admin-settings-reservas.png` | 3636 px (0.281%) — bbox 101×36 en `[20,844]` | caja del overlay |
| `visual/login.png`, `visual/admin-canchas.png`, `visual/admin-grilla.png`, `visual-mobile/admin-grilla-mobile.png` | 0 | el overlay no pintó |
| `visual/perfil-publico.png` | 83820 px (6.468%) — bbox 1270×66 | mask de la grilla de disponibilidad (legítimo, se queda) |
| `visual-mobile/perfil-publico-mobile.png` | 0 | la grilla de disponibilidad queda abajo del fold de 851 px, así que su mask no entra al cuadro |

2 de 6 fotos de escritorio con caja y 4 sin: eso es exactamente la moneda al aire
que movía el gate.

**Después del fix** (baselines del run 30497324106): las 7 fotos que no enmascaran
nada dan **0 pixeles `#FF00FF`**, y `perfil-publico.png` conserva sus 83820 px en el
mismo bbox de siempre. Es un invariante estructural, no una convención: sin `mask`
en la llamada, Playwright no tiene con qué pintar. `landing.png` y
`admin-settings-reservas.png` cambiaron 0.615% cada una, en bbox
`[1,836..139,899]` — el pill del overlay más su sombra, más grande que los 101×36
de la caja magenta que lo tapaba. Las otras 6 quedaron byte-idénticas.

> Si volvés a medir esto, el contador de `#FF00FF` sirve para el mask, no para todo:
> un diff exacto byte a byte NO es el diff que mira el gate. `threshold: 0.2` es
> perceptual (YIQ), así que hay fotos byte-distintas que la comparación considera
> iguales — ver la nota del DPR 2 más abajo.

**Por qué `devIndicators: false` no lo evitaba.** Porque no apaga el overlay,
apaga el *indicador*. Verificado contra Next 16.2.11:

| Pieza | Qué hace |
|---|---|
| `next/dist/client/app-next-dev.js` | llama `renderAppDevOverlay(...)` en un `finally`, **sin condición** |
| `renderAppDevOverlay` (`next/dist/compiled/next-devtools/index.js`) | monta `<script data-nextjs-dev-overlay="true" style="display:block;position:absolute">` con un `<nextjs-portal>` adentro, y le engancha un shadow root |
| `devIndicators: false` (`next/dist/build/define-env.js`) | define `process.env.__NEXT_DEV_INDICATOR=false`, que gatea el **contenido** del indicador — no el montaje del portal |

O sea: en `next dev` el portal está **siempre**. Lo intermitente era qué
renderizaba adentro, y por lo tanto si el mask tenía caja que pintar o no.

**El fix.** `expect.toHaveScreenshot.stylePath` en `playwright.config.ts` apunta a
`tests/e2e/visual/screenshot.css`: Playwright lo inyecta antes de cada foto y lo
saca después. Ese CSS hace `display: none` de todo el árbol de devtools. Dos
propiedades que el mask no tenía:

- **`display: none` no pinta.** El pixel queda idéntico esté el overlay montado o
  no — que era todo el punto.
- **`stylePath` atraviesa el Shadow DOM** (documentado en la API de Playwright).
  El indicador (`[data-nextjs-toast]`) vive adentro del shadow root, donde un
  `<style>` normal del documento no llega.

No mueve el layout del producto: los dos contenedores que Next monta son
`position: absolute` (fuera de flujo) y el host es un custom element vacío.

**Cómo se sabe que sigue funcionando.** Todo esto se rompe en silencio: si el CSS
deja de matchear, el overlay simplemente vuelve a las fotos. Tres guards, cada uno
cubriendo una mitad distinta del contrato:

| Guard | Qué prueba | Dónde corre |
|---|---|---|
| `tests/unit/playwright-visual-config.test.ts` | que el `stylePath` esté cableado y apunte a un archivo que existe y no está vacío; que nadie aflojó `maxDiffPixelRatio`/`threshold`; que ningún project defina su propio `expect`; que las baselines estén donde `snapshotPathTemplate` las busca | job **bloqueante** (`pnpm test`) |
| `tests/e2e/visual/stylepath-guard.spec.ts` | que el CSS realmente borre del pixel un overlay con la estructura de Next 16 (host + shadow root), por equivalencia de bytes contra el mismo DOM sin overlay. Con control negativo, para no pasar por vacuidad | project `visual` |
| `assertDevOverlayHookExists(page)` en la foto `login` | que el Next real siga montando uno de esos hooks. El guard de arriba usa un fixture sintético; este verifica que el fixture no quedó viejo | project `visual` |

Los dos primeros están mutation-tested: comentar el `stylePath` del config pone
rojo al unit test, y renombrar los selectores de `screenshot.css` pone rojo al
guard e2e.

Ojo con el detalle de Playwright que descubrió el tercer chequeo del unit test:
`expect` del project se resuelve con `takeFirst(projectConfig.expect,
config.expect, {})` — **no hay merge**. Un `expect` a nivel project descartaría el
global entero (`stylePath`, `threshold` y `maxDiffPixelRatio` de una) y las fotos
seguirían "pasando" con los defaults de Playwright. Por eso el `stylePath` va en el
`expect` de arriba y no en los projects.

**Descartado: correr las fotos contra `next build` + `next start`.** Es el fix de
raíz (no hay overlay en producción), pero el `webServer` es **uno** para las 8
suites de e2e y el mock de MercadoPago se apaga con `NODE_ENV=production`
(`computeMpMockEnabled` en `mock-mp.ts`) — ver el comentario del step de e2e en
`ci.yml`. Cambiarlo por estas 8 fotos rompería los flujos de checkout de todos los
demás specs.

**Descartado: aflojar `maxDiffPixelRatio`.** Tapa el síntoma y baja la
sensibilidad del gate justo en las fotos mobile, que son las que más se rompen.

> Los specs visuales usan el fixture `page` + `test.use({ storageState })`, **no**
> `browser.newContext({ storageState })` como el resto de los specs del repo. Un
> contexto creado a mano no hereda el `use` del project, y ahí se perderían las
> seis opciones de las que depende que un pixel sea reproducible.

## Regenerar las baselines

Se generan **solo en Linux/CI**. El desarrollo es en Windows y CI corre en
`ubuntu-latest`: el renderizado de texto difiere y los PNG nunca matchean.

> La salida fácil —generarlas en `mcr.microsoft.com/playwright`— tampoco sirve:
> esa imagen trae un set de fuentes curado distinto al del runner de GitHub, así
> que tampoco matchearía. Y además expondría un `node_modules` instalado por pnpm
> **en Windows** adentro de un container Linux, con shims `.cmd` y binarios
> nativos de la plataforma equivocada (`esbuild`, `sharp`, `unrs-resolver`).

```powershell
# 1) Pusheás el spec visual nuevo o modificado
git push

# 2) Disparás la regeneración desde tu rama
gh workflow run visual-baseline.yml --ref mi-rama

# 3) ~10 min
gh run watch

# 4) Bajás el artifact al lugar exacto
gh run download --name visual-baselines --dir tests/e2e/visual/__screenshots__

# 4-bis) VERIFICÁS el path. Tiene que dar exactamente 8 líneas, todas con la
#        forma __screenshots__/<project>/linux/<foto>.png. Si aparece un nivel
#        `visual-baselines/` en el medio, ver la trampa de abajo.
git status --porcelain tests/e2e/visual/__screenshots__

# 5) MIRÁS las PNG con tus ojos. No es opcional: es la única revisión humana
#    de la baseline. Después de esto el gate es automático y ciego.
git status
git add tests/e2e/visual/__screenshots__
git commit -m "test(visual): baselines linux"
```

> **La trampa del artifact (ya pasó una vez, commit `be8813a`).** El artifact se
> llama `visual-baselines` y su `path:` es `tests/e2e/visual/__screenshots__/`, así
> que **el contenido del zip va DENTRO de `__screenshots__/`, no en una subcarpeta
> con el nombre del artifact.** El comando del paso 4 (`gh run download --name
> ... --dir ...`) hace exactamente eso. Lo que NO sirve:
>
> - bajar el `.zip` desde la UI de GitHub y descomprimirlo con doble clic (te
>   crea `visual-baselines/` y ahí adentro `visual/linux/…`);
> - `gh run download --dir tests/e2e/visual/__screenshots__` **sin** `--name`
>   (sin `--name`, gh crea una carpeta por artifact).
>
> Si el nivel de más se cuela, las baselines quedan en un path que
> `snapshotPathTemplate` no mira nunca: el step advisory de `ci.yml` falla con
> `A snapshot doesn't exist at …, writing actual` para las 8 fotos, y como el step
> es `continue-on-error: true` el CI sigue verde y no lo ves. El path correcto lo
> manda `snapshotPathTemplate` en `playwright.config.ts` — si dudás, la fuente de
> verdad son los paths que el propio log de CI reporta como faltantes.

> **La trampa del `--update-snapshots` pelado (ya costó 3 corridas).** El
> workflow usa `--update-snapshots=all` y **el `=all` es obligatorio**. Sin valor,
> el flag toma el preset `changed`, y `changed` reescribe la baseline **solo cuando
> la comparación falla**: cualquier drift por debajo de `maxDiffPixelRatio: 0.01`
> se considera "matching" y la PNG vieja queda intacta, con el workflow en
> `success` sin haber regenerado nada.
>
> Así se congeló la caja magenta de 0.281% del overlay de dev en `landing.png` y
> `admin-settings-reservas.png`: el fix ya estaba en el código y las fotos nuevas
> eran correctas, pero `changed` las descartaba por estar dentro del umbral. El
> síntoma es traicionero — el artifact baja byte-idéntico al que ya tenías y parece
> que "no cambió nada". Con `=all`, Playwright captura sin comparar y reescribe si
> los bytes difieren.

> **Las fotos de DPR 2 vuelven "cambiadas" casi siempre, y casi siempre es ruido.**
> `=all` reescribe cuando los **bytes** difieren, pero el gate compara con
> `threshold: 0.2` en YIQ — que es **perceptual**. En los projects mobile
> (`deviceScaleFactor: 2` + `scale: 'css'`, o sea captura a 786×1702 y downscale a
> 393×851) el anti-aliasing del texto se corre un subpixel entre corridas: medido en
> `perfil-publico-mobile.png`, **9.14% de los pixeles byte-distintos** (delta máximo
> 218, concentrado en las filas de los glifos) y sin embargo la comparación de
> Playwright **pasa** — se comprobó corriendo el mismo commit en modo `changed`, que
> dejó la PNG intacta justamente porque no falló.
>
> Criterio: en las fotos mobile, **no bendigas por byte, bendecí por estructura.** Si
> las dos imágenes tienen el mismo layout, el mismo texto y las mismas posiciones,
> dejá la baseline vieja: re-bendecirla mete miles de pixeles de churn al diff sin
> cambiar nada de lo que el gate mira. Bendecila solo si el cambio se ve.

**Cuando un diff es legítimo** (cambiaste un padding a propósito): exactamente los
mismos 5 pasos. Con `=all` se reescribe toda PNG cuyos bytes cambien; el colador
contra bendecir basura es el paso 5, no el flag.

**Cuando no lo es**: el job sube `test-results/` como artifact, con los
`*-actual.png` y `*-diff.png`. Los mirás, arreglás el código, y las baselines ni
se tocan.

## Umbrales

`threshold: 0.2` (por-pixel, YIQ — tolera anti-aliasing) y
`maxDiffPixelRatio: 0.01` (1% de pixeles distintos). El ratio es relativo, no
absoluto: no hay que retocarlo si cambia el viewport.

Se aprieta a `0.002` después de 3 semanas sin falsas alarmas. Antes no.

## Caducidad

`VISUAL_DATE = '2030-06-17'` es absoluta. Cuando sea pasado hay que moverla y
regenerar las baselines. Si esta pieza sigue viva en 2030, ya se ganó el derecho.
