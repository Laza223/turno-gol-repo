# Prompt de implementación — Hoy

> Pegar entero como primer mensaje de una sesión nueva de Claude Code sobre el repo TurnoGol.
> Antes de pegarlo, completá la URL del proyecto de Claude Design en §1 — todavía no existe.
> Reemplaza al prompt por defecto que genera Claude Design: ese sólo dice "implementá este archivo"
> y no sabe nada del repo.

---

Implementá en TurnoGol la propuesta de rediseño de **Hoy** (el dashboard del dueño, ruta
`/dashboard`) que hizo Claude Design.

## 1. De dónde sale el diseño

Usá el MCP `claude_design` (`https://api.anthropic.com/v1/design/mcp`, autenticación con
`/design-login`) para importar este proyecto:

```
<PEGAR ACÁ LA URL QUE DEVUELVE CLAUDE DESIGN, con ?file=…>
```

Leé también lo que la selección importa: el bundle `_ds/turnogol-55246162-…/_ds_bundle.js` y su
`styles.css`, más `icons.js` y `support.js`.

Si el MCP no autentica, hay un zip adjunto con lo mismo: usalo y seguí. **No pidas credenciales ni
tokens.** Si tenés las dos fuentes, mandá el MCP y dejá el zip de respaldo — el zip puede ser una
exportación anterior a la última edición del diseño.

El bundle `_ds_*` es el design system de este mismo repo, subido el 2026-09-11: los 30 componentes
reales de `src/components/ui/` y `src/components/admin/`. Si el diseño usa algo que no está ahí, es
una pieza nueva y merece justificarse antes de escribirla.

## 2. Qué es esto y qué no es

La propuesta es **una propuesta, no una especificación**. Donde choque con el código, el código manda
y lo señalás. Tres filtros antes de escribir una línea:

1. **Decisión de negocio**: NO la resuelvas. Devolvés "REQUIERE INPUT" con la pregunta numerada.
2. **Feature freeze hasta 2026-11-01** (`docs/decisions/2026-09-02-experimento-30-dias.md` D4). Esto
   entra como **fricción de adopción observada**, no como feature nueva.
3. **Veto de producto**: `CLAUDE.md` lista decisiones ya tomadas que un modelo tiende a re-proponer
   de buena fe. Leela antes, no después.

El rediseño es **flujo** y **resta**. Una pantalla más linda con la misma cantidad de cosas es un
fracaso.

## 3. El armazón del panel cambió. Leelo antes de tocar nada

El 2026-09-11 se rediseñó la Grilla y con ella el armazón que comparten TODAS las vistas del panel:
riel de 72 px en lugar de la barra de 240, y barra superior de 60 px con un hueco
(`AdminHeaderSlot`, portal sobre `#admin-header-slot`) donde cada vista cuelga sus propios
controles en vez de abrir filas de encabezado sobre el contenido.

Fuentes, en este orden:

- `docs/spec/design-system/MASTER.md` §6.8 — el armazón. **Versión 2.2.**
- `docs/spec/design-system/pages/grilla.md` — **versión 2.0**, el precedente de cómo se baja un
  handoff de Design a este repo.
- `docs/spec/design-system/pages/dashboard.md` — **versión 3**, la especificación de esta pantalla.

Las tres están en `main`. Confirmá la versión antes de leer el cuerpo: si `MASTER.md` no dice
**2.2**, `grilla.md` no dice **2.0** y `dashboard.md` no dice **3**, estás sobre una base vieja y
vas a diseñar contra un menú lateral de 240 px que ya no existe.

## 4. Tema oscuro: obligatorio, y el diseño no lo trae

**El diseño va a venir sólo en tema claro.** Es deliberado: se le pidió así a Claude Design para no
gastar el doble de tokens en dos paletas. Adaptarlo a oscuro es tu trabajo, no un extra.

Cómo se hace en este repo:

- El tema se resuelve con la clase `.dark` en el `<html>` (`next-themes`), y Tailwind 4 lo expone
  con `@custom-variant dark (&:is(.dark *))` en `src/app/globals.css`.
- **Nunca escribas un hex nuevo ni un color de paleta sin par `dark:`.** Se usan los tokens
  semánticos duales (`bg-card`, `text-foreground`, `border-border`, `bg-muted`…), definidos para los
  dos temas en `globals.css`. Un color suelto (`bg-slate-100`, `text-gray-700`) sin `dark:` es el
  defecto más común de un handoff light-only.
- Los tintes van por alpha del token (`bg-warning/10`), nunca por un hex nuevo.

**Las tres trampas de contraste que ya nos costaron trabajo** (MASTER §2.4, medidas, no estimadas):

1. **`--muted-foreground` está calibrado a 4.93:1** contra `bg-muted`. Cualquier modificador de
   opacidad sobre él (`text-muted-foreground/70`) lo tira debajo de AA. Si necesitás algo más tenue,
   cambiá de token, no le bajes la opacidad.
2. **Tailwind 4 usa OKLCH y eso mueve los verdes y rojos.** `emerald-600` sobre blanco da 3,8:1 y NO
   cumple AA para texto normal. En claro: `text-emerald-700` sobre cards, `text-emerald-800` sobre el
   fondo de página. En oscuro: `text-emerald-400`. Para rojo sobre fondos tenues: `text-red-700` en
   claro, `text-red-300` en oscuro.
