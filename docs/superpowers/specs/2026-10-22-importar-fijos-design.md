# Importar turnos fijos desde una planilla — diseño

Fecha: 2026-10-22 · Ola 1 post-freeze, feature #7 · Rama `claude/importar-fijos-c8f805`

## Por qué

Un complejo nuevo trae sus fijos en una planilla, y hoy se cargan de a uno en `/abonados/nuevo`. La evidencia está en `docs/gtm/ejecucion/10-aprendizajes.md`:

- **2026-09-28 · SIGNAL (piloto, testimonio T1).** El primer testimonio de un cliente real cuenta que antes tenía "fijos y reservas mezclados en una planilla", además del WhatsApp y un sueldo para agendar. Así llegan los fijos de un complejo que arranca.
- **2026-09-25 · FRICCIÓN (alta de El Vagón, acompañada).** Configurar las canchas "le costó bastante" al complejo y el founder tuvo que meterse. La entrada es sobre canchas, no sobre fijos, pero muestra que el alta es donde se traba la adopción y donde termina cargando datos el founder.

Ninguna de las dos pide un importador: es lo que se deduce de ellas.

## Decisiones del brainstorm (Lazar, 2026-10-22)

1. **Entrada:** una caja donde se pega lo copiado de Excel o Sheets (TSV) y un botón para subir un `.csv`. Sin dependencias nuevas: un `.xlsx` se abre, se copia y se pega.
2. **Errores:** al confirmar se cargan las filas buenas; las que tienen error quedan afuera, listadas, y vuelven a la caja para corregirlas.
3. **Precio:** obligatorio por fila. No se deduce de la tarifa de la cancha.
4. **Arranque:** una sola fecha "Empiezan el" para todo el lote (hoy por defecto). Cada fijo arranca el primer día suyo desde esa fecha.
5. **Apellido** (Lazar, después de la ronda 3): una columna Apellido se suma al nombre en vez de ignorarse con aviso. El teléfono que trae algo más que el número se sigue rechazando.

Decidido sin preguntar, por regla existente:

- **Personas:** se importan solo como contacto de un fijo (`player_id NULL`); aparecen en `/jugadores` por `listTenantClients`. Una persona sin turno fijo no se puede importar: no hay tabla de contactos (veto). Nunca se vincula a una cuenta de jugador (vinculación siempre manual).
- **Ley 25.326:** columnas de notas, observaciones o cualquier otra que no sea de la plantilla se ignoran y no se guardan.
- **Permiso:** el mismo que el alta manual (`requireOperatorStaff`: dueño y encargado).
- **Teléfono:** obligatorio, como en el alta manual.

## Plantilla

Primera fila con los nombres de las columnas, en cualquier orden. Se comparan sin mayúsculas, tildes, espacios ni signos (`normalizeKey`): «Nombre y apellido» y «NOMBRE_Y_APELLIDO» son lo mismo. Estos son todos los que acepta `HEADER_SYNONYMS`:

| Columna             | Encabezados aceptados                                                     | Formato                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre              | nombre, nombre y apellido, cliente, equipo, responsable, titular          | texto en una línea, hasta 120. «Contacto» no: en muchas planillas es el teléfono                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Apellido (opcional) | apellido, apellidos                                                       | se suma al nombre: «Juan» + «Pérez» = «Juan Pérez». Si el nombre ya lo trae como palabras enteras («Juan Pérez» + «Pérez», sin mayúsculas ni tildes), no se duplica. El tope de 120 cuenta los dos juntos                                                                                                                                                                                                                                                                                          |
| Teléfono            | teléfono, teléfono de contacto, tel, celular, cel, whatsapp, móvil        | solo el número, con espacios, guiones, puntos o paréntesis: 8 dígitos o más sin el código de país y 15 como máximo con él. **Sin `+`, se asume argentino.** Se guarda como el alta manual (`parsePhoneNumber` + `formatFullPhone`): `+54 <nacional>`, sin el 54 ni el 9 de móvil si vienen, con `+` o sin él. Otro código de país con `+` queda como vino. Puntos, paréntesis y guiones entre dígitos pasan a espacios antes de cortar el código de país: `+54-11-5555-5555` es `+54 11 5555 5555` |
| Cancha              | cancha                                                                    | nombre exacto de la cancha (sin mayúsculas ni tildes), o su número si es único                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Día                 | día, día de la semana                                                     | lunes…domingo, abreviado (lun, mié…) o en plural                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Desde               | desde, hora inicio, hora de inicio, inicio, hora, horario                 | `20`, `20hs`, `20:00`, `20.00`, `8 pm`: hora entera. Sin columna Hasta, acepta el rango entero: `20 a 21`, `20-21`, `de 20:00 a 21:00`. Con am/pm, en las dos horas: `8 pm a 9 pm`                                                                                                                                                                                                                                                                                                                 |
| Hasta (opcional)    | hasta, hora fin, hora de fin, fin                                         | igual; vacía = 1 hora; `0`/`00:00`/`24` = medianoche (`24:00`)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Precio              | precio, precio por turno, precio del turno, valor, monto, tarifa, importe | pesos: `25000`, `25.000`, `$ 25.000`, `25.000,50`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Separador: tabulación (lo que se pega), `;` (CSV de Excel en es-AR) o `,`, detectado en la primera línea con algo escrito, que es el encabezado. Las líneas en blanco de arriba se saltean sin correr la numeración de filas que ve el usuario. Comillas dobles RFC 4180. El `.csv` se lee como UTF-8 y, si no decodifica, como Windows-1252 (CSV de Excel en Windows). Tope: 200 filas por lote.

