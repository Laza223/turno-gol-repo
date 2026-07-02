# TurnoGol — Addendum Launch-First Día 0

> Objetivo: no crear una v3 de la guía. Este documento agrega los agujeros críticos detectados como tickets ejecutables para `LAUNCH_BACKLOG.md` y un mini-runbook de las primeras 48 horas.

## Regla operativa

No seguir puliendo la guía hasta correr, como mínimo:

```bash
pnpm test:isolation
pnpm test:concurrency
pnpm launch:check
```

Si algún script no existe, creá el ticket para implementarlo o reemplazalo por el comando equivalente real del repo. La prioridad ya no es mejorar el plan; es validar si TurnoGol rompe en las áreas P0.

---

# Tickets para agregar a `LAUNCH_BACKLOG.md`

## P0 — STAGING-001 — Verificar ambiente de staging real antes de auditar

### Problema
El plan corregido asume que staging existe. Si hoy no hay una URL de staging, una base Supabase separada, credenciales sandbox de MercadoPago y OAuth/configuración de prueba por tenant, el Día 3 no existe. Armar staging puede comerse un día entero.

### Objetivo
Tener un ambiente donde se pueda hacer un flujo realista sin tocar producción.

### Alcance
Verificar o crear:

- URL de staging o preview estable.
- Proyecto Supabase de staging separado de producción.
- Variables `.env` de staging completas.
- Migraciones aplicadas en staging.
- Seed mínimo: 1 complejo, 1 cancha, horarios, usuario/admin de prueba.
- MercadoPago en modo test/sandbox.
- Al menos 1 vendedor/test account conectado o simulado.
- Al menos 1 comprador/test account.
- Webhook de MercadoPago apuntando a staging.
- OAuth/test credentials si aplica a modelo marketplace/multi-tenant.
- Sentry o logging activo para staging.

### Criterios de aceptación

- `pnpm launch:check` o comando equivalente pasa contra staging.
- Se puede crear una reserva completa en staging.
- Se puede iniciar un pago sandbox/test.
- El webhook llega al handler correcto.
- La reserva cambia de estado por webhook, no por edición manual.
- Ninguna variable de producción se usa en staging por accidente.

### Prompt para Fable

```text
Actuá como release engineer senior. No audites todo el repo. Revisá únicamente la configuración necesaria para confirmar si existe un ambiente staging real para TurnoGol.

Buscá evidencia concreta en archivos de configuración, README, scripts, Vercel/Supabase docs del repo y env examples.

Necesito una tabla:
- componente
- existe / no existe / incierto
- evidencia
- riesgo si falta
- acción mínima para dejarlo listo hoy

Componentes obligatorios:
- URL staging/preview
- Supabase staging separado
- migraciones aplicadas
- seed mínimo
- variables env staging
- MercadoPago sandbox/test
- OAuth/test seller por tenant si aplica
- webhook MP apuntando a staging
- logging/Sentry staging

Timebox: 45 minutos. Si no hay evidencia, marcá INCIERTO, no inventes.
```

### Prompt para Sonnet

```text
Implementá únicamente lo necesario para dejar staging verificable.

Reglas:
- No toques producción.
- No cambies lógica de negocio.
- No agregues features.
- Si falta un script de verificación, creá uno mínimo.
- Si falta seed, creá seed mínimo de staging.

Entregables:
- checklist de variables requeridas
- script/comando de verificación
- instrucciones exactas para correrlo
- evidencia del resultado
```

---

## P0 — MP-WEBHOOK-001 — Crear harness de replay de webhooks MercadoPago

### Problema
“Simular o reenviar webhooks” no es un paso de checklist. Necesitás un mecanismo concreto para probar duplicados, retrasos, firmas inválidas, eventos fuera de orden y token/tenant incorrecto.

MercadoPago envía notificaciones Webhook con validación mediante `x-signature`; para pruebas reales necesitás conservar headers/payload o tener un bypass controlado solo en staging.

### Objetivo
Poder ejecutar pruebas repetibles contra el handler de MercadoPago sin depender de que MercadoPago reenvíe algo manualmente.

### Alcance
Crear un script o fixture runner que pueda:

