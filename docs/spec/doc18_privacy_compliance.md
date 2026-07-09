# DOC 18 — Privacy & Compliance
## TurnoGol: Protección de Datos Personales en Argentina

> **Propósito**: Definir qué datos recolectamos, por qué, cómo los protegemos,
> y qué obligaciones legales tenemos bajo la legislación argentina.
> Este documento no reemplaza asesoramiento legal — pero sí asegura que el sistema
> se diseña con privacy by design desde el primer commit.

> [!CAUTION]
> Argentina tiene la Ley 25.326 de Protección de Datos Personales y su autoridad
> de aplicación es la AAIP (Agencia de Acceso a la Información Pública).
> Incumplir esta ley tiene consecuencias legales reales: sanciones administrativas,
> multas y responsabilidad civil. No es opcional ni "algo para después".

---

## 1. Marco Legal Aplicable

### 1.1 Legislación principal

| Norma | Qué regula | Aplicabilidad a TurnoGol |
|---|---|---|
| **Ley 25.326** | Protección de Datos Personales | ✅ Directa. TurnoGol recolecta y procesa datos personales de jugadores, dueños y staff. |
| **Decreto 1558/2001** | Reglamentación de la Ley 25.326 | ✅ Detalla obligaciones de responsables y encargados de bases de datos. |
| **Disposición 11/2006 (DNPDP)** | Medidas de seguridad para tratamiento de datos | ✅ Define niveles de seguridad (básico, medio, crítico) según tipo de dato. |
| **Ley 25.065** | Tarjetas de Crédito y Débito | ✅ Aplica a las notificaciones previas a débitos automáticos (suscripciones SaaS). |
| **Ley 26.032** | Servicio de Internet como medio de comunicación | ✅ Protección de comunicaciones electrónicas. |
| **RGPD (UE)** | Reglamento General de Protección de Datos | ⚠️ No aplica directamente, pero es referencia de buenas prácticas. Si algún jugador es residente de la UE, aplica parcialmente. |

### 1.2 TurnoGol como responsable y encargado

```
TurnoGol opera en DOS roles bajo la Ley 25.326:

1. RESPONSABLE del tratamiento:
   → De los datos de los dueños de complejos (clientes SaaS)
   → De los datos de staff de los complejos
   → De los datos de jugadores que se registran en la plataforma
   
2. ENCARGADO del tratamiento por cuenta de terceros:
   → De los datos de jugadores que reservan en un complejo específico
   → El complejo (tenant) es el responsable primario de esos datos
   → TurnoGol los procesa por instrucción del complejo
```

---

## 2. Inventario de Datos Personales

### 2.1 Datos que recolectamos — Jugadores (B2C)

| Dato | Tipo (Ley 25.326) | Origen | Finalidad | Base legal | Retención |
|---|---|---|---|---|---|
| Nombre y apellido | Dato personal | Registro / OAuth | Identificación en reservas | Ejecución de contrato | Mientras tenga cuenta activa + 90 días |
| Email | Dato personal | Registro / OAuth | Autenticación (magic link jugadores, password staff), comunicaciones | Ejecución de contrato | Idem |
| Teléfono celular | Dato personal | Registro (opcional) | Contacto secundario del jugador (mostrar al complejo) | Ejecución de contrato | Idem |
| Historial de reservas | Dato personal | Uso del servicio | Gestión, historial del jugador | Ejecución de contrato | 12 meses activo, luego se anonimiza |
| Historial de pagos | Dato personal | MercadoPago | Registro financiero | Obligación legal (facturación) | 5 años (normativa contable argentina) |
| Dirección IP | Dato de tráfico | Request HTTP | Seguridad (rate limiting, fraud) | Interés legítimo | 30 días |
| Dispositivo/browser | Dato de tráfico | Request HTTP | Seguridad, debugging | Interés legítimo | 30 días |

### 2.2 Datos que recolectamos — Dueños y Staff (B2B)