## Validación (por fila)

Errores (la fila no se carga):

- Falta un dato obligatorio, o no se entiende (día, hora, precio, teléfono).
- El teléfono trae algo que no es el número (letras, una nota, dos números, lo que Excel hace con un número largo: `5,49112E+12` o `1155555555.0`): se rechaza la fila, no se limpia (Ley 25.326). El nombre con saltos de línea, igual. El espacio duro (NBSP) cuenta como espacio.
- La cancha no existe en el complejo.
- Una sola de las dos horas trae am/pm (`8 a 9 pm`, `8-9 pm`, `9 am - 10`), en la misma celda o en Desde y Hasta. Sin esto, `8 a 9 pm` era un fijo de 08:00 a 21:00, la cancha tomada 13 horas por semana. No se le pasa el am/pm a la otra mitad: `11 a 12 pm` no se sabe qué es.
- Hora no entera, o fin ≤ inicio, o el turno cruza la medianoche (como en el alta manual: un fijo nunca cruza; se carga en dos filas). Si el complejo cierra pasada la medianoche, la segunda fila va con el mismo día (día operativo).
- Las columnas que no se cargan (no son de la plantilla, o repiten una ya tomada) se listan en la revisión.
- Se pisa con otra fila de la planilla (misma cancha, mismo día, horarios que se solapan).
- Ya hay un turno fijo activo en ese horario (`checkAbonadoSlotConflict`).
- Todas sus fechas están ocupadas por reservas (`getAbonadoSlotConflicts`), o no queda ninguna fecha para generar (`paidPeriodCutoff`).

Error de planilla (no se revisa ninguna fila): una comilla que se abre y no se cierra, aunque esté en una columna ignorada. Se tragaba las filas de abajo sin avisar; el mensaje nombra la fila.

Avisos (la fila se carga igual):

- Algunas fechas están ocupadas y se saltean, igual que en el alta manual.
- El primer día del fijo es hoy y esa hora ya pasó: arranca la semana siguiente. Sin esto, con "Empiezan el" en hoy (el default), nacía con un turno confirmado en el pasado. El alta manual tiene el mismo hueco y no se toca acá.
- "Arranca el" muestra el primer turno real: el primer día del fijo, corrido por las fechas cerradas, el período pago y las ocupadas.

Día operativo: el día y la hora significan lo mismo que en el alta manual. En un complejo con `closes_next_day`, "lunes 00:00" es la madrugada de la noche del lunes; `createAbonado` lo resuelve con `slotIsPhysicallyNextDay`. El preview lo aclara en esas filas.

## Arquitectura

- `src/modules/abonados/abonado-import.parse.ts` — puro: texto → tabla → filas validadas contra la lista de canchas. Sin DB.
- `src/modules/abonados/abonado-import.service.ts` — `previewAbonadoImport` (conflictos contra la DB con las funciones existentes) e `importAbonados` (vuelve a correr la vista previa y llama a `createAbonado` por fila). La action le pasa cómo abrir una transacción del tenant (`withTenantContext`): una para la vista previa y una por fila.
- `src/lib/phone.ts` — `parsePhoneNumber` y `formatFullPhone`, sacados de `components/ui/phone-input.tsx` (que los importa de ahí): ese archivo es `'use client'` y el servidor no puede llamar sus funciones.
- `src/app/(admin)/abonados/importar/` — `page.tsx`, `ImportarFijosForm.tsx` y `actions.ts` (`previewAbonadoImportAction`, `importAbonadosAction`: guard → rate limit → service).
- `/abonados`: botón "Importar planilla" junto a "Nuevo turno fijo" y en el vacío.

El cliente manda el texto crudo y la fecha; el servidor parsea y valida en las dos acciones (no se confía en filas armadas por el cliente). Confirmar vuelve a correr la validación entera antes de cargar: si algo cambió desde el preview, la fila queda afuera con su motivo.

Lock y concurrencia: `createAbonado` toma `FOR UPDATE` sobre la cancha, y el lock dura hasta el COMMIT. Con el lote en una sola transacción, cada cancha tocada quedaba tomada hasta la última fila, y pasado el `lock_timeout` de 3 s de `turnogol_app` las reservas online y de la grilla de esa cancha fallaban. Con una transacción por fila, el lock dura lo que tarda una fila. Consecuencias:

