# Prompt de implementación — Caja

> Pegar entero como primer mensaje de una sesión nueva de Claude Code sobre el repo TurnoGol.
> Antes de pegarlo, completá la URL del proyecto de Claude Design en §1.
> Reemplaza al prompt por defecto que genera Claude Design: ese sólo dice "implementá este archivo"
> y no sabe nada del repo.

---

Implementá en TurnoGol la propuesta de rediseño de **Caja** (`/caja` y sus pestañas) que hizo
Claude Design.

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

El bundle `_ds_*` es el design system de este mismo repo: los 30 componentes reales de
`src/components/ui/` y `src/components/admin/`. Si el diseño usa algo que no está ahí, es una pieza
nueva y merece justificarse antes de escribirla.

## 2. Qué es esto y qué no es

La propuesta es **una propuesta, no una especificación**. Donde choque con el código, el código manda
y lo señalás. Tres filtros antes de escribir una línea:

1. **Decisión de negocio**: NO la resuelvas. Devolvés "REQUIERE INPUT" con la pregunta numerada.
   En Caja esto pesa más que en otras pantallas: todo acá toca plata real de un negocio real.
2. **Feature freeze hasta 2026-11-01** (`docs/decisions/2026-09-02-experimento-30-dias.md` D4).
   Los **circuitos de plata** están explícitamente permitidos, y esto entra además como fricción de
   adopción observada. Lo que no entra es capacidad nueva que hoy no existe.
3. **Veto de producto**: `CLAUDE.md` lista decisiones ya tomadas que un modelo tiende a re-proponer
   de buena fe. Leela antes, no después. La sección de Caja es la más poblada de todas.

El rediseño es **flujo** y **resta**. Una pantalla más linda con la misma cantidad de cosas es un
fracaso.

## 3. Lo que tenés que leer antes de tocar nada

En este orden:

- `docs/spec/design-system/MASTER.md` §6.8 — el armazón del panel. **Versión 2.2.** Riel de 72 px a
  la izquierda, barra superior de 60 px con un hueco (`AdminHeaderSlot`) donde cada pantalla cuelga
  sus controles. No se rediseña acá.
- `docs/spec/design-system/pages/grilla.md` **v2.0** y `pages/configuracion.md` — los dos precedentes
  de cómo se baja un handoff de Design a este repo. Leé al menos uno entero.
- `docs/decisions/2026-09-11-eliminar-caja-del-dia.md` — **el más importante.** Explica qué se
  eliminó y por qué.
- `docs/decisions/2026-07-22-caja-cantina-redesign.md` y `2026-07-24-caja-cantina-dia-operativo.md`.

> ⚠️ **`docs/spec/design-system/pages/caja.md` está desactualizada y no se puede usar como verdad.**
> Todavía describe la "Caja del día" con su apertura, su arqueo y su ritual de cierre — un subsistema
> que se eliminó entero. **Reescribirla es parte de esta tarea**, con la v2.0 de `grilla.md` como
> molde: versión nueva arriba, qué cambió, y las decisiones con su motivo.

## 4. Lo que NO se repone, pase lo que pase

- **Apertura, cierre y arqueo de caja.** Se eliminaron a propósito: agregaban un paso diario que
  nadie hacía bien y, peor, **bloqueaban cobros** cuando la caja figuraba cerrada — el sistema le
  impedía al complejo cobrar plata real. Hoy ningún movimiento de plata se bloquea por eso. Las
  tablas `daily_cash_opens` y `daily_cash_closes` siguen existiendo **con datos históricos, sin UI y
  sin escritura desde código de aplicación**: no las vuelvas a escribir y **nunca reinterpretes** esas
  filas. Los cierres viejos con `expected_cash NULL` son especialmente traicioneros.
- **Devolución automática por API.** TurnoGol **no puede** devolver plata: el permiso de reembolso de
  MercadoPago sólo funciona con la cuenta dueña de la aplicación y devuelve 403 con la cuenta de
  cualquier cliente real. El camino automático se eliminó. La devolución la hace el complejo por
  fuera y el sistema sólo **registra** que ya se hizo. Un botón que parezca ejecutarla es una mentira.
  Detalle en `docs/planning/2026-08-22-dos-apps-mercadopago.md`.
- **Catálogo de productos en `tenants.settings`.** Vive en tablas reales desde la migración 051. No
  vuelvas a guardarlo en el JSONB.
- **Texto libre sobre personas.** Ni notas, ni observaciones sobre un deudor. Es Ley 25.326: lo que un
  cliente puede leer ejerciendo su derecho de acceso se controla en origen.

## 5. Invariantes de plata que un rediseño rompe seguido

- **Montos en centavos de ARS**, enteros, nunca decimales. El formateo a `$ 16.000` es de
  presentación y vive en `formatArs`.
- **El total de "Deudas" tiene una sola fuente**: `src/modules/cashflow/street-money.service.ts`.
  Hoy lo leen el encabezado de Caja, la lista de `/caja/deudas` y la pantalla Hoy. Si el rediseño
  mueve o duplica ese número, **todos los lugares siguen leyendo esa misma función**. Un total
  calculado de nuevo "porque quedaba más cómodo" es la clase de bug que nadie ve hasta que dos
  pantallas dicen cosas distintas.
- **El día operativo de Caja no es el de las reservas.** Caja usa un cutoff único por complejo
  (`nightCutoffMins`), no uno por día de la semana. Los helpers están en
  `src/shared/time/operating-day.ts` y los consumen `getCashFlows` y `getDaySummary`. **Nunca
  reimplementes esa aritmética**, y nunca derives "hoy" con `new Date().toISOString().slice(0,10)`:
  entre las 21:00 y la medianoche eso devuelve el día siguiente. Hay una regla de ESLint que lo
  bloquea.