| Dato | Tipo | Finalidad | Base legal | Retención |
|---|---|---|---|---|
| Nombre y apellido | Dato personal | Identificación, facturación | Ejecución de contrato | Mientras sea cliente + 5 años (fiscal) |
| Email | Dato personal | Autenticación, comunicaciones de servicio | Ejecución de contrato | Idem |
| Teléfono celular | Dato personal | Comunicaciones de dunning, soporte | Ejecución de contrato | Idem |
| Nombre del complejo | Dato comercial | Operación del servicio | Ejecución de contrato | Idem |
| Dirección del complejo | Dato comercial | Publicación en marketplace, geolocalización | Ejecución de contrato | Idem |
| Datos de facturación | Dato personal | Emisión de recibos/facturas | Obligación legal | 10 años (AFIP) |
| Configuración del complejo | Dato no personal | Operación del servicio | Ejecución de contrato | Mientras sea cliente + 90 días |

### 2.3 Datos que NUNCA recolectamos

| Dato | Por qué NO |
|---|---|
| **Número de tarjeta de crédito/débito** | MercadoPago lo maneja bajo PCI DSS. Nosotros nunca vemos, tocamos ni almacenamos un número de tarjeta. |
| **CVV** | Idem. |
| **Contraseñas** | Jugadores usan magic link/OAuth. Staff usa contraseñas hasheadas en Supabase Auth. Nunca en texto plano. |
| **Datos biométricos** | No aplica a nuestro producto. |
| **Datos de salud** | No aplica. |
| **Datos de orientación sexual, religión, opinión política** | No aplica. Estos son "datos sensibles" bajo la Ley 25.326 y requieren consentimiento expreso y reforzado. No los recolectamos bajo ninguna circunstancia. |
| **Ubicación GPS en tiempo real del jugador** | No trackeamos ubicación. Si en el futuro se implementa "canchas cerca de mí", se usará geolocalización del browser con consentimiento explícito, y no se almacenará. |

> [!IMPORTANT]
> **TurnoGol no procesa datos sensibles** según la definición del Art. 2 de la Ley 25.326.
> Esto simplifica significativamente nuestras obligaciones: no necesitamos las protecciones
> reforzadas que aplican a datos de salud, origen racial, opiniones políticas, etc.

---

## 3. Registro en la AAIP (ex-DNPDP)

### 3.1 Obligación de registro

La Ley 25.326 (Art. 21) obliga a registrar las bases de datos que contengan datos personales de terceros ante la Agencia de Acceso a la Información Pública (AAIP).

```
BASES DE DATOS A REGISTRAR:

1. "Base de datos de jugadores de TurnoGol"
   - Responsable: [Razón social de TurnoGol]
   - Finalidad: Gestión de reservas de canchas de fútbol
   - Categoría de titulares: Jugadores de fútbol (personas físicas)
   - Datos recolectados: nombre, email, teléfono, historial de reservas
   - Cesión de datos: No (excepto al complejo donde reserva, como sub-encargado)
   - Medidas de seguridad: Nivel medio

2. "Base de datos de clientes de TurnoGol"
   - Responsable: [Razón social de TurnoGol]
   - Finalidad: Gestión comercial de clientes SaaS
   - Categoría de titulares: Dueños de complejos deportivos (personas físicas/jurídicas)
   - Datos recolectados: nombre, email, teléfono, datos de facturación
   - Cesión de datos: No
   - Medidas de seguridad: Nivel medio
```

### 3.2 Trámite

```
Portal: https://www.argentina.gob.ar/aaip/datospersonales/inscripcion-bases-de-datos
Costo: Gratuito
Plazo: 30 días hábiles para la inscripción
Renovación: Anual (actualizar si cambian los datos registrados)

CUANDO HACERLO:
  → ANTES del lanzamiento público comercial. 
  → El desarrollo y las pruebas locales/staging pueden comenzar sin el registro. La inscripción definitiva está en proceso y no bloquea la codificación de la v1.
```

---

## 4. Consentimiento y Transparencia

### 4.1 Política de Privacidad

TurnoGol debe tener una Política de Privacidad pública, accesible desde:
- Footer de la landing page.
- Pantalla de registro (antes de completar el formulario).
- Link en los emails transaccionales.
- Configuración del perfil del usuario.

