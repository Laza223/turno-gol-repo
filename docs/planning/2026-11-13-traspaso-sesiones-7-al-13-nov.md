# Traspaso de sesiones: del 7 al 13 de noviembre de 2026

**Para quién:** una sesión de Claude Code que arranca desde otra cuenta, sin acceso a las conversaciones de las últimas dos semanas. Este documento junta lo que pasó, lo que quedó abierto y lo que **no** está en el repo, para que no se pierda nada.

**Cómo leerlo:** primero `CLAUDE.md`, después este documento, después las decisiones que enlaza. Si algo de acá contradice al código o a una decisión escrita, manda lo escrito y el código: este traspaso es una foto del 2026-11-13.

**Qué cubre:** el trabajo hecho entre el 7 y el 13 de noviembre en la cuenta provisoria. **Qué no cubre:** lo anterior al 7/11 (ver "Trabajo local sin respaldo").

## 1. Qué se hizo

| Tema | PR | Decisión o spec |
| --- | --- | --- |
| **Cobros en el mostrador**, a partir de la visita del 7/11 a un complejo: cobrar varios turnos de una, dar por perdido lo que falta cobrar | #573, #574, #578 | [`2026-11-07-cobrar-varios-y-dar-por-perdido.md`](../decisions/2026-11-07-cobrar-varios-y-dar-por-perdido.md) |
| **Turnos fijos**: cobrar varias fechas, editar un fijo en todas sus fechas futuras, cancelar fijos con fechas cobradas | #575, #576, #577 | [`cobro-fechas-fijo`](../superpowers/specs/2026-11-08-cobro-fechas-fijo-design.md), [`editar-turno-fijo`](../superpowers/specs/2026-11-08-editar-turno-fijo-design.md) |
| **Textos del panel y del alta** revisados con la skill `turnogol-copy` | #575 | |
| **Marca en la ficha**: pie "Reservas con TurnoGol" hacia `/para-complejos` | #579 | |
| **Vercel Web Analytics** en las páginas públicas (el panel y el super-admin no se miden; a ninguna URL se le mandan query strings porque los links de acceso llevan tokens) | #580 | |
| **Motivo de cancelación** de lista cerrada y Métricas con el porqué de los turnos caídos (migración 109) | #581 | |
| **Grilla**: mover un turno arrastrándolo; vista por semana de una cancha con selector Día / Semana | #583, #584 | |
| **Canchas divisibles**: diseñada, revisada y **pausada por el dueño** ("no es prioridad") | #585 | [`2026-11-10-canchas-divisibles.md`](../decisions/2026-11-10-canchas-divisibles.md) |
| **Freemium**: estado `free`, tope de 20 reservas online por mes, el que no paga baja a gratis (migraciones 110 y 111) | #586, #587 | [`2026-11-08-freemium.md`](../decisions/2026-11-08-freemium.md), [`2026-11-08-freemium-spec-y-estado-free.md`](../decisions/2026-11-08-freemium-spec-y-estado-free.md), propuesta original en [`2026-11-08-freemium-turnogol.md`](2026-11-08-freemium-turnogol.md) |
| **Alta del complejo por toques**: el dueño arma el complejo y recién al final crea la cuenta (Google o mail; el mail se verifica después, migración 112) | #588, #589 | [`2026-11-08-alta-por-toques.md`](../decisions/2026-11-08-alta-por-toques.md), [spec](../superpowers/specs/2026-11-08-alta-por-toques-design.md) |
| **Estrategia de entrada**: distribución por audiencia, volante, ideas del founder, referencias de competidores y del alta | docs | [`2026-11-08-entrada-por-audiencia-y-volante.md`](../decisions/2026-11-08-entrada-por-audiencia-y-volante.md), [`2026-11-08-ideas-del-founder.md`](2026-11-08-ideas-del-founder.md), [`2026-11-08-referencia-deporturnos.md`](2026-11-08-referencia-deporturnos.md), [`2026-11-08-onboarding-referencia-cancheria.md`](2026-11-08-onboarding-referencia-cancheria.md) |
| **Portal del jugador**: primero plano en dos temas (2026-11-08), después **vidrio** (2026-11-13, lo reemplaza) | #582, #590 | [`2026-11-13-portal-vidrio.md`](../decisions/2026-11-13-portal-vidrio.md), [dirección](2026-11-13-portal-vidrio-direccion.md), [plan F0 a F9](2026-11-13-portal-vidrio-plan.md), [mockup](mockups/2026-11-13-portal-vidrio/README.md) |
| **Ideas nuevas** para el complejo y para RIVAL | este PR | [`2026-11-13-ideas-complejo-y-rival.md`](2026-11-13-ideas-complejo-y-rival.md) |

