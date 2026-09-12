# Prompt de implementación — Configuración

> Pegar entero como primer mensaje de una sesión nueva de Claude Code sobre el repo TurnoGol.
> Reemplaza al prompt por defecto que genera Claude Design: ese sólo dice "implementá este archivo"
> y no sabe nada del repo.

---

Implementá en TurnoGol la propuesta de rediseño de **Configuración** que hizo Claude Design.

## 1. De dónde sale el diseño

Usá el MCP `claude_design` (`https://api.anthropic.com/v1/design/mcp`, autenticación con
`/design-login`) para importar este proyecto:

```
https://claude.ai/design/p/9dd56873-9010-4036-8335-f72a9ce0102f?file=Configuracion+propuesta.dc.html
```

Archivo a implementar: `Configuracion propuesta.dc.html`. Todo el proyecto es legible.
Leé también lo que esa selección importa:

- `_ds/turnogol-55246162-2fdb-48c3-aa22-d9b578a6f572/_ds_bundle.js`
- `_ds/turnogol-55246162-2fdb-48c3-aa22-d9b578a6f572/styles.css`
- `icons.js`
- `support.js`

Si el MCP no autentica, hay un zip adjunto con lo mismo: usalo y seguí. **No pidas credenciales ni
tokens.** Si tenés las dos fuentes, mandá el MCP y dejá el zip de respaldo — el zip puede ser una
exportación anterior a la última edición del diseño.

El bundle `_ds_*` que el diseño importa es el design system de este mismo repo, subido el
2026-09-11: son los 30 componentes reales de `src/components/ui/` y `src/components/admin/`. O sea
que el diseño está armado con **tus** componentes, no con inventados. Si el diseño usa algo que no
está en ese bundle, es una pieza nueva y merece justificarse antes de escribirla.

## 2. Qué es esto y qué no es

La propuesta de Claude Design es **una propuesta, no una especificación**. Donde choque con el
código, el código manda y lo señalás. Tres filtros antes de escribir una línea:

1. **Decisión de negocio** (qué se cobra, qué se muestra a quién, qué se elimina de la vista):
   NO la resuelvas. Devolvés "REQUIERE INPUT" con la pregunta numerada al dueño.
2. **Feature freeze hasta 2026-11-01** (`docs/decisions/2026-09-02-experimento-30-dias.md` D4). Esto
   entra como **fricción de adopción observada**, no como feature nueva. Si la propuesta agrega
   capacidad que hoy no existe, eso no entra: se señala y se deja afuera.
3. **Veto de producto**: `CLAUDE.md` tiene una lista de decisiones ya tomadas que un modelo tiende a
   re-proponer de buena fe. Leela antes, no después.

El objetivo del esfuerzo, en las palabras del dueño, es que la app dejó de ser "incoherente,
incómoda" y tiene "TANTO". El rediseño es **flujo** (caminos más cortos) y **resta** (menos en
pantalla). Una pantalla más linda con la misma cantidad de cosas es un fracaso.

## 3. El armazón del panel cambió hace días. Leelo antes de tocar nada

El 2026-09-11 se rediseñó la Grilla y con ella el armazón que comparten TODAS las vistas del panel:

- La barra lateral de 240 px pasó a un **riel de 72 px** con ícono arriba y rótulo abajo.
- Apareció una **barra superior de 60 px con un hueco** (`AdminHeaderSlot`, portal sobre
  `#admin-header-slot`): cada vista cuelga ahí sus propios controles en vez de abrir filas de
  encabezado sobre el contenido.
- Configuración, en el riel, se rotula **"Ajustes"** (no entra la palabra larga en 60 px). Su
  nombre accesible sigue siendo la palabra completa.

Fuentes, en este orden:

- `docs/spec/design-system/MASTER.md` §6.8 — el armazón. **Versión 2.2.**
- `docs/spec/design-system/pages/grilla.md` — **versión 2.0**, el precedente de cómo se baja un
  handoff de Design a este repo. Leela entera aunque no toques la Grilla: las decisiones de §1
  (la vista no abre encabezado propio), §3 (cobrar en dos toques, acciones plegadas tras "Más") y
  §4 (medidas por CSS, superficies por hook) se heredan.

Las dos están en `main`. Confirmá la versión antes de leer el cuerpo: si `MASTER.md` no dice
**2.2** y `grilla.md` no dice **2.0**, estás sobre una base vieja y vas a diseñar contra un menú
lateral de 240 px que ya no existe.

## 4. Tema oscuro: obligatorio, y el diseño no lo trae

**El diseño va a venir sólo en tema claro.** Es deliberado: se le pidió así a Claude Design para no
gastar el doble de tokens en dos paletas. Adaptarlo a oscuro es tu trabajo, no un extra.

Cómo se hace en este repo:

- El tema se resuelve con la clase `.dark` en el `<html>` (`next-themes`), y Tailwind 4 lo expone
  con `@custom-variant dark (&:is(.dark *))` en `src/app/globals.css`.
- **Nunca escribas un hex nuevo ni un color de paleta sin par `dark:`.** Se usan los tokens
  semánticos duales (`bg-card`, `text-foreground`, `border-border`, `bg-muted`…), que ya están
  definidos para los dos temas en `globals.css`. Un color de paleta suelto (`bg-slate-100`,
  `text-gray-700`) sin `dark:` es el defecto más común de un handoff light-only.
- Los tintes van por alpha del token (`bg-warning/10`), nunca por un hex nuevo.