3. **Atenuar el resto para destacar algo rompe AA.** Pasó en la Grilla y lo volteó axe. La solución
   fue al revés: resaltar lo que importa y dejar el resto igual.

Verificación obligatoria del tema oscuro, no opcional:

```bash
pnpm test:storybook:dark
```

El de tema claro (`pnpm test:storybook`) **no mide oscuro**: son dos corridas distintas.

## 5. Reglas duras que un rediseño rompe seguido

- **44 px de blanco táctil mínimo** (MASTER §10). El mostrador atiende desde una tablet. 36 px es
  aceptable recién de `md`/`lg` para arriba. En la Grilla esto se escapó cuatro veces y lo agarró la
  revisión adversarial, no los tests.
- **Campos de entrada con piso de 16 px en mobile** (MASTER §3.1): abajo de eso iOS hace zoom al
  enfocar. Se escribe `text-base md:text-sm` y fuera de `@layer`.
- **Nunca texto libre sobre personas** (Ley 25.326). Etiquetas = enum cerrado de cinco.
- **Montos en centavos de ARS**, enteros. **Los enums usan `canceled`, con una sola L.**
- **No fabriques métricas** (MASTER §9, cláusula de conversión): un número que se muestra sale de un
  dato real o no se muestra.

## 6. Qué es Hoy, y sus dos anti-objetivos

`/dashboard`. Es la primera pantalla del día del dueño, y la especificación v3 (auditoría de
coherencia, H010) la dejó en **tres bloques, ni uno más**:

1. **Próximos turnos** — cancha por cancha, lo que falta jugar hoy: hora, quién, estado, y "ahora" /
   "en N min" cuando arranca dentro de la hora. La ocupación del día es el **subtítulo** del bloque,
   no una tarjeta aparte.
2. **Necesita tu atención** — SÓLO las cuatro anomalías de la taxonomía cerrada
   (`docs/decisions/2026-08-02-taxonomia-alertas-hoy.md`), cada una con su acción al lado. Vacío es
   el premio: "Nada pendiente. Todo cobrado y cerrado."
3. **Mientras no estabas** — el feed de lo que pasó sin él.

**Los dos anti-objetivos son contrato, no preferencia:**

- **Cero gráficos.** Un gráfico es una herramienta de análisis; Hoy es un parte de situación. El
  análisis vive en `/analiticas`.
- **Cero plata repetida.** "Cobrado hoy" y "Deudas" ya salieron en H010: eran el mismo componente
  con el mismo dato que Caja muestra un click más allá. Lo cobrado y lo que te deben viven en Caja,
  que es donde se cobra. Si el diseño los repone, eso no entra.

Dos cosas más que el diseño puede no saber:

- **El encargado (`manager`) no ve esta pantalla**: rebota a la Grilla. Es la única excepción a la
  regla de MASTER §6.8 de mostrar-bloqueado-con-candado, porque no es un permiso denegado sino una
  vista que no le corresponde (decisión D5).
- **Gotcha B10 en `page.tsx`**: el guard es `requireOperatorStaff`, no `requireAdminStaff`, aunque la
  pantalla sea sólo del dueño. `requireAdminStaff` rebota al manager a `/dashboard`, que es esta
  misma página, y eso sería un loop de redirects. No lo "arregles".

## 7. Verificación antes de decir "listo"

Los cuatro comandos del required check *Lint & Types*, con el output real pegado:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip
```

Nota: `format:check` sólo cubre `src/ tests/ scripts/`. Hoy falla por
`scripts/ig-follow/accounts.json`, un archivo ajeno que viene sucio de antes — confirmá que sea ése
y no algo tuyo.

Después:

- `pnpm test:storybook` **y** `pnpm test:storybook:dark`.
- **`/dashboard` no tiene foto de regresión visual**, así que ningún canario de layout te cubre acá.
  Las seis que existen son login, landing, ficha pública, Grilla, Canchas y settings de reservas. Si
  el rediseño toca el armazón compartido, van a moverse igual: las baselines se generan SÓLO en Linux
  por CI (`visual-baseline.yml`, `workflow_dispatch`), nunca local en Windows, y `--update-snapshots`
  necesita `=all` (con el preset `changed` deja las PNG viejas y da un verde falso). Instructivo:
  `docs/testing/VISUAL_REGRESSION.md`; su paso 5 es mirar las PNG con tus ojos.
- La regresión visual y los e2e **no corren en pull requests**, sólo al integrar a `main`.
- Verificá el flujo con la app corriendo, no sólo con tests (skill `verificacion-ux`).

## 8. Cómo trabajar en este repo

- Hay varias sesiones de Claude en paralelo sobre este repositorio. **Trabajá en un worktree, nunca
  hagas checkout sobre el árbol principal**, y no uses `git stash` pelado: la pila es compartida.
- **No commitees ni pushees sin pedido explícito.** Reportá siempre qué quedó sin commitear.
- Ante tarea no trivial, cargá la skill `protocolo-orquestacion` antes de explorar o editar.
- Español rioplatense, directo. Código e identificadores en inglés.
- Verificá que los sustantivos del pedido existan antes de ejecutar sobre una premisa falsa.