Tres documentos (`2026-11-08-freemium.md`, `2026-11-08-freemium-turnogol.md` y `2026-11-08-referencia-deporturnos.md`) estaban sin commitear en el checkout principal, y desde `main` varios documentos los enlazaban sin que existieran. Entran con este PR. También entra una corrección de una línea en `2026-11-08-entrada-por-audiencia-y-volante.md`: "Entrar con Google" en el alta figuraba como recomendación sin decidir y el founder ya había elegido que sí.

## 2. Decisiones del dueño en este período

Las decide Lazar (founder), casi siempre por select. Están escritas en los documentos de arriba. Lo que más condiciona el trabajo siguiente:

- **Freemium:** el que no paga baja al plan gratis y no a `blocked`. Gratis = hasta 20 reservas online por mes, sin seña, sin MercadoPago, sin bot de WhatsApp, lo que carga el staff se ve "Ocupado". Se lanza en todo el país, sin piloto. Meta: 50 complejos en el mapa y 5 que pasan a pago a 90 días. Los planes son tres: Gratis, Completo y Completo + WhatsApp.
- **Alta:** "Entrar con Google" va junto al mail. El mail nunca bloquea el alta.
- **Portal:** vidrio en claro y oscuro para todo lo que no es el panel, y la ficha del complejo reserva en una sola pantalla. Se permite `motion` y las transiciones de vista en el portal.
- **Canchas divisibles:** pausada. No implementar sin que lo reabra el dueño.

## 3. Abierto: preguntas sin respuesta registrada

Ninguna de estas tiene respuesta escrita en el repo. No resolverlas en silencio: son decisiones del dueño.