**Contenido mínimo obligatorio (Art. 6, Ley 25.326):**

```markdown
La Política de Privacidad debe informar:

1. Identidad del responsable
   → TurnoGol [razón social], domicilio legal, email de contacto de privacidad.

2. Finalidad del tratamiento
   → Para qué usamos cada dato (ver §2 de este documento).

3. Destinatarios de los datos
   → Quién accede a los datos (el complejo donde el jugador reserva, 
     MercadoPago para pagos, Resend para email).

4. Derecho de acceso, rectificación y supresión
   → Cómo solicitar acceso, corrección o eliminación de datos.
   → Email dedicado: privacidad@turnogol.app
   → Plazo de respuesta: 10 días hábiles.

5. Carácter obligatorio/facultativo de los datos
   → Qué datos son obligatorios (email para auth) y cuáles opcionales (teléfono).

6. Consecuencias de no proporcionar datos
   → Si no proporciona email, no puede crear cuenta.
```

### 4.2 Consentimiento explícito para comunicaciones

```
REGISTRO DE JUGADOR:
  ┌─────────────────────────────────────────────────────┐
  │ ☐ Acepto la Política de Privacidad y los Términos   │
  │   de Servicio. [link a política] [link a términos]  │
  │                                                     │
  │ ☐ Acepto recibir ofertas y novedades de complejos   │
  │   por email. (Opcional — no bloquea el registro)    │
  └─────────────────────────────────────────────────────┘

REGISTRO DE COMPLEJO (DUEÑO):
  ┌─────────────────────────────────────────────────────┐
  │ ☐ Acepto la Política de Privacidad, los Términos    │
  │   de Servicio y el Acuerdo de Procesamiento de      │
  │   Datos (DPA). [links]                              │
  │                                                     │
  │ ☐ Entiendo que soy responsable de los datos de los  │
  │   jugadores que gestiono a través de TurnoGol.      │
  └─────────────────────────────────────────────────────┘
```

**Regla**: El primer checkbox es obligatorio (sin él no se puede registrar). El segundo checkbox (marketing) es opcional y está desmarcado por defecto. **Nunca pre-marcar consentimiento de marketing.**

### 4.3 Registro de consentimiento

```typescript
// Guardar evidencia del consentimiento otorgado
// En v1, el consentimiento de TyC/+18 se registra en campos de la tabla players:
//   - players.agreed_to_terms_at: timestamp de aceptación
//   - players.terms_version: versión del documento aceptado (ej: '2026-04')
// El consentimiento de marketing se registra como una entrada en audit_logs:
//   action: 'consent.marketing_granted' o 'consent.marketing_revoked'
//   metadata: { version, ip_address, user_agent }
// Ambos son INSERT-only (nunca UPDATE/DELETE del registro de consentimiento)

// FUTURO (v1.5): Si se necesitan consentimientos granulares (múltiples tipos,
// versionado individual), evaluar crear tabla dedicada consent_records.
```

---

## 5. Derechos de los Titulares (ARCO)

La Ley 25.326 establece derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO). TurnoGol debe implementarlos.

### 5.1 Derecho de Acceso (Art. 14)

**Qué es**: El titular puede solicitar todos los datos que tenemos sobre él.
**Plazo**: 10 días hábiles desde la solicitud.
**Costo**: Gratuito (máximo una vez cada 6 meses, salvo interés legítimo).

```
IMPLEMENTACIÓN:

1. El jugador envía email a privacidad@turnogol.app solicitando sus datos.

2. Verificamos la identidad (enviando un link de verificación al email registrado).

3. Generamos un export JSON/CSV con:
   - Datos personales (nombre, email, teléfono)
   - Historial de reservas (últimos 12 meses)
   - Historial de pagos (montos, fechas, estados)
   - Consentimientos otorgados
   - Notificaciones enviadas (últimos 3 meses)
   - IPs de login (últimos 30 días)

4. Se envía por email al titular en un link de descarga seguro
   (token de un solo uso, válido 48 horas).

FUTURO (v2): Botón "Descargar mis datos" en el perfil del jugador.
```

