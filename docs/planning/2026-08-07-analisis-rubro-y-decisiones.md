# Análisis del rubro y decisiones aplicadas

**Fecha:** 2026-08-07
**Reemplaza:** los 5 puntos de `2026-08-01-decisiones-de-fase-v2.md` §4 ("Qué validar con prospectos").
**Por qué existe:** el dueño decidió no esperar a la validación con prospectos para destrabar el plan. Este documento resuelve por análisis lo que ese §4 dejaba pendiente de campo, y deja marcado qué habría que revisar el día que exista un cliente real.

---

## 0. Nota metodológica — leer antes que nada

El repo declara, en tres documentos independientes, que **no hay validación externa**: cero complejos entrevistados con registro, cero pilotos, cero clientes, cero reservas reales. Las únicas señales de campo son charlas informales del founder (N=1-3, sin registro).

Todo lo que sigue es **razonamiento sobre datos secundarios** — sitios de competidores, capturas de precios, documentos internos y aritmética — no comportamiento observado. El repo tiene su propia regla, *"comportamiento > opinión"*, y este documento **no la deroga**.

Por eso cada decisión lleva su base de evidencia explícita:

| Marca | Significa |
|---|---|
| `VERIFICADO` | Dato comprobado contra una fuente primaria o contra el código de este repo |
| `ARITMÉTICA` | Deducción de datos verificados; el resultado depende de supuestos escritos |
| `CRITERIO` | Juicio profesional sin dato duro que lo respalde. Es lo primero que hay que romper con un cliente real |

Y cada decisión lleva su **trigger de revisión**: la observación concreta que la invalidaría.

---

## 1. La economía del complejo: doc1 no está mal, está congelado

### 1.1 La contradicción

Cuatro fuentes vivas en el repo, con un orden de magnitud de diferencia:

| Fuente | Turno | Facturación/mes | Estado |
|---|---|---|---|
| `doc/spec/doc1_problem_brief.md:62` | **$8.000** | — | Canónico según CLAUDE.md |
| `doc/spec/doc1_problem_brief.md:19` | — | **$500.000 – $3.000.000** | Ídem |
| `docs/business/TurnoGol_Plan_de_Negocio.md:291` | — | **$8.000.000 – $15.000.000** (3 canchas F5, GBA) | |
| `docs/business/TurnoGol_Plan_de_Negocio.md:152` | **$35.000 / $55.000 / $65.000** (off-prime / prime / finde) | — | |
| ATC Sports, navegado por el founder | **~$60.000** | — | Producto en producción |

`VERIFICADO` — las cuatro citas son textuales de los archivos indicados.

### 1.2 La resolución: no se contradicen, una está vieja

El error de lectura sería tratarlo como un desacuerdo sobre el tamaño del mercado. No lo es. **doc1 es internamente consistente; lo que tiene desactualizado es el precio del turno.**

`ARITMÉTICA` — Si el turno real es $55.000 y doc1 asumió $8.000, el factor es **6,9×**. Re-escalando el propio rango de doc1 por ese factor:

```
$500.000  × 6,9  =  $3.450.000
$3.000.000 × 6,9  = $20.700.000
```

El rango re-escalado, **$3,4M – $20,7M, contiene íntegro el $8M – $15M del plan de negocio.** Las dos fuentes internas siempre dijeron lo mismo; una quedó denominada en pesos de otro año.

Esto también explica por qué el dato de ATC ($60.000) y el del plan de negocio ($55.000) coinciden entre sí y ambos difieren de doc1: son mediciones del mismo momento, y doc1 no.

**Conclusión operativa:** doc1 no necesita un re-análisis de mercado. Necesita que le actualicen dos números y le pongan fecha a los supuestos. El resto de su razonamiento (volumen del segmento, dolores, personas) no depende del precio nominal.

### 1.3 Decisión aplicada: corregir doc1 y fechar sus supuestos

`VERIFICADO` + `ARITMÉTICA`

1. `doc1:62` pasa de "$8.000" a **"$55.000 (prime, 2026)"**, con nota de que el número es nominal y hay que refecharlo.
2. `doc1:19` pasa de "$500.000 – $3.000.000" a **"$8.000.000 – $15.000.000"**, alineado con el plan de negocio, que es el dato más reciente y más específico (3 canchas F5, GBA).
3. Se agrega a doc1 una línea de encabezado: *"Los montos son nominales en ARS y envejecen rápido. Revisar cada 6 meses."* — la causa raíz de este hallazgo no fue un error de análisis, fue no haber fechado un número nominal en un país con inflación alta.