- Hacer `POST` al endpoint real de webhook en staging.
- Usar payloads reales capturados de MercadoPago sandbox cuando existan.
- Guardar fixtures con body + headers relevantes.
- Probar webhook duplicado.
- Probar webhook retrasado después de expirado el hold.
- Probar evento fuera de orden.
- Probar firma inválida.
- Probar payment id inexistente.
- Probar pago de un tenant contra reserva de otro tenant.
- Probar idempotencia: dos POST iguales no duplican cobros, reservas ni logs críticos.

### Diseño recomendado

Ruta de archivos sugerida:

```text
scripts/replay-mp-webhook.ts
test/fixtures/mercadopago/payment-approved.json
test/fixtures/mercadopago/payment-pending.json
test/fixtures/mercadopago/payment-rejected.json
```

Variables sugeridas:

```bash
STAGING_BASE_URL=https://...
MP_WEBHOOK_TEST_BYPASS_SECRET=...
MP_WEBHOOK_REPLAY_FIXTURE=payment-approved
```

Regla de seguridad:

- El bypass de firma solo puede funcionar si `NODE_ENV !== "production"` y existe un secreto explícito de staging.
- En producción, toda firma inválida debe ser rechazada.

### Criterios de aceptación

- El mismo webhook enviado 2 veces deja la reserva en un único estado final consistente.
- Un webhook tardío no confirma una reserva cuyo hold ya expiró y fue liberado, salvo que la lógica de negocio lo permita explícitamente.
- Un webhook con firma inválida falla.
- Un webhook con tenant cruzado falla.
- El script puede correr en CI o manualmente contra staging.
- El resultado queda logueado con correlación por `payment_id`, `reservation_id` y `tenant_id`.

### Prompt para Fable

```text
Actuá como especialista en pagos e idempotencia. Revisá únicamente la integración de MercadoPago y el handler de webhooks.

No edites código. Quiero un diseño mínimo para un harness de replay de webhooks que pruebe:
- duplicados
- retrasados
- fuera de orden
- firma inválida
- payment id inexistente
- tenant cruzado
- idempotencia de confirmación

Incluí:
- archivos a crear/modificar
- fixtures necesarios
- criterios de aceptación verificables
- riesgos de seguridad del bypass de firma en staging
- qué NO implementar todavía

Timebox: 60 minutos.
```

### Prompt para Sonnet

```text
Implementá el harness mínimo de replay de webhooks MercadoPago según el diseño aprobado.

Reglas:
- No modifiques el flujo de pagos salvo que sea imprescindible para testabilidad.
- No agregues bypass de firma en producción.
- Todo bypass debe exigir env var explícita y fallar cerrado.
- Agregá fixtures mínimos.
- Agregá comandos de ejecución.

Criterios:
- webhook duplicado es idempotente
- webhook inválido falla
- tenant cruzado falla
- resultado visible en consola/log
```

---

## P1 alto / P0 comercial — INV-ABUSE-001 — Evitar denial of inventory en portal público

### Problema
Si el portal público permite crear reservas/holds pendientes, un atacante o usuario malicioso puede bloquear toda la grilla con reservas falsas en loop. Aunque el hold expire en 6 minutos, sin rate limiting puede mantener ocupados horarios valiosos indefinidamente.

### Objetivo
Impedir que una persona/IP/teléfono/sesión pueda bloquear inventario de forma abusiva.

### Alcance MVP
Implementar defensa mínima antes de abrir el portal público:

- Límite de holds pendientes por IP.
- Límite de holds pendientes por teléfono/email si existen.
- Límite de intentos por cancha/franja horaria.
- TTL estricto de holds.
- Cleanup confiable de holds expirados.
- Bloqueo temporal si supera umbral.
- Log de eventos sospechosos.
- Mensaje amable al usuario legítimo.

### Decisiones sugeridas para MVP

Valores iniciales conservadores:

```text
Máximo 2 holds pendientes por IP por complejo.
Máximo 2 holds pendientes por teléfono por complejo.
Máximo 5 intentos de hold por IP cada 10 minutos.
TTL hold: 6 minutos.
Liberación automática: job o consulta que ignore expirados de forma determinística.
```

Ajustar estos valores según tráfico real.

### Criterios de aceptación

- Un usuario legítimo puede reservar normalmente.
- Un mismo IP/teléfono no puede bloquear 10 horarios simultáneos.
- Holds expirados no siguen bloqueando disponibilidad.
- Los límites se aplican por tenant/complejo, no globalmente de forma torpe.
- El sistema registra intentos bloqueados.
- No se filtran datos de otros usuarios en mensajes de error.