### 5.2 Derecho de Rectificación (Art. 16)

**Qué es**: El titular puede corregir datos inexactos.
**Plazo**: 5 días hábiles.

```
IMPLEMENTACIÓN:

- El jugador puede editar nombre, email, teléfono desde su perfil (self-service).
- Si el email cambia, se requiere verificación del nuevo email.
- Si solicita corrección de datos que no puede editar (historial), se procesa
  manualmente y se registra en audit_logs.
```

### 5.3 Derecho de Supresión / Cancelación (Art. 16.3)

**Qué es**: El titular puede solicitar la eliminación de sus datos.
**Plazo**: 10 días hábiles.

```
IMPLEMENTACIÓN:

1. El jugador solicita eliminación vía privacidad@turnogol.app o UI.

2. Se verifican restricciones legales:
   - Datos de transacciones financieras: se retienen 5 años (obligación contable AFIP).
   - Datos necesarios para disputas activas: se retienen hasta resolución.

3. Datos que SÍ se eliminan:
   - Nombre → reemplazado por "[Usuario eliminado]"
   - Email → hasheado (para evitar re-registro con datos falsos)
   - Teléfono → eliminado
   - Preferencias → eliminadas
   - Avatar → eliminado de Storage

4. Datos que se ANONIMIZAN (no eliminan):
   - Reservas históricas: se mantienen sin player_id (para reportes del complejo)
   - Pagos: se mantienen sin datos personales (por obligación contable)

5. Resultado: el jugador no puede ser identificado a partir de los datos restantes.

6. Log de la destrucción en audit_logs (quién lo solicitó, cuándo, qué se eliminó).
```

```sql
-- Proceso de eliminación de jugador
BEGIN;

-- 1. Anonimizar reservas (mantener estadísticas del complejo)
UPDATE bookings SET player_id = NULL, notes_player = NULL
WHERE player_id = $player_id;

-- 2. Eliminar bans (ya no aplican)
DELETE FROM tenant_player_bans WHERE player_id = $player_id;

-- 4. Anonimizar pagos (mantener para conciliación, sin datos personales)
UPDATE payments SET player_id = NULL
WHERE player_id = $player_id;

-- 5. Anonimizar el jugador
UPDATE players SET
  first_name = '[Eliminado]',
  last_name = '[Eliminado]',
  email = encode(digest(email, 'sha256'), 'hex') || '@deleted.turnogol.app',
  phone = NULL,
  avatar_url = NULL,
  status = 'anonymized',     -- Estado específico para eliminación ARCO (distinto de 'banned' operativo)
  ban_reason = 'LEY_25326_DATA_DELETION'
WHERE id = $player_id;

-- 6. Audit log
INSERT INTO audit_logs (tenant_id, actor_type, action, resource_type, resource_id, metadata)
VALUES (NULL, 'system', 'player.data_deleted', 'player', $player_id,
  '{"requested_by": "player", "method": "email", "request_date": "2026-04-17"}'::JSONB);

COMMIT;
```

### 5.4 Derecho de Oposición

**Qué es**: El titular puede oponerse al tratamiento de sus datos para fines de marketing.
**Implementación**: El opt-out de marketing email es reversible desde el perfil o vía link en el email. Las comunicaciones transaccionales (confirmaciones, recordatorios) no son marketing y no están sujetas a opt-out mientras el jugador tenga reservas activas.

---

## 6. Seguridad de Datos Personales

### 6.1 Clasificación de datos

Según la Disposición 11/2006 de la DNPDP, los datos se clasifican en niveles de seguridad:

| Nivel | Datos | Medidas requeridas |
|---|---|---|
| **Básico** | Nombre, dirección del complejo | Control de acceso, backups |
| **Medio** | Email, teléfono, historial de reservas, datos financieros | Básico + auditoría de acceso, cifrado en tránsito |
| **Crítico** | Datos sensibles (salud, religión, etc.) | Medio + cifrado at rest, control de acceso biométrico |