**Trigger de revisión:** la primera factura o cierre de caja real de un complejo cliente reemplaza toda esta sección.

### 1.4 La consecuencia comercial que hoy no está escrita en ningún lado

`ARITMÉTICA` — El plan Complejo son **$85.000/mes** sobre una facturación de **$8M – $15M**:

```
$85.000 / $8.000.000  = 1,06 %
$85.000 / $15.000.000 = 0,57 %
```

Entre medio punto y un punto porcentual. Traducido a la unidad que el dueño del complejo maneja de memoria: **menos de dos turnos prime por mes.**

Ese es el encuadre correcto del precio, y no aparece en ningún documento comercial. El script de objeciones de `TurnoGol_Plan_de_Negocio.md:335` ya intuía el argumento —*"con que salves un turno ya saliste hecho"*— pero **cita un precio que no existe** ("el sistema sale $30.000/mes" contra los $55/85/115k reales de la migración 043). `VERIFICADO`

**Decisión aplicada:** el encuadre de precio deja de ser el número absoluto y pasa a ser el porcentaje de facturación / la cantidad de turnos. Y se corrige el precio muerto del script.

---

## 2. Los pilares comerciales se invierten: la plata primero

El GTM marca esto como *la hipótesis más cara del proyecto*: ¿el dolor #1 es el turno colgado o el control de la caja? Se resuelve sin prospectos, porque hay cinco líneas de evidencia y **las cinco apuntan al mismo lado**.

### 2.1 La evidencia

**(a) "Tu cancha siempre llena" está comoditizado — y ya prohibido en este repo.** `VERIFICADO`
`docs/gtm/research/2026-07-18-competidores.md:186` lo documenta: literal en Korus y en Dónde Juego, parafraseado por JuegaFácil. El red team (`TURNOGOL_MARKETING_RED_TEAM.md:159`) va más lejos y anota que el eslogan que pedía el encargo original —*"la app que te llena de reservas"*— **es exactamente ese cliché**. Cinco competidores además dicen alguna variante de "sin WhatsApp, sin cuadernos".

Un mensaje que tres competidores emiten idéntico no diferencia: es ruido de fondo del rubro.

**(b) El dueño ya declaró la caja "FUNDAMENTAL", por escrito.** `VERIFICADO`
`docs/decisions/DECISIONES_SISTEMA.md:481`, respondiendo si el cierre de caja diario era overkill para v1: *"Si, tiene que tener cierre de caja diario. Es FUNDAMENTAL para llevar control del dinero."* Es la única respuesta de ese documento en mayúsculas.

**(c) Es un hueco del líder.** `VERIFICADO` (doc2)
ATC gestiona ingresos y stock; **no tiene gestión de gastos**. Un complejo que quiere saber cuánto le quedó de verdad al final del día tiene que salir del sistema.

**(d) El producto ya está construido alrededor de la plata.** `VERIFICADO`
Fase 1 se llama literalmente *"la plata visible"*; Fase 2 es *"Hoy"*, cuyos tres números son de caja. Caja y Cantina fueron el rediseño más grande de julio (migraciones 048–051). El día operativo se alineó primero en caja y recién ahora en reportes. **El desalineado es el marketing, no el producto.**

**(e) La única señal de campo espontánea apuntó a control de reservas, no a la seña.** `CRITERIO` (N≈1-3, sin registro — la señal más débil de las cinco, y se cita como tal.)

### 2.2 Decisión aplicada

`VERIFICADO` en (a)-(d), `CRITERIO` en la síntesis.

**Pilar primario: el control de la plata. Ocupación pasa a segundo.**

Concretamente, el orden del pitch se invierte:

| Antes | Ahora |
|---|---|
| 1. Te llenamos la cancha | 1. Sabés cuánta plata entró, cuánta falta y quién te debe |
| 2. Cobrás señas por MP | 2. Cobrás señas a **tu** MercadoPago, y el que no viene te dejó la seña |
| 3. Controlás la caja | 3. Y de paso los pibes reservan solos |