**Freemium (preguntas que dejó el PR #587):**
1. Las cancelaciones que el staff carga "a pedido del jugador" se guardan como `canceled_by='admin'`. Hoy cuentan para la pausa automática (5 en el mes) y consumen el tope. ¿Tienen que contar?
2. En gratis, "Exportar datos" baja el CSV completo, con nombres y caja de antes. ¿Es portabilidad deliberada?
3. "Ya marqué mis ocupados" reabre la reserva online sin límite de veces. ¿Se acepta?
4. Subir `CURRENT_TERMS_VERSION` y mandar el aviso de 30 días a los complejos que ya existen.

Pendientes conocidos del mismo PR (no son preguntas, son deuda):
- Realtime manda la fila entera al navegador y es el cliente el que la enmascara. Solo se cierra con política o columnas.
- En gratis, el panel del turno todavía ofrece acciones pagas, que el server rechaza.
- `withTenant` no deja pasar la impersonación en gratis, igual que en bloqueado.

**Alta por toques (pendientes conocidos del PR #588, para otro PR):** el alta no es transaccional si `createTenantWithTrial` falla a la mitad; carrera si se finaliza dos veces; falta chequeo de rol al finalizar; el borrador no vence; la vinculación automática de GoTrue con Google no se verificó; el alta con Google no se probó. La ficha "Tu complejo" está solo en `/register`, no en el alta asistida (`/onboarding/*`).

**Portal de vidrio:** cuatro preguntas con camino por defecto, al final del [plan](2026-11-13-portal-vidrio-plan.md): el ingreso del complejo, las fotos propias del hero, el titular de planes y los videos y logos.

**Ideas:** la tarjeta de sellos roza dos vetos y necesita OK escrito antes de diseñarla (ver el documento de ideas).

## 4. Qué sigue, en orden

1. **Portal de vidrio, fase F1** (cimientos y cromo), siguiendo el [plan](2026-11-13-portal-vidrio-plan.md). Un PR por fase, y el OK de Lazar antes de mergear cada una.
2. Pendientes del freemium y del alta de la sección 3.
3. Lo que decida el dueño de las ideas nuevas.

## 5. Lo que no está en el repo, a propósito

El repo es **público**: no entran clientes con nombre, números de clientes ni precios especiales. Por eso quedaron afuera:

- **Una negociación en curso con un complejo cliente:** una hoja para el cliente y un guion de la charla, hechos como documentos de claude.ai. Los montos salen de `src/modules/billing/pricing.ts`, no de acá.
- **El bot de WhatsApp de un complejo cliente.** El 7/11 el proyecto de Kapso (plan Free, 2.000 mensajes por mes) llegó al tope y dejó de entregar mensajes. Hay un plan para pasar el número a un proyecto nuevo de Kapso. Está en los archivos de plan locales de la máquina de Lazar porque lleva identificadores del cliente. **No se pudo confirmar en esta cuenta si se ejecutó.** La constante `KAPSO_PLAN_MONTHLY_MESSAGES` de `src/modules/super-admin/whatsapp-monitor.service.ts` vale 2000 y solo es correcta si el proyecto sigue en el plan Free.
- **Un análisis de otro negocio** ajeno a TurnoGol, hecho en una sesión suelta.
- **Un Design System como artifact** que no llegó a publicarse.

## 6. Trabajo local sin respaldo

Estos cambios están solo en la máquina de Lazar. **No son de este período** (son anteriores al 7/11) y no se tocaron, pero hoy un disco roto los pierde:

- En el checkout principal, rama `feat/panel-mobile-denso`: 6 commits sin empujar, del 29/10 al 4/11 (panel mobile más denso, modales de alta y cobro más tranquilos, la seña pasa a opcional en los textos de precios, `/para-complejos` corta). El checkout principal está además atrasado respecto de `main` y tiene archivos modificados y sin seguir.
- Ramas locales sin remoto: `feat/portal-mobile` (4/11), `fix/rescate-commits-perdidos` (17 al 21/10), `feat/compartir-horarios-elegibles` (27/10), `fix/super-admin-worker-colgado`, `claude/eager-pasteur-08364f`, `worktree-placa-turnos-libres`, `test/cobertura-verificada` (29/8), `feat/demo-recorder-dark` (12/8) y tres ramas `archive/stash-*`.

Antes de empujar cualquiera hay que mirarla: algunas pueden estar ya integradas por otro camino.

## 7. Reglas de trabajo que se repiten

Las de `CLAUDE.md` mandan. Las que más se tropiezan:

- **Solo `pnpm`.** Nunca `npm` ni `npx`.
- **Nada se commitea ni se pushea sin pedido explícito.**
- **Migraciones:** se aplican solas al mergear a `main`. Con varias sesiones en paralelo hay que repartir los números antes de crearlas: en estas dos semanas la 109 fue de cancelación, la 110 y la 111 de freemium y la 112 del alta (la del alta empezó como 110 y hubo que renumerarla).
- **Tanda de PRs en paralelo sobre la misma función** (pasó con `addBookingChargeAction`, #574 y #578): hay que resolver el conflicto dejando las dos lecturas bajo el lock.
- `e2e-tests` y `visual-regression` **no corren en los PRs**: lo que los toca se corre a mano.
- Los textos visibles pasan por la skill `turnogol-copy`. Las decisiones de negocio se reportan como "REQUIERE INPUT", no se resuelven.
- Cada cambio de frontend se mira en la app corriendo (390 px y 1440 px, en los dos temas), no solo con los tests.

## 8. Las sesiones, una por una

| Sesión | Qué produjo |
| --- | --- |
| Arranque en la cuenta provisoria y plan de acción | Los documentos de estrategia de la sección 1 y el plan del bot de la sección 5 |
| Cobros del mostrador (varias sesiones encadenadas) | #573 a #578 |
| Marca en la imagen de horarios y pie del complejo | #579 |
| Instalar Vercel Web Analytics | #580 |
| Motivo de cancelación con lista cerrada | #581 |
| Grilla: arrastrar, vista semana y divisibles | #583, #584, #585 |
| Freemium: spec y construcción del plan Gratis | #586, #587 |
| Onboarding nuevo estilo: spec y build mobile | #588, #589 |
| Portal: mockup plano, después de vidrio, dirección y plan | #582, #590 |
| Ideas de TurnoGol para complejos y jugadores | [`2026-11-13-ideas-complejo-y-rival.md`](2026-11-13-ideas-complejo-y-rival.md) |
| Actualizar los skills Taste e Impeccable | Nada en el repo: Impeccable pasó de 4.8.1 a 4.8.2 y Taste de v2 a 2.5.1, a nivel usuario. El instalador de Taste marcó riesgo "Critical" (Gen) y "Med" (Snyk) y Socket 0 alertas: tomar la 2.5.1 como no revisada. |
| Google Modern Web Guidance | Solo una evaluación: sirve para la calidad técnica del HTML y CSS que escribe Claude, no reemplaza al diseño. No se instaló. |
| Financiamiento, una consulta ajena a TurnoGol y el Design System | Fuera del repo (sección 5) |