**Las tres trampas de contraste que ya nos costaron trabajo** (MASTER §2.4, medidas, no estimadas):

1. **`--muted-foreground` está calibrado a 4.93:1** contra `bg-muted`. Cualquier modificador de
   opacidad sobre él (`text-muted-foreground/70`) lo tira debajo de AA. Si necesitás algo más tenue,
   cambiá de token, no le bajes la opacidad.
2. **Tailwind 4 usa OKLCH y eso mueve los verdes y rojos.** `emerald-600` sobre blanco da 3,8:1 y NO
   cumple AA para texto normal. En claro: `text-emerald-700` sobre cards, `text-emerald-800` sobre el
   fondo de página. En oscuro: `text-emerald-400`. Para rojo sobre fondos tenues: `text-red-700` en
   claro, `text-red-300` en oscuro — el token `destructive` pelado cae bajo AA ahí.
3. **Atenuar el resto para destacar algo rompe AA.** Pasó en la Grilla: bajarle la opacidad a las
   celdas que no interesaban hundió el texto debajo del mínimo y lo volteó axe. La solución fue al
   revés: resaltar lo que importa con un anillo y dejar el resto igual.

Verificación obligatoria del tema oscuro, no opcional:

```bash
pnpm test:storybook:dark
```

El de tema claro (`pnpm test:storybook`) **no mide oscuro**: son dos corridas distintas, y en CI es
una matriz de shard × tema. Una story sin estado activo deja ese estado sin medir en los dos.

## 5. Reglas duras que un rediseño rompe seguido

- **44 px de blanco táctil mínimo** (MASTER §10). El mostrador atiende desde una tablet. Un chip de
  36 px es aceptable recién de `md`/`lg` para arriba, donde el puntero es un mouse. En la Grilla esto
  se escapó cuatro veces y lo agarró la revisión adversarial, no los tests.
- **Al encargado (`manager`) los ítems bloqueados se le MUESTRAN con candado y explicación, nunca se
  le esconden** (MASTER §6.8). Es crítico acá: Configuración entera es sólo del dueño. Mirá
  `SettingsAccessNotice.tsx` y el branch del riel en `admin-sidebar.tsx`. El trigger del tooltip es
  un `button` con `aria-disabled`, no un `span`: `disabled` mataría el foco y con él el tooltip.
- **Campos de entrada con piso de 16 px en mobile** (MASTER §3.1): abajo de eso iOS hace zoom al
  enfocar. Se escribe `text-base md:text-sm` y fuera de `@layer`.
- **Nunca texto libre sobre personas** (Ley 25.326). Las etiquetas son un enum cerrado de cinco.
- **Montos en centavos de ARS**, enteros. **Los enums usan `canceled`, con una sola L.**

## 6. Qué es Configuración hoy

Cinco pestañas (`SettingsTabs.tsx`), todas bajo `src/app/(admin)/settings/`:

| Ruta | Pestaña |
| --- | --- |
| `/settings/perfil` | Perfil |
| `/settings/reservas` | Reservas |
| `/settings/horarios` | Horarios |
| `/settings/equipo` | Equipo |
| `/settings/facturacion` | Facturación |

Dos cosas que el diseño puede no saber:

- **Canchas salió de Configuración** el 2026-09-10, a pedido del dueño: define el inventario y los
  precios, que es de lo que vive el complejo, y estaba enterrada a dos niveles. Hoy es un espacio de
  primer nivel en el riel, `/canchas`. La carpeta `settings/canchas/` que todavía existe es un
  redirect. No la traigas de vuelta adentro.
- **El ítem del riel apunta a `/settings/reservas`, no a `/settings`.** Esa última es un stub cuyo
  único cuerpo es un `redirect`, y entrar por ahí costaba un render de servidor entero con su cadena
  de auth completa para después mandar al navegador a una segunda navegación.

Especificaciones de vista que aplican: `docs/spec/design-system/pages/horarios-precios.md` y
`pages/staff.md`. No hay una `configuracion.md`: si el rediseño cambia la anatomía de la sección,
escribila, con la v2.0 de `grilla.md` como molde.

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
- **La foto de regresión visual `admin-settings-reservas.png` se va a romper.** Es esperado. Las
  baselines se generan SÓLO en Linux por CI (`visual-baseline.yml`, `workflow_dispatch`), nunca
  local en Windows, y el flag `--update-snapshots` necesita `=all` (con el preset `changed` deja las
  PNG viejas y te da un verde falso). El instructivo completo está en
  `docs/testing/VISUAL_REGRESSION.md` y su paso 5 es mirar las PNG con tus ojos, una por una.
- La regresión visual y los e2e **no corren en pull requests**, sólo al integrar a `main`. El color
  del check no dice nada sobre las fotos.
- Verificá el flujo con la app corriendo, no sólo con tests (skill `verificacion-ux`).

## 8. Cómo trabajar en este repo

- Hay varias sesiones de Claude en paralelo sobre este repositorio. **Trabajá en un worktree, nunca
  hagas checkout sobre el árbol principal**, y no uses `git stash` pelado: la pila es compartida.
- **No commitees ni pushees sin pedido explícito.** Reportá siempre qué quedó sin commitear.
- Ante tarea no trivial, cargá la skill `protocolo-orquestacion` antes de explorar o editar.
- Español rioplatense, directo. Código e identificadores en inglés.
- Verificá que los sustantivos del pedido existan antes de ejecutar sobre una premisa falsa.