La ocupación no se abandona: se convierte en la **consecuencia** que se menciona después, no en la promesa que abre. Lo que se abandona es competir en el eslogan que el rubro ya quemó.

**Trigger de revisión:** si de las primeras 5 charlas registradas, 3 o más nombran espontáneamente "turnos colgados / cancelaciones" antes que cualquier tema de plata, la decisión se revierte. Es una pregunta abierta al inicio de la charla, sin mencionar ninguno de los dos temas.

---

## 3. El set de etiquetas D3 (destraba B12 → B13)

D3 ya fijó el marco: **solo etiquetas predefinidas, sin texto libre**, redactadas para poder ser leídas por el titular ejerciendo derecho de acceso (Ley 25.326). El §4 del documento de fase dejaba el set final a validación con prospectos. Se resuelve acá.

### 3.1 La regla que ordena el set

`CRITERIO`, pero con un criterio verificable: **una etiqueta solo se justifica si captura algo que el sistema no puede medir solo.**

El sistema ya conoce, por dato duro: cuántas veces reservó, `noshow_count`, `last_no_show_at`, si tiene un softban vigente, y cuánto debe. Una etiqueta que duplique cualquiera de esas cosas es peor que redundante: **envejece mal**. Alguien la escribe una vez y queda pegada mientras el dato real cambia debajo.

### 3.2 El set

| Etiqueta | Qué acciona en la operación | Por qué es defendible si el titular la lee |
|---|---|---|
| **Se le fía** | Habilita al encargado a abrir cuenta de cantina | Es la política de crédito del complejo, no un juicio sobre la persona |
| **No fiar** | La inversa, explícita | Ídem. Explícita es mejor que implícita: "no está en la lista" es ambiguo, "no fiar" es una decisión con dueño |
| **Organiza el grupo** | Es el contacto útil: junta la plata, decide el horario, avisa si no van | Descriptiva y neutra. Es un rol, no una calificación |
| **Tiene precio acordado** | Evita cobrar de más o de menos; obliga a mirar antes de tipear el monto | Puramente operativa |
| **Trato conflictivo** | Prepara al encargado antes de atender | La única con carga negativa. Se redacta como observación operativa, nunca como calificación de la persona |

### 3.3 Las dos que se descartan, y por qué

- **VIP** — es una categoría comercial que el complejo **no ofrece**. No hay beneficio asociado, no hay criterio de entrada, no hay quien la revoque. Una etiqueta sin consecuencia es decoración que igual es dato personal: todo el costo legal, cero beneficio operativo.
- **Paga tarde** — el sistema ya lo mide con la deuda real, en tiempo real. Es el caso exacto de la regla §3.1: una opinión congelada compitiendo con un dato vivo.

Ambas venían del ejemplo de D3 (*"del estilo: VIP / paga tarde / no fiar / conflictivo"*), que el propio documento marcó como provisorio.

### 3.4 Nota de implementación para B12

El set es **cerrado** (ENUM `player_tag`), no una tabla de configuración por complejo. Un set abierto reintroduce por la ventana lo que D3 cerró por la puerta: el complejo que crea la etiqueta "chanta" tiene el mismo problema legal que el campo de texto libre, con más pasos.

**Trigger de revisión:** si en las primeras charlas aparece dos veces o más una necesidad que ninguna de las 5 cubre, se agrega una sexta al ENUM (es aditivo). Si aparece la necesidad de texto libre, **eso no se concede**: se reabre D3 con el dueño, que ya la rechazó con fundamento.

---

## 4. Boundaries de planes: RESUELTO — los cortes se alinean con ATC

> **Estado: decidido y aplicado el 2026-08-07** (migr. 071). Esta sección conserva el análisis que llevó a la decisión; la decisión está en §4.5.

### 4.1 El problema, cuantificado

`VERIFICADO` — precios de ATC por captura del founder navegando desde IP argentina (2026-07-19); precios de TurnoGol por la migración 043 y `plans-data.ts`; `max_courts` = 2 / 5 / NULL confirmado en el código.

**Los cortes no coinciden.** ATC corta en 1-3 / 4-6 / 7+; TurnoGol en 1-2 / 3-5 / 6+. Por eso la comparación es por franja y no global:

