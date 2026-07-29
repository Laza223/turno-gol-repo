# Regresión visual

8 fotos de pantalla completa que vigilan una sola clase de bug: **un cambio en
`globals.css`, en un token de Tailwind o en una fuente que rompe el layout de una
pantalla que no abriste en tres semanas.** Nada más.

Todo lo que se pueda afirmar con un assert de texto va en un spec funcional.

## Estado: ADVISORY

`continue-on-error: true` en el step de `ci.yml`. No bloquea nada todavía.

**Se endurece** después de 10 PRs consecutivos sin una sola falsa alarma. El
contador arranca en el primer run que **realmente comparó** algo: entre `be8813a`
y el fix del path de las baselines, las 8 fotos venían fallando con
`A snapshot doesn't exist` y el step nunca comparó nada.
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

## Cómo se logra el determinismo

| Problema | Solución |
|---|---|
| Las fechas se renderizan en **Server Components** | `page.clock` NO alcanza (solo intercepta el browser). Se pinnea la fecha por URL: `/grilla?date=2030-06-17` |
| La línea roja de "ahora" se mueve | Sale gratis: `useNowLine` devuelve `null` cuando `artNow.date !== date` (`src/hooks/use-now-line.ts:28`). Con la fecha pinneada a una distinta de hoy, no se dibuja |
| `useArtNow` / `ExpiryCountdown` leen `Date.now()` en el cliente | `page.clock.setFixedTime(FROZEN_NOW)`. Misma constante que Storybook |
| Los seeds funcionales usan fechas relativas | Seed propio (`tests/e2e/visual/_seed.ts`) con UUIDs, horarios y fecha **absolutos**, idempotente |
| Animaciones | `reducedMotion: 'reduce'` engancha el `@media` que ya existe en `globals.css`. Cero CSS nuevo, y de paso se fotografía el camino accesible |
| Banner de push (`fixed bottom-left z-40`) | `addInitScript` + `localStorage` antes del primer `goto` |
| Indicador de devtools de Next | `devIndicators: false` cuando `NEXT_PUBLIC_E2E=1` (`next.config.ts`) — **no alcanza**, ver la deuda de abajo |
| Disponibilidad del perfil público | **No se estabiliza**: se clampea a `[hoy, hoy+anticipación]` en cliente Y servidor. Se enmascara ese bloque por su `aria-label` |

Los projects declaran `viewport`, `deviceScaleFactor`, `colorScheme`, `locale` y
`timezoneId` **explícitos** en vez de heredarlos de `devices[]`: un bump de
Playwright puede cambiar el descriptor del device e invalidar todas las baselines
en silencio.

### Deuda: el mask del overlay de dev es intermitente

`devChrome(page)` enmascara `nextjs-portal` + `[data-nextjs-toast]` como red de
seguridad. Pero el portal **igual aparece a veces** pese a `devIndicators: false`,
y cuando aparece Playwright le pinta encima una caja magenta de ~101×36 px abajo a
la izquierda.

En las fotos de escritorio (1440×900) esa caja es 0.28% del cuadro: irrelevante.
En `perfil-publico-mobile.png` (393×851) es **1.09%** — o sea que su sola
aparición/desaparición mueve el diff por encima de `maxDiffPixelRatio: 0.01` sin
que haya cambiado un solo pixel de producto. Medido: entre las baselines de
`e1f1284` y las de `0c09296`, esa foto dio 1.15% de diff, del cual 1.09% era la
caja (presente en la vieja, ausente en la nueva) y 225 px (0.07%) el borde.

Hasta que se arregle, un diff de ~1.1% en las fotos mobile es sospechoso de ser
esto y no una regresión: mirá primero la esquina inferior izquierda. El fix real
es que el portal no llegue al DOM (o excluirlo del screenshot en vez de
enmascararlo), no aflojar el umbral.

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

**Cuando un diff es legítimo** (cambiaste un padding a propósito): exactamente los
mismos 5 pasos. `--update-snapshots` reescribe solo lo que cambió.

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