**TurnoGol opera en nivel MEDIO** — no procesamos datos sensibles (nivel crítico), pero sí procesamos datos personales como email, teléfono e historial financiero.

### 6.2 Medidas de seguridad implementadas

| Requisito (Disp. 11/2006) | Implementación en TurnoGol | Referencia |
|---|---|---|
| **Control de acceso** | RLS con 6 capas de protección. Gating por rol (`admin` y `manager`); sin sistema de PIN. | Doc 12 |
| **Identificación y autenticación** | JWT con refresh token rotativo. Magic link + OAuth (jugadores), password (staff). | Doc 11, ADR-013 |
| **Registro de accesos** | Tabla `audit_logs` INSERT-only con actor, acción, recurso, timestamp. Retención 12 meses. | Doc 5 §6, Doc 13 |
| **Cifrado en tránsito** | HTTPS obligatorio en toda la aplicación (Vercel SSL automático). | Doc 14 §9 |
| **Cifrado at rest** | Supabase cifra la DB at rest con AES-256 (feature del plan Pro). | Supabase infra |
| **Backups** | Backup automático diario con retención de 30 días. Point-in-time recovery en plan Pro. | Doc 5 §7 |
| **Segregación de datos** | Multi-tenancy con RLS. Un complejo nunca ve datos de otro. Tests automatizados bloqueantes. | Doc 12 |
| **Gestión de incidentes** | Definida en Doc 19 (Runbook). Notificación a afectados en < 48 horas. | Doc 19 |

### 6.3 Datos en tránsito a terceros

| Tercero | Qué datos les enviamos | Por qué | Protección |
|---|---|---|---|
| **MercadoPago** | Nombre del jugador, email, monto a cobrar, descripción del servicio | Procesamiento de pagos | MP es PCI DSS compliant. Nosotros no enviamos datos de tarjeta. |
| **Resend** | Email del jugador, contenido del email | Comunicaciones transaccionales y magic links | TLS en tránsito. Resend es sub-encargado del tratamiento. |
| **Supabase** | Todos los datos (hosting de DB) | Almacenamiento y procesamiento | Supabase cumple SOC 2 Type II. Datos en AWS eu-central-1 o us-east-1. |
| **Vercel** | Logs de requests (IPs, user agents) | Hosting de la aplicación | Vercel cumple SOC 2 Type II. |
| **Sentry** | Errores con contexto (puede incluir tenant_id, user_id) | Error tracking | Sentry cumple SOC 2 Type II. No enviamos datos personales directamente. |

> [!IMPORTANT]
> **Ninguno de estos terceros "compra" nuestros datos.** Son sub-encargados del tratamiento,
> procesando datos exclusivamente para prestar el servicio contratado. No hay monetización
> de datos de usuarios. Esto debe quedar explícito en la Política de Privacidad.

### 6.4 Transferencia internacional de datos

Supabase, Vercel y Sentry operan servidores en Estados Unidos. Bajo la Ley 25.326 (Art. 12), la transferencia internacional de datos personales está permitida si el país de destino ofrece un nivel adecuado de protección.

```
Estados Unidos no está en la lista de países con "nivel adecuado" de la AAIP.

SOLUCIÓN:
  1. Cláusulas contractuales estándar (SCCs) con cada proveedor.
     → Supabase, Vercel y Sentry ofrecen DPAs con SCCs.
  2. Consentimiento del titular informado en la Política de Privacidad.
     → Informar que los datos se procesan en servidores en Estados Unidos.
  3. Supabase permite elegir región del proyecto (eu-central-1 = Frankfurt).
     → RECOMENDACIÓN: Evaluar si usar EU region tiene impacto de latencia
        aceptable para Argentina. Si no, documentar la justificación de usar US.
```

---

## 7. Retención y Eliminación de Datos

### 7.1 Política de retención