| Canchas | TurnoGol | ATC | Quién gana |
|---|---|---|---|
| 1–2 | $55.000 | $66.000 | TurnoGol (-17%) |
| **3** | **$85.000** | **$66.000** | **ATC — TurnoGol +29%** |
| 4–5 | $85.000 | $104.000 | TurnoGol (-18%) |
| **6** | **$115.000** | **$104.000** | **ATC — TurnoGol +11%** |
| 7+ | $115.000 | $136.000 | TurnoGol (-15%) |

### 4.2 Lo que agrega este análisis: no es una franja marginal, es la puerta de entrada

El red team ya había detectado que las dos franjas perdedoras caen dentro del ICP. Lo que faltaba decir es **dónde exactamente**:

`VERIFICADO` — `doc1:31` define el segmento pagador como *"con 3+ canchas y facturación suficiente para pagar un SaaS: ~3.000-4.000"*. Y el arquetipo del plan de negocio (`:291`) es textualmente *"un complejo con 3 canchas de F5 en GBA"*.

O sea: **3 canchas no es un caso borde del ICP. Es el piso del ICP y el ejemplo canónico del propio plan de negocio.** El complejo más representativo del mercado objetivo es exactamente aquel al que TurnoGol le cobra 29% más que el líder.

`CRITERIO` — Esto convierte el problema de "una franja incómoda" en un problema de **conversión del primer cliente**. El primer prospecto que firme probablemente tenga 3 canchas, y va a comparar.

### 4.3 El dato adicional que cambia el marco: ATC es el barato, no el caro

`VERIFICADO` — `doc2:126`: **JuegaFácil cobra $80.000 (hasta 2 canchas) / $120.000 (hasta 8)** — más caro que TurnoGol en cada tramo.

TurnoGol no está caro contra el mercado. Está caro **contra ATC específicamente**, en dos franjas, porque ATC eligió cortes más generosos abajo. El posicionamiento de precio general está sano; el problema es local y tiene tres salidas.

### 4.4 Las tres opciones, con su costo real

| Opción | Qué implica | Costo | Cuándo es la correcta |
|---|---|---|---|
| **(a) No tocar nada** | El precio fundador (-20/30% × 6 meses) deja Complejo en $59.500–68.000, que tapa la brecha de la franja de 3 casi exacto | Cero técnico. La brecha vuelve al mes 7, con el cliente ya adentro | Si el plan es cerrar pocos clientes acompañados y construir casos antes de escalar |
| **(b) Mover Predio a 1–3 canchas** | El complejo de 3 canchas paga $55.000 en vez de $85.000 | **Revenue**: -$30.000/mes por cada cliente de 3 canchas. Técnico: bajo — `UPDATE plans SET max_courts = 3`, más `plans-data.ts` y doc4 | Si 3 canchas resulta ser la moda de la distribución. $55.000 cobrados > $85.000 no vendidos |
| **(c) Escalón intermedio** | Un cuarto plan para la franja 3 | El más caro de todos: cuarto plan en pricing, upgrade/downgrade, comparativa, docs. Complejidad permanente por un problema de dos franjas | Casi nunca, a esta escala |

`CRITERIO` — **Recomendación: (b), condicionada al dato.** El argumento es que la opción (a) resuelve la venta y patea el problema al mes 7, que es exactamente cuando el cliente evalúa si sigue; y que el diferencial de $30.000 solo es una pérdida si el complejo de 3 canchas hubiera comprado a $85.000 igual — cosa que la comparación con ATC hace improbable.

### 4.5 DECISIÓN DEL DUEÑO (2026-08-07): cortes alineados + suba de precios

El dueño eligió **(b) mover Predio a 1-3 canchas**, y agregó algo que este análisis no había propuesto: **subir los precios al mismo tiempo**, quedando igual por debajo de ATC.

Aportó además un dato más fresco que el del repo. `VERIFICADO` (navegación del founder desde IP argentina, 2026-08-07): **ATC ahora cobra $71.000 / $111.000 / $145.000** — subió ~7-8% desde la captura de julio ($66.000 / $104.000 / $136.000). El IVA de ATC **sigue sin aclararse** en su sitio, igual que en julio.

**Lo aplicado (migr. 071):**

