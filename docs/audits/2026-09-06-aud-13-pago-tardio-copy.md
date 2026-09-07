# AUD-13 — El aviso de pago tardío afirmaba un reembolso automático que no existe

Registro de la tarea T-0 del lote 1 de la auditoría técnica integral del 2026-09-06 (hallazgo
AUD-13, §D.1; tarea T-0, §G). El informe de esa auditoría todavía no está en `main`: vive en el
árbol de trabajo del dueño junto con otros cambios pendientes, por eso este registro no lo enlaza.
Ejecutada el 2026-09-06 (tarde) y cerrada el 2026-09-07 (madrugada ART), con autorización acotada
del dueño: sólo esta corrección, en un PR propio, separado de todo lo demás.

## Causa

`handleApproved` (`src/modules/payments/payment.service.ts`, ~615-690) atiende un pago que
MercadoPago aprobó cuando la reserva ya estaba en estado terminal. Si el estado es `expired`,
llama `prepareLatePaymentRefund` → `prepareRefund` (~700-760 y ~1160-1240), que **inserta una
fila en `payments` con `type='refund'` y `status='pending'`** y emite
`payment.late_payment.refund_registered`. No llama a MercadoPago ni mueve plata: el comentario del
propio service lo dice ("'reembolsado' sería mentira: lo que ocurre es que quedó ANOTADA la
devolución. El complejo la salda después"). Después encola al dueño `admin_late_payment` con
`content.refundIssued = (preparedRefund !== undefined)` y al jugador
`player_late_payment_refunded`, cuyo texto es correcto ("la devolución está en curso, la gestiona
el complejo").

`refundIssued === true` significa entonces **"quedó registrada una devolución pendiente"**. El
template `admin-late-payment.ts` conservaba el texto de cuando existía el reembolso por API (PR
#183): asunto "Pago tardío reembolsado automáticamente", cuerpo "TurnoGol pidió la devolución a
MercadoPago automáticamente y le avisó al jugador. No tenés que hacer nada". Los PR #203/#212
eliminaron ese mecanismo (el scope `payments:refunds` devuelve 403 con cuentas de terceros,
CLAUDE.md) sin tocar el template. El único actor que puede devolver la plata recibía la
instrucción de no actuar. El test unitario existente afirmaba la misma mentira
(`expect(html).toContain('automáticamente')`).

**Alcance (verificado en código antes de delegar):** defecto exclusivamente de comunicación. La
fila pendiente, el aviso al jugador, la lista en Caja y Cantina → Devoluciones
(`listPendingRefunds`, `refund.service.ts:169-171`: `type='refund' AND status='pending'`), el
recordatorio a los 7 días (`admin_refund_pending_reminder`) y la detección de una devolución hecha
desde el panel de MercadoPago (`payment.external_refund_detected`, `payment.service.ts` ~330-440,
que pasa la fila pendiente a `approved`) ya eran coherentes entre sí. No hubo que tocar pagos,
reembolsos, deuda, persistencia ni reglas de negocio. Consumidores: `templates/index.ts` sólo
registra el renderer; `mp-webhook.test.ts`, `late-payment-refund.test.ts` y
`mp-webhook-handler-push-gate.test.ts` sólo miran `template_name`. Nada más afirmaba ese texto.

## Cambios

Implementados por un subagente Sonnet (`sonnet-implementer`, modelo explícito) con contrato
cerrado: dos archivos permitidos, test en rojo antes del fix, presupuesto ~80 líneas. Diff: 2
archivos de código, 76 inserciones, 20 borrados, más este registro.

**`src/modules/notifications/templates/admin-late-payment.ts`** — sólo la rama
`refundIssued === true` y el doc comment del campo:

- Asunto: `⚠️ Pago tardío recibido — devolución pendiente (reserva #ref)` (antes: "Pago tardío
  reembolsado automáticamente").
- Encabezado: `Pago tardío recibido` para las dos ramas (antes la rama `true` decía "Pago tardío
  reembolsado"; quedó una constante en vez de un ternario con dos ramas iguales; la salida de la
  rama `false` no cambia).
- Cuerpo (html y texto): "El turno ya se había liberado, así que quedó **registrada una devolución
  pendiente** en Caja y Cantina → Devoluciones, y se le avisó al jugador que está en curso. **La
  plata todavía no volvió**: devolvésela vos por donde te quede más cómodo — MercadoPago,
  transferencia o efectivo — y después marcala en Caja y Cantina → Devoluciones. Si la devolvés
  desde el panel de MercadoPago, se marca sola." La última frase es verbatim del recordatorio de
  7 días y está respaldada por la detección de devolución externa.
- Doc comment de `refundIssued`: dice qué significa de verdad (fila `payments` pendiente, sólo
  sobre `expired`), que no implica plata devuelta, y por qué el nombre se conserva (viaja en
  `notifications.content` de filas ya encoladas; renombrarlo rompería su render y tocaría
  `payment.service.ts`, fuera de alcance).
- Rama `false`/ausente: byte a byte igual ("Se requiere acción manual para reembolsar o
  reasignar"). Firma, tipo y nombre del campo: sin cambios.

**`tests/unit/notification-templates.test.ts`**, `describe('renderAdminLatePayment')`:

- El caso que afirmaba la mentira se reescribió (no se borró ni debilitó): ahora afirma que
  asunto, html y texto **no** contienen "automáticamente", "reembolsado", "No tenés que hacer
  nada" ni "pidió la devolución"; que el asunto dice "pendiente"; y que html y texto contienen
  "Devoluciones", el monto, la referencia y el estado `expired`. El comentario cuenta la causa.
- Aserciones en positivo, agregadas en la revisión: html y texto contienen "se le avisó al
  jugador", "La plata todavía no volvió", "devolvésela vos", "marcala en Caja y Cantina →
  Devoluciones" y "Si la devolvés desde el panel de MercadoPago, se marca sola". Motivo abajo.
- Nuevo: con `refundIssued: true` el nombre de cancha sigue escapado en el html (`<5> & Río`).
- Nuevo: regresión con `refundIssued` ausente y con `refundIssued: false` explícito → el asunto
  sigue diciendo "acción requerida" y html/texto "acción manual".

## La prueba, antes y después

**Rojo** del test corregido contra el template de `origin/main`, reproducido en la rama limpia del
PR (se restauró el template desde `a17023ab`, se corrió, y se volvió a poner el corregido con
verificación byte a byte):

```
× renderAdminLatePayment > con refundIssued avisa que la devolución quedó pendiente en Devoluciones, en subject, html y text
AssertionError: expected 'Pago tardío reembolsado automáticamen…' not to contain 'automáticamente'
Received: "Pago tardío reembolsado automáticamente (reserva #abcdef12)"
      Tests  1 failed | 6 passed | 49 skipped (56)
```

**Verde** con el template corregido, en la misma rama:

```
✓ renderAdminLatePayment > con refundIssued avisa que la devolución quedó pendiente en Devoluciones, en subject, html y text
✓ renderAdminLatePayment > con refundIssued conserva el nombre de cancha escapado en el html
✓ renderAdminLatePayment > sin refundIssued (ausente) sigue pidiendo acción manual
✓ renderAdminLatePayment > con refundIssued: false explícito sigue pidiendo acción manual
 Test Files  1 passed (1) · Tests  56 passed (56)
```

## Revisión

**Tres revisores Sonnet adversariales** (`sonnet-adversarial-reviewer`, sólo lectura, contexto
fresco, leyeron el diff antes que el resumen del implementador):

- **Veracidad:** no refutado. Cada frase de la rama `true` rastreada a código: fila pendiente
  (`payment.service.ts` 638-639 y 709-749), aviso al jugador (665-685 y
  `player-late-payment-refunded.ts:36`), pestaña Devoluciones (`CajaTabs.tsx:9`), "se marca sola"
  (detección de devolución externa, 330-338 y 429-436). Sin frases prohibidas ni equivalentes.
- **Alcance y consumidores:** no refutado. Sólo dos archivos de código; firma, tipo, nombre del
  campo y rama `false` intactos; `payment.service.ts` y `templates/index.ts` intactos; ningún
  consumidor depende del asunto viejo.
- **Calidad del test: refutado con dos 🟡.** El caso nuevo se apoyaba casi sólo en aserciones
  negativas: un copy "tranquilizador" que evitara las cuatro frases prohibidas sin decirle al
  complejo que la plata no volvió ni que la devuelve él pasaba igual. Lo demostró con un mutante
  ejecutado ("PASS (mutante engaña al test)"). Tampoco se afirmaba ninguna frase de acción.

**Revisión del orquestador:** el diff coincide con lo reportado; las mismas citas verificadas en
código (incluida `listPendingRefunds` y el UPDATE a `approved` de la detección externa). Se
aceptaron los dos 🟡 y se agregaron las cinco aserciones positivas; el mismo mutante, contra las
aserciones reforzadas, falla:

```
FAIL (test lo agarra): con refundIssued avisa pendiente - MUTANTE PASIVO (aserciones reforzadas) -> no contiene: se le avisó al jugador
```

Desviación menor aceptada: el encabezado pasó de ternario a constante (`Pago tardío recibido`),
que era el valor de la rama `false`.

## Validación en la rama limpia del PR

Primero se implementó y verificó en un worktree de validación que llevaba, además, 46 cambios
pendientes ajenos a esta tarea (ninguno tocaba `notifications/`; los imports del template y del
test —`./index`, `./html-escape`, `@/modules/notifications/templates`— están en `origin/main`).
Esos resultados no sustituyen a estos: el PR se armó en una rama nueva a partir de `origin/main`
tal como estaba disponible, **`a17023abe04b3c7758708f0f011f32d3b132425b`** (PR #272; el remoto
mostraba el mismo SHA), copiando exactamente los dos archivos (verificados byte a byte) y este
registro. Ningún otro archivo. Todo lo de abajo corrió sobre esa rama, con `pnpm install
--frozen-lockfile` propio.

| Comando | Resultado |
|---|---|
| `pnpm format:check` | limpio |
| `pnpm lint` | limpio |
| `pnpm typecheck` | 0 errores |
| `pnpm knip` | limpio |
| `pnpm test` (unit completa) | 379 archivos · **3928 passed** · 1 todo · 107,8 s |
| `vitest run tests/unit/notification-templates.test.ts` | 56 passed (los 7 del `describe` incluidos) |
| `vitest run tests/unit/mp-webhook-handler-push-gate.test.ts` (consumidor) | passed |
| test corregido contra el template de `a17023ab` (rojo esperado) | 1 failed, por "automáticamente" en el asunto |

`git diff --stat` de la rama contra `a17023ab`: los dos archivos de código (+76/−20) y este
registro.

## Limitaciones y pendientes

- **Sin push, sin PR publicado, sin CI remota.** El commit es local, en la rama
  `fix/aud-13-pago-tardio-copy`.
- No se ejercitó el envío real del mail (worker `send-email`) ni se miró producción. No hacía
  falta integración: el cambio no toca código de ejecución fuera del template.
- El nombre `refundIssued` sigue siendo engañoso; renombrarlo requiere tocar
  `payment.service.ts` y contemplar filas ya encoladas. Queda documentado en el doc comment.
- Fuera de este PR quedan los otros hallazgos del lote (AUD-09, AUD-06, AUD-02) y el resto del
  árbol pendiente del dueño (AUD-05, migraciones 083/084), que van por separado.