| Tipo de dato | Retención | Justificación | Después de la retención |
|---|---|---|---|
| **Datos del jugador activo** | Mientras tenga cuenta activa | Ejecución del servicio | — |
| **Datos del jugador inactivo** (sin reservas en 12 meses) | 12 meses después de la última actividad | Período razonable de reactivación | Se envía email: "¿Seguís usando TurnoGol?" Si no responde en 30 días → anonimización. |
| **Datos del tenant activo** | Mientras sea cliente | Ejecución del contrato | — |
| **Datos del tenant churned** | 90 días post-churn | Período de reactivación (Doc 4 §2/§9) | Anonimización o eliminación completa. Comunicación previa al dueño (día 60 y 85). |
| **Historial de reservas** | 12 meses con datos personales, luego anonimizado | Reportes y uso razonable | Se elimina player_id, se mantiene estadística para el complejo. |
| **Datos financieros** (pagos, facturas) | 5 años | Obligación contable argentina (Código de Comercio, Art. 67) | Destrucción segura. |
| **Audit logs** | 12 meses | Razonabilidad operativa | Eliminación automática vía cron (data-retention-cleanup). |
| **Logs de sistema** | 30 días (Vercel) | Debugging | Eliminación automática por Vercel. |
| **Consentimientos otorgados** | Indefinida | Evidencia legal de consentimiento | Nunca se elimina (es la prueba de que el consentimiento existió). |

### 7.2 Job de limpieza automatizada

```typescript
// src/shared/jobs/workers/data-retention-cleanup.worker.ts
// Cron: domingos 04:00 ART (Doc 14 §8)

async function dataRetentionCleanup() {
  // 1. Anonimizar jugadores inactivos > 12 meses sin reservas
  const inactivePlayers = await db.query(`
    SELECT p.id FROM players p
    WHERE p.status = 'active'
    AND p.last_login_at < NOW() - INTERVAL '12 months'
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.player_id = p.id
      AND b.created_at > NOW() - INTERVAL '12 months'
    )
  `);

  for (const player of inactivePlayers.rows) {
    // Enviar email de reactivación antes de anonimizar
    await enqueueReactivationEmail(player.id);
    // Marcar para eliminación en 30 días
    await markForDeletion(player.id, addDays(new Date(), 30));
  }

  // 2. Eliminar datos de tenants churned > 90 días
  const expiredTenants = await db.query(`
    SELECT id FROM tenants
    WHERE status = 'churned'
    AND scheduled_deletion_at < NOW()
  `);

  for (const tenant of expiredTenants.rows) {
    await deleteTenantData(tenant.id);
    logger.info('data_retention.tenant_deleted', { tenant_id: tenant.id });
  }

  // 3. Purgar audit logs > 12 meses
  const purged = await db.query(`
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '12 months'
    RETURNING id
  `);
  logger.info('data_retention.audit_purged', { count: purged.rowCount });

  // 4. Anonimizar reservas > 12 meses
  await db.query(`
    UPDATE bookings SET player_id = NULL, notes_player = NULL
    WHERE date < NOW() - INTERVAL '12 months'
    AND player_id IS NOT NULL
  `);
}
```

---

## 8. Comunicaciones: Reglas de Envío

### 8.1 Tipos de comunicación

| Tipo | Ejemplos | Consentimiento necesario | Opt-out posible |
|---|---|---|---|
| **Transaccional** | Confirmación de reserva, cancelación, magic link/verificación | Implícito (necesario para el servicio) | ❌ No (son parte del servicio contratado) |
| **Servicio** | Cambio de precio, vencimiento de trial, cobro fallido | Implícito (necesario para la relación comercial) | ❌ No, mientras sea cliente activo |
| **Marketing** | Ofertas, nuevos complejos, partidos recomendados | Consentimiento explícito (checkbox opt-in) | ✅ Sí, en cada email + perfil |

### 8.2 Reglas de email

```
OBLIGACIONES DE EMAIL:

1. Cada email de marketing incluye un link de UNSUBSCRIBE.
   → Procesado inmediatamente (< 24 horas para aplicar).

2. Los emails transaccionales NO incluyen unsubscribe
   (son parte del servicio: confirmaciones, magic links).

3. No comprar ni usar listas de emails de terceros. Nunca.

4. Resend maneja los bounces y complaints automáticamente.
   → Direcciones que bouncean se marcan como inválidas.
   → Complaints de spam se procesan como unsubscribe.
```