| Plan | Canchas | Mensual | Anual (por mes) |
|---|---|---|---|
| Predio | **1 – 3** | **$63.000** | $50.400 |
| Complejo | **4 – 6** | **$99.000** | $79.200 |
| Estadio | **7+** | **$129.000** | $103.200 |

**Por qué esto cierra el problema y no solo lo mueve:** alinear los cortes con los de ATC convierte una comparación cruzada —donde el resultado dependía de en qué franja caía cada complejo— en una comparación franja contra franja. Con eso, **TurnoGol queda ~11% abajo en las tres, sin excepciones**:

| Canchas | Antes | Ahora | vs ATC | Efecto para el complejo |
|---|---|---|---|---|
| 1–3 | $55.000 / $85.000 | **$63.000** | $71.000 (-11%) | El de 3 canchas **baja** de $85.000 a $63.000 |
| 4–6 | $85.000 / $115.000 | **$99.000** | $111.000 (-11%) | El de 6 canchas **baja** de $115.000 a $99.000 |
| 7+ | $115.000 | **$129.000** | $145.000 (-11%) | Sube 12% |

Las dos franjas que perdían contra ATC no solo dejan de perder: son las que más **bajan** de precio. Y las que suben lo hacen manteniendo la ventaja.

`ARITMÉTICA` — con el encuadre de §1.4, el plan Complejo pasa de 1,06%–0,57% de la facturación a **1,24%–0,66%**. Sigue por debajo del 1,5% y sigue siendo menos de dos turnos prime por mes.

### 4.6 🔴 Lo que este cambio destapó: el IVA no está implementado

`VERIFICADO` — barrido completo de `src/` el 2026-08-07: **cero implementación de IVA**.

`doc4` §1 decía *"Precios NO incluyen IVA — se agrega 21% en el checkout"*, y hay dos menciones más (§7 el CTA de upgrade "+ IVA", §11 la proyección de MRR "sin IVA"). **El checkout cobra el precio pelado.**

Importa porque **cambia el signo de toda la comparación de arriba**:

- Si $63.000 es el precio final → ganamos 11% contra los $71.000 de ATC.
- Si hay que sumarle 21% → **$76.230, y perdemos** contra ATC.

Y como el sitio de ATC tampoco aclara su tratamiento de IVA (verificado dos veces), hoy no se puede afirmar cuál de los dos escenarios es el real.

Es una decisión de negocio y fiscal, no técnica. **Queda como REQUIERE INPUT** hasta que el dueño defina si el precio publicado es final o si el IVA se discrimina. No se resuelve por análisis: depende de su condición frente a AFIP y de qué factura emite.

**El dato que la destraba, del lado de ATC:** preguntarle a un cliente o ex-cliente de ATC qué paga **según factura** — ya estaba anotado como pendiente de las charlas del segmento S6 desde julio.

**El dato para el punto 4 de §6 sigue vigente:** cuántos complejos de exactamente 3 canchas hay en el corredor. Ya no destraba la decisión (ya está tomada), pero mide cuánto revenue se resignó y valida si el corte quedó donde correspondía.

---

## 5. Las decisiones menores que también se cierran

### 5.1 D7 (onboarding invertido) — confirmada

`CRITERIO` + señal de campo débil. La señal registrada de las charlas informales fue *"tiene muchas cosas"* — que es exactamente la objeción que D7 ataca: dar la grilla usable en menos de 10 minutos y dejar MercadoPago, foto y portal como misiones posteriores.

Se confirma tal como está escrita, **con su trigger de reversión intacto**: si de los primeros 5 onboardings reales la mayoría no conecta MP en 7 días **y** declara que cobrar señas era su motivo de alta, se vuelve a MP-en-wizard.

Nada que cambiar. Se anota que el trigger **necesita instrumentación** para poder dispararse — y eso es exactamente el bloque B4 del plan de limpieza. Sin B4, D7 es irreversible por ceguera.

### 5.2 Vocabulario ("Plata en la calle", "fijos", "Hoy") — resuelto por criterio, sin validación

`CRITERIO`

Son términos del rubro, no invenciones del producto: "fijo" es como el complejo llama al abonado semanal, y "plata en la calle" es la expresión corriente para lo que se entregó y no se cobró. El riesgo de validarlos con prospectos era descubrir que **no** son del rubro; el riesgo real es el inverso y menor: que un dueño particular use otra palabra.