### Prompt para Fable

```text
Actuá como arquitecto de seguridad de producto. Revisá únicamente el flujo público de holds/reservas de TurnoGol.

Quiero detectar si existe riesgo de denial of inventory: usuarios bloqueando slots con reservas pendientes falsas.

No edites código. Entregá:
- flujo actual de creación de hold/reserva pendiente
- puntos donde se bloquea disponibilidad
- TTL y cleanup actual si existe
- límites actuales si existen
- escenarios de abuso concretos
- defensa mínima para launch
- tests necesarios
- archivos exactos a tocar

Priorizá solución simple y verificable. No propongas sistemas enterprise.
```

### Prompt para Sonnet

```text
Implementá defensa mínima contra denial of inventory en el portal público.

Reglas:
- No rompas el flujo legítimo de reserva.
- No agregues dependencias pesadas salvo que ya exista infraestructura de rate limiting.
- Preferí límites simples por IP/teléfono/tenant.
- Agregá tests de abuso.
- Asegurá que holds expirados no bloqueen disponibilidad.

Criterios:
- 1 usuario legítimo puede reservar.
- 1 atacante no puede bloquear toda la grilla.
- los límites quedan registrados.
```

---

## P0 legal/operativo — PRIVACY-001 — Publicar términos y política de privacidad mínimos

### Problema
TurnoGol va a procesar datos personales básicos de jugadores/clientes: nombre, teléfono, reservas, potencialmente pagos y datos de contacto. Antes del primer usuario real, necesitás tener al menos una política de privacidad y términos mínimos visibles.

### Objetivo
No lanzar sin una base legal/operativa mínima. Esto no reemplaza revisión legal profesional, pero evita salir sin nada.

### Alcance MVP
Crear y publicar:

- `/privacidad`
- `/terminos`
- link visible en footer o flujo de reserva
- checkbox o aceptación mínima si corresponde al flujo
- texto claro sobre qué datos se recolectan y para qué
- contacto para ejercer derechos o consultas
- aclaración de terceros/proveedores: MercadoPago, hosting, analytics/logging si aplica
- política de cancelaciones/seña si aplica

### Criterios de aceptación

- Las páginas existen en staging y producción.
- Son accesibles desde el flujo público.
- No prometen cosas falsas que el sistema no cumple.
- Nombran datos recolectados reales.
- Nombran terceros reales.
- Tienen fecha de última actualización.
- Hay un contacto operativo.

### Prompt para Fable

```text
Actuá como product counsel pragmático para un MVP en Argentina. No des asesoramiento legal definitivo.

Necesito un checklist y estructura mínima para publicar términos y política de privacidad de TurnoGol antes de launch.

Contexto:
- marketplace/SaaS de reservas de canchas
- usuarios cargan datos de contacto
- puede haber pagos/señas por MercadoPago
- complejos gestionan disponibilidad/reservas

Entregá:
- secciones obligatorias recomendadas
- datos que debo confirmar manualmente
- riesgos de prometer de más
- copy base simple para adaptar
- ubicación en UI
- criterios de aceptación
```

### Prompt para Sonnet

```text
Creá páginas mínimas de Términos y Privacidad para TurnoGol usando copy base aprobado.

Reglas:
- No inventes razón social, CUIT ni domicilio.
- Usá placeholders explícitos donde falte dato legal.
- Agregá fecha de última actualización.
- Linkeá desde footer o flujo público.
- No prometas eliminación/retención/procesos que el sistema no soporte.

Entregables:
- página /privacidad
- página /terminos
- links visibles
```

---

## P0 — RESTORE-001 — Restore drill obligatorio, no calendarizado

### Problema
“Restore probado o calendarizado” no sirve para un cliente pago. Calendarizado significa que todavía no sabés si podés recuperar la base.

### Objetivo
Probar recuperación antes del primer cliente real.

### Alcance

- Exportar o respaldar DB de staging.
- Restaurar en proyecto temporal o base temporal.
- Verificar tablas críticas.
- Verificar al menos una reserva, un tenant y una cancha.
- Documentar tiempo aproximado de recuperación.
- Documentar responsable y comandos.

### Criterios de aceptación

- Restore ejecutado al menos una vez.
- Evidencia guardada en `RUNBOOK_LAUNCH.md`.
- Comandos reproducibles.
- Se sabe cuánto tarda aproximadamente.
- Se sabe qué datos se perderían según el tipo de backup disponible.