---

## 9. Respuesta a Incidentes de Datos

### 9.1 ¿Qué es un incidente de datos?

Acceso no autorizado, divulgación, alteración o destrucción de datos personales.

**Ejemplos concretos en TurnoGol:**
- Un tenant puede ver reservas de otro tenant (falla de RLS).
- Se expone la base de datos por credenciales filtradas.
- Un backup se almacena en un bucket público.
- Un empleado accede a datos sin autorización.

### 9.2 Protocolo de respuesta

```
PASO 1: DETECCIÓN (< 1 hora)
  - Los tests de isolation detectan fallas de RLS pre-deploy.
  - Sentry detecta errores que podrían indicar acceso no autorizado.
  - Los audit_logs registran accesos inusuales.
  - La revisión semanal detecta anomalías.

PASO 2: CONTENCIÓN (< 4 horas)
  - Identificar el alcance: ¿cuántos datos? ¿cuántos titulares?
  - Cortar el acceso: revocar credenciales, desactivar endpoint, rollback.
  - Preservar evidencia: no borrar logs, hacer snapshot de la DB.

PASO 3: EVALUACIÓN (< 24 horas)
  - ¿Qué datos se vieron comprometidos?
  - ¿A cuántos titulares afecta?
  - ¿Hay riesgo de daño para los titulares?
  - ¿Fue un incidente interno o externo?

PASO 4: NOTIFICACIÓN (< 48 horas si hay riesgo)
  - A la AAIP: si afecta a un número significativo de titulares.
    → No hay plazo formal en la Ley 25.326 (a diferencia del RGPD con 72hs),
       pero la buena práctica es notificar en < 48 horas.
  - A los titulares afectados: por email.
    → Informar: qué pasó, qué datos se vieron afectados, qué estamos haciendo,
       qué puede hacer el titular para protegerse.
  - Al equipo interno: post-mortem documentado.

PASO 5: REMEDIACIÓN
  - Corregir la causa raíz.
  - Actualizar los tests para cubrir este escenario.
  - Actualizar el runbook (Doc 19) si aplica.
  - Actualizar la Política de Privacidad si cambió algo.
```

---

## 10. Documentación Legal Necesaria

### 10.1 Documentos a producir (antes del lanzamiento)

| Documento | Contenido | Estado |
|---|---|---|
| **Política de Privacidad** | Todo lo descripto en §4.1. Lenguaje claro, sin jerga legal innecesaria. | 🔄 En proceso (no bloquea desarrollo) |
| **Términos y Condiciones de Uso** | Condiciones del servicio, responsabilidades, limitaciones, jurisdicción. | 🔄 En proceso (no bloquea desarrollo) |
| **DPA (Data Processing Agreement)** | Acuerdo entre TurnoGol y cada complejo sobre tratamiento de datos de jugadores. | 🔄 En proceso (no bloquea desarrollo) |
| **Cookie Policy** | TurnoGol no usa cookies de tracking. Solo cookies de sesión (funcionales). Documentar. | 🔄 En proceso (no bloquea desarrollo) |
| **Registro AAIP** | Inscripción de las bases de datos ante la AAIP. | 🔄 En proceso (trámite administrativo, no bloquea desarrollo) |

### 10.2 Cookies

```
COOKIES QUE USA TURNOGOL:

1. sb-xxxxx-auth-token (Supabase Auth)
   - Tipo: Funcional (sesión)
   - Duración: 1 hora (access) + 30 días (refresh)
   - Propósito: Mantener la sesión del usuario autenticado
   - ¿Requiere consentimiento?: NO (es estrictamente necesaria para el servicio)

2. sb-xxxxx-auth-token-code-verifier (Supabase Auth PKCE)
   - Tipo: Funcional (seguridad)
   - Duración: Efímera (se elimina después de auth)
   - Propósito: OAuth PKCE challenge
   - ¿Requiere consentimiento?: NO

COOKIES QUE NO USAMOS:
   - Google Analytics: NO
   - Facebook Pixel: NO
   - Cookies de tracking de terceros: NO
   - Cookies de publicidad: NO

RESULTADO: TurnoGol NO necesita un banner de cookies (solo usa cookies funcionales
estrictamente necesarias). Igualmente, lo documentamos en la Cookie Policy
por transparencia.
```