- **Los enums usan `canceled`, con una sola L.** Nunca `cancelled`.
- **Mutaciones por Server Action**, no por route handler. Los route handlers son sólo para webhooks
  de MercadoPago, endpoints públicos y callbacks de auth. Las queries a la base van en Server
  Components o Server Actions.
- **Caja la usa también el encargado.** El guard es `requireOperatorStaff`, no `requireAdminStaff`.
  Si el rediseño mueve pantallas o cambia rutas, cada una tiene que conservar su guard: bajarle el
  guard a algo que hoy es sólo del dueño, o subírselo a algo que el encargado necesita, son las dos
  formas de romper esto en silencio. Verificá ruta por ruta.

## 6. Tema oscuro: obligatorio, y el diseño no lo trae

**El diseño va a venir sólo en tema claro.** Es deliberado: se le pidió así a Claude Design para no
gastar el doble de tokens en dos paletas. Adaptarlo a oscuro es tu trabajo, no un extra.

Cómo se hace en este repo:

- El tema se resuelve con la clase `.dark` en el `<html>` (`next-themes`), y Tailwind 4 lo expone con
  `@custom-variant dark (&:is(.dark *))` en `src/app/globals.css`.
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
   claro, `text-red-300` en oscuro — el token `destructive` pelado cae bajo AA ahí. Esto pega fuerte
   en Caja, donde medio producto es verde de plata que entró y rojo de plata que sale.
3. **Atenuar el resto para destacar algo rompe AA.** Pasó en la Grilla y lo volteó axe. La solución
   fue al revés: resaltar lo que importa y dejar el resto igual.

Verificación obligatoria del tema oscuro, no opcional:

```bash
pnpm test:storybook:dark
```

El de tema claro (`pnpm test:storybook`) **no mide oscuro**: son dos corridas distintas, y en CI es
una matriz de shard × tema.

## 7. Reglas de interfaz que un rediseño rompe seguido

- **44 px de blanco táctil mínimo** (MASTER §10). Acá importa más que en ninguna otra pantalla: la
  venta de cantina se ejecuta de pie, con una mano y con gente esperando. En la Grilla esto se
  escapó cuatro veces y lo agarró la revisión adversarial, no los tests.
- **Campos de entrada con piso de 16 px en mobile** (MASTER §3.1): abajo de eso iOS hace zoom al
  enfocar. Se escribe `text-base md:text-sm` y fuera de `@layer`.
- **La píldora de estado de un turno sale de una sola tabla**, `src/lib/booking/slot-visual.ts`. Si
  Deudas muestra el estado de un turno, sale de ahí. No escribas una copia.
- **El diálogo de confirmación destructiva** ya existe como componente y tiene su gramática propia en
  `docs/spec/design-system/gramatica-interaccion.md`. No inventes otro.
- **No fabriques métricas** (MASTER §9): un número que se muestra sale de un dato real o no se
  muestra.

## 8. Verificación antes de decir "listo"

Los cuatro comandos del required check *Lint & Types*, con el output real pegado:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip
```

Nota: `format:check` sólo cubre `src/ tests/ scripts/`. Puede fallar por
`scripts/ig-follow/accounts.json`, un archivo ajeno que viene sucio de antes — confirmá que sea ése
y no algo tuyo.

Después:

- `pnpm test:storybook` **y** `pnpm test:storybook:dark`.
- **Los tests de integración de Caja son el gate real de esta tarea.** Hay lógica de plata detrás de
  cada pantalla y el rediseño la va a tocar aunque sólo mueva componentes. Corré `pnpm test` y
  `pnpm test:integration`; qué correr cuándo, con qué entorno y sus gotchas está en la skill
  `protocolo-testing`.
- **`/caja` no tiene foto de regresión visual**, así que ningún canario de layout te cubre acá. Las
  seis que existen son login, landing, ficha pública, Grilla, Canchas y settings de reservas. Si el
  rediseño toca el armazón compartido, esas se van a mover igual: las baselines se generan SÓLO en
  Linux por CI (`visual-baseline.yml`, `workflow_dispatch`), nunca local en Windows, y
  `--update-snapshots` necesita `=all` (con el preset `changed` deja las PNG viejas y da un verde
  falso). Instructivo: `docs/testing/VISUAL_REGRESSION.md`; su paso 5 es mirar las PNG con tus ojos.
- La regresión visual y los e2e **no corren en pull requests**, sólo al integrar a `main`.
- Verificá el flujo de venta con la app corriendo, no sólo con tests (skill `verificacion-ux`).
  Probalo en ancho de teléfono: es donde se usa de verdad.
- **Reescribí `docs/spec/design-system/pages/caja.md`** con lo que quedó. Ver §3.

## 9. Cómo trabajar en este repo

- Hay varias sesiones de Claude en paralelo sobre este repositorio. **Trabajá en un worktree, nunca
  hagas checkout sobre el árbol principal**, y no uses `git stash` pelado: la pila es compartida.
- **No commitees ni pushees sin pedido explícito.** Reportá siempre qué quedó sin commitear.
- Ante tarea no trivial, cargá la skill `protocolo-orquestacion` antes de explorar o editar. Para
  cualquier cosa que toque la base, Server Actions o MercadoPago, cargá `convenciones-stack`.
- Español rioplatense, directo. Código e identificadores en inglés.
- Verificá que los sustantivos del pedido existan antes de ejecutar sobre una premisa falsa.