### Prompt para Sonnet

```text
Prepará un restore drill mínimo para Supabase/Postgres de staging.

No toques producción.

Entregá:
- comandos exactos
- checklist pre-restore
- checklist post-restore
- tablas críticas a verificar
- cómo documentar evidencia en RUNBOOK_LAUNCH.md
```

---

## P0 operativo — OPS-48-001 — Protocolo primeras 48 horas post-launch

### Problema
Sos una sola persona. Si algo falla un sábado a la noche, necesitás saber qué mirar, cada cuánto, y cuándo apagar/cerrar temporalmente el flujo.

### Objetivo
Lanzar supervisado, no “abrir la canilla”.

### Estrategia recomendada

- Lanzar primero con 1 o 2 complejos piloto.
- Supervisión manual las primeras 48 horas.
- No activar campañas fuertes hasta pasar smoke real.
- Tener kill switch del portal público o de pagos si algo falla.

### Ventanas de revisión manual

Primeras 6 horas:

```text
Cada 60 minutos:
- revisar Sentry/logs
- revisar últimos webhooks MP
- revisar reservas pendientes vencidas
- revisar reservas confirmadas
- revisar holds activos
- revisar errores 4xx/5xx
- revisar pagos sin reserva asociada
- revisar reservas sin pago asociado si deberían tener seña
```

Horas 6 a 24:

```text
Cada 3 horas:
- Sentry/logs
- webhooks fallidos
- reservas pendientes vencidas
- conciliación pagos/reservas
- feedback del complejo piloto
```

Horas 24 a 48:

```text
Mañana / tarde / noche:
- Sentry/logs
- conciliación pagos/reservas
- abuso de holds
- quejas del complejo
- métricas básicas de conversión
```

### Kill switches mínimos

Tener preparado al menos uno:

```text
DISABLE_PUBLIC_BOOKING=true
DISABLE_MP_PAYMENTS=true
FORCE_MANUAL_CONFIRMATION=true
```

### Métricas críticas

```text
- cantidad de reservas creadas
- cantidad de holds pendientes
- holds expirados no liberados
- pagos aprobados
- pagos rechazados
- webhooks recibidos
- webhooks fallidos
- pagos sin reserva
- reservas confirmadas sin pago
- errores por endpoint
- intentos bloqueados por rate limiting
```

### Criterios GO/NO-GO para ampliar

GO si durante 48h:

- no hay fuga de tenant
- no hay dobles reservas
- no hay pagos aprobados sin reconciliar
- no hay holds trabados
- no hay errores críticos sin investigar
- el complejo piloto entiende cómo operar

NO-GO si aparece:

- pago aprobado que no confirma correctamente
- reserva confirmada duplicada
- datos de un tenant visibles para otro
- inventario bloqueado abusivamente
- no podés restaurar DB
- no podés apagar pagos/reservas rápidamente

---

# Orden de ejecución recomendado

## Hoy / Día 0

1. Correr comandos base:

```bash
pnpm test:isolation
pnpm test:concurrency
pnpm launch:check
```

2. Ejecutar `STAGING-001`.
3. Si staging no existe, pausar todo y crearlo.
4. Ejecutar diseño de `MP-WEBHOOK-001`.
5. Agregar `INV-ABUSE-001` al backlog.
6. Agregar `PRIVACY-001` al backlog.

## Día 1

1. Fable audita P0:
   - tenant isolation/RLS
   - doble reserva/concurrencia
   - MercadoPago/webhooks
   - denial of inventory
2. Sonnet implementa fixes P0 encontrados.
3. Tests obligatorios.

## Día 2

1. Completar fixes.
2. Implementar harness webhook si no existe.
3. Implementar defensa anti-abuse mínima.
4. Publicar privacidad/términos mínimos.
5. Ejecutar restore drill.

## Día 3

1. Deploy staging.
2. Smoke test E2E.
3. Pago sandbox/test.
4. Webhook duplicado/retrasado.
5. Rollback probado.
6. Completar runbook 48h.
7. Decisión GO/NO-GO para piloto.

---

# Frase de control

Si estás por escribir otro documento, primero preguntá:

```text
¿Este documento reduce riesgo real de lanzamiento o estoy evitando correr tests?
```

Si la respuesta no es obvia, corré los tests.