- Una fila cuya cancha sigue tomada más que el `lock_timeout` (55P03, `isLockTimeout`) queda afuera con su motivo y el resto sigue.
- Un doble envío se serializa por cancha y el segundo choca con `AbonadoConflictError` (fila salteada, sin duplicados).
- Si el lote se corta a la mitad, lo ya cargado queda. Revisar de nuevo lo muestra como fijo existente, así que reintentar no duplica (es lo que dice el mensaje de error del formulario). Las listas se revalidan igual.

## Límites conocidos

Revisados en la ronda 3 y aceptados como están, sin código:

- **Espera por fila con una cancha tomada.** Si otra transacción retiene una cancha mucho rato, cada fila de esa cancha espera el `lock_timeout` de 3 s antes de quedar afuera con su motivo. Con varias filas en esa cancha, las esperas se suman.
- **UTF-16 al subir.** Un archivo guardado en UTF-16 no se lee al subirlo. Pegar lo copiado sí funciona.
- **Teléfono sin código de área.** Un número de 8 dígitos (`4234-5678`) se acepta, pero queda sin link de WhatsApp. Exigir el código de área es decisión de Lazar.
- **Mínimo de "Empiezan el".** Es el día calendario, no el operativo, igual que en el alta manual.

## Alternativas descartadas

- Subir `.xlsx`: dependencia nueva (SheetJS).
- Mapeo de columnas en pantalla: más UI para un caso que la plantilla con sinónimos ya cubre.
- Todo o nada: obliga a corregir todo antes de cargar nada.
- Tabla de contactos para personas sin fijo: veto de producto.

## Criterio de hecho

Tests unit del parser y de la validación · test de integración del alta en lote contra un `DATABASE_URL` descartable · `verificacion-ux` · `pnpm format:check`, `lint`, `typecheck` y `knip` en verde · `sonnet-adversarial-reviewer` sobre el diff.

## Ledger de delegaciones

| Subagente                     | Finalidad                                          | Costo aprox.         | Resultado                                                                                                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sonnet-ux-verifier`          | `verificacion-ux` del flujo en la app real (:3107) | ~45k tokens          | Bloqueado: el permiso denegó copiar `.env.local` al worktree; sin env no hay login. Nada verificado, nada creado.                                                                                                                                                          |
| `sonnet-adversarial-reviewer` | Revisión adversarial del diff, contexto fresco     | ~90k tokens          | Aprobado con reservas: 8 hallazgos (3 🟡, 5 🟢), ninguno de plata ni aislamiento. Aplicados: teléfono con forma, `parseDay` con `Map`, nombre sin saltos, columnas ignoradas en la revisión, test del savepoint, mensaje de medianoche, 44 px. Medido el tope (ver abajo). |
| (revisión de la sesión madre) | Revisión fresca + refutador, ronda 2               | no lanzada desde acá | Aprobado con reservas: 3 🟡 y 3 🟢. Aplicados: transacción por fila (sin savepoint) y 55P03 por fila, teléfono con 54/549 sin `+`, decimal de Excel y NBSP, comilla sin cerrar, arranque con la hora ya pasada, «contacto» fuera de Nombre, este «Por qué».                |
| (revisión de la sesión madre) | Cuatro revisores, ronda 3                          | no lanzada desde acá | Confirmaron la ronda 2 en el código. Aplicados: am/pm en las dos horas, separador con líneas en blanco arriba, guiones del teléfono, botón «Nuevo turno fijo» como en main, encabezados completos en este spec. Cuatro límites quedan anotados, sin código.                |

## Medición del tope de filas

Postgres descartable local (sin latencia de red), 200 filas repartidas en 10 canchas.

**Antes, el lote en una sola transacción:** el import tardaba 4,9 s y una reserva concurrente sobre la cancha de la primera fila, con el `lock_timeout` de `turnogol_app` (3 s), fallaba a los 3,0 s. Con 100 filas esperaba 2,4 s; con 50, 1,1 s.

**Ahora, una transacción por fila** (tres corridas cada una):

| Escenario                                                         | Total del import             | Espera de la reserva concurrente               |
| ----------------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| Solo el import                                                    | 5,96–6,01 s (30 ms por fila) | —                                              |
| Con reservas sobre la Cancha 1 una tras otra (~1.000 por corrida) | 6,4–7,1 s                    | máximo 48–63 ms, mediana 5–6 ms, ninguna falla |

Cada fila suma su BEGIN, el `set_config` del tenant y el COMMIT a las ~12 sentencias de `createAbonado`. En prod (Vercel `gru1` → Supabase `sa-east-1`) cada sentencia suma el ida y vuelta al pooler, estimado (no medido) en 1–2 ms: unas 200 filas rondarían los 9–13 s. El repo no fija `maxDuration`, así que el techo es el default del proyecto en Vercel. Si la función corta antes, lo cargado queda y reintentar no duplica. El tope `MAX_IMPORT_ROWS` queda en 200.