Se mantienen. Es una decisión barata de revertir (son strings) y cara de discutir sin datos.

### 5.3 Inconsistencias documentales encontradas al hacer este análisis

`VERIFICADO` — cada una comprobada contra el código, no solo contra otros documentos.

**1. `doc4` se contradice a sí mismo sobre los límites de canchas.**
- `doc4:30-32` (tabla de planes): 1-2 / 3-5 / 6+
- `doc4:318`: *"Para cambiar al plan Predio necesitás tener máximo 3 canchas activas"*
- `doc4:454`: tabla de límites con 3 / 6 / Ilimitado
- `doc4:464`: *"Tu plan permite 3 canchas"*

**El código dice 2 / 5 / NULL** (migración 043 y `plans-data.ts`), o sea coincide con `doc4:30-32`. Las secciones §8 del mismo documento quedaron con los límites viejos. **Es ruido documental, no un bug** — pero es el tipo de ruido que hace que alguien implemente el número equivocado. Se corrigen las tres citas.

**2. El script de objeciones cita un precio muerto.** `TurnoGol_Plan_de_Negocio.md:335` dice *"el sistema sale $30.000/mes"*. Los precios reales son $55/85/115k desde la migración 043. Se corrige junto con el encuadre de §1.4.

**3. Tres listas de precios vivas** (doc4, `plans-data.ts`, tabla `plans`). El CLAUDE.md ya advierte que `plans-data.ts` y la tabla `plans` hay que mantenerlos en sync. **Recomendación:** un test que compare `plans-data.ts` contra la tabla `plans` en integración — mismo patrón que `schema-drift.test.ts`, que ya existe y ya prueba que el enfoque funciona. Es barato y elimina una clase entera.

**4. La "inconsistencia 6 vs 14 días de anticipación" NO EXISTE.** Este documento la traía como hallazgo heredado del plan; verificada, es falsa. `DECISIONES_SISTEMA.md:134` dice "default 14 días" en la línea **"Estado actual"** —el contexto previo a la pregunta— y la respuesta del dueño, dos líneas abajo, dice: *"Hacer lo mismo que ATC. Anticipación: Las reservas se limitan a 6 días"*. El código usa 6 en los 12 sitios donde aparece, incluida la migración 003. **No hay nada que corregir.** Se deja escrito para que el próximo grep de "14 días" no vuelva a levantar la falsa alarma.

---

## 6. Qué revisar el día que haya un cliente real

Este documento reemplaza validación de campo por análisis. La deuda que eso genera se paga con esta lista, en orden de qué tan caro es haberse equivocado:

| # | Qué revisar | Cómo | Qué lo invalida |
|---|---|---|---|
| 1 | **El pilar primario (§2)** | Pregunta abierta al inicio de la charla, sin nombrar ni plata ni ocupación | 3 de 5 charlas nombran "turnos colgados" antes que cualquier tema de plata |
| 2 | **La economía (§1)** | La primera factura o cierre de caja real | Cualquier cosa fuera de $8M–$15M para 3 canchas |
| 3 | **El set de etiquetas (§3)** | *"¿Qué anotás hoy de un cliente en el cuaderno?"* | Una necesidad repetida que ninguna de las 5 cubre |
| 4 | **Boundaries de planes (§4)** | El scraper: cuántos complejos de exactamente 3 canchas hay en el corredor | Ya no destraba la decisión (tomada en §4.5), pero mide cuánto revenue se resignó |
| 5 | **D7 (§5.1)** | Instrumentación de B4 sobre los primeros 5 onboardings | Mayoría sin MP a 7 días + señas como motivo de alta |
| 6 | **🔴 El IVA (§4.6)** | Definición del dueño + factura real de un cliente de ATC (segmento S6) | **Abierto.** Si el precio no es final, la ventaja del 11% se vuelve desventaja del 7% |

---

*Cerrado el 2026-08-07. Cinco decisiones aplicadas (§1.3, §2.2, §3.2, §4.5, §5.x), un hallazgo del plan original refutado (§5.3.4), y uno nuevo abierto que el propio trabajo destapó: el IVA de §4.6, que ninguna de las dos partes del análisis había mirado y que cambia el signo de la comparación de precios. La divergencia documentada vale más que el consenso retroactivo — mismo criterio que el documento de fase del 2026-08-01.*