---

## 11. Checklist de Compliance Pre-Lanzamiento

```
ANTES DE LANZAR A PRODUCCIÓN:

Documentación legal:
  □ Política de Privacidad publicada y linkeada desde registro y footer
  □ Términos y Condiciones publicados
  □ DPA preparado para firma con cada complejo (puede ser click-wrap)
  □ Cookie Policy publicada
  □ Registro en AAIP tramitado (o en proceso)

Implementación técnica:
  □ Consentimiento explícito capturado en registro (checkbox no pre-marcado)
  □ Registro de consentimientos vía players.agreed_to_terms_at + audit_logs (INSERT only)
  □ Link de unsubscribe en emails de marketing
  □ Endpoint de export de datos del jugador funcional
  □ Proceso de eliminación/anonimización de datos documentado y testeado
  □ Audit logs funcionando para todas las acciones de datos personales
  □ RLS implementado y tests de isolation pasando
  □ HTTPS en toda la aplicación
  □ Credenciales de DB/API en env vars, no en código

Operativo:
  □ Email privacidad@turnogol.app configurado y monitoreado
  □ Proceso de respuesta a solicitudes ARCO documentado
  □ Protocolo de respuesta a incidentes de datos documentado
  □ Equipo informado sobre obligaciones de la Ley 25.326
  □ Job de data-retention-cleanup programado y testeado
```

---

## 12. Resumen

```
┌────────────────────────────────────────────────────────────────┐
│               PRIVACY & COMPLIANCE - TURNOGOL                  │
│                                                                │
│  MARCO LEGAL: Ley 25.326 + Decreto 1558/2001 + Disp. 11/2006 │
│                                                                │
│  DATOS QUE RECOLECTAMOS:                                       │
│    Jugadores: nombre, email, teléfono*, historial              │
│    Staff/dueño: nombre, email, teléfono, facturación           │
│    * = con consentimiento explícito                            │
│                                                                │
│  DATOS QUE NUNCA TOCAMOS:                                      │
│    Tarjetas de crédito (→ MercadoPago PCI DSS)                │
│    Contraseñas en texto plano (→ hasheadas / magic link)      │
│    Datos sensibles (salud, religión, etc.)                    │
│                                                                │
│  DERECHOS ARCO:                                                │
│    Acceso (export de datos) → 10 días hábiles                 │
│    Rectificación (editar perfil) → self-service + 5 días      │
│    Cancelación (eliminación) → 10 días, anonimización         │
│    Oposición (opt-out marketing) → inmediato                  │
│                                                                │
│  SEGURIDAD:                                                    │
│    Nivel MEDIO (Disp. 11/2006)                                │
│    HTTPS obligatorio                                           │
│    RLS con 6 capas (Doc 12)                                   │
│    Cifrado at rest (Supabase AES-256)                         │
│    Audit logs INSERT-only, 12 meses                           │
│                                                                │
│  RETENCIÓN:                                                    │
│    Jugador inactivo: 12 meses → anonimizar                    │
│    Tenant churned: 90 días → eliminar                         │
│    Datos financieros: 5 años (obligación contable)            │
│    Logs: 30 días (sistema), 12 meses (auditoría)             │
│                                                                │
│  REGISTRO: AAIP (obligatorio antes de operar comercialmente)  │
│  DOCUMENTOS: Política de Privacidad, TyC, DPA, Cookie Policy │
│  CONTACTO: privacidad@turnogol.app                         │
└────────────────────────────────────────────────────────────────┘
```

> [!WARNING]
> **Este documento no es asesoramiento legal.** Define los requerimientos técnicos de privacy
> by design para que el sistema se construya correctamente. Los documentos legales (Política de
> Privacidad, TyC, DPA) deben ser redactados o revisados por un abogado especializado en
> protección de datos personales en Argentina antes del lanzamiento.
