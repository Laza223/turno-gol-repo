# 🏆 Protocolo de Lanzamiento TurnoGol — Parte 4 (BONUS)

## FASE 6: Las Bombas Silenciosas — Lo que Nadie te Dijo que Revises

> Estas son cosas que no aparecen en ningún tutorial de "cómo lanzar un SaaS".
> Son edge cases reales que descubrís cuando un cliente te llama a las 2am
> porque "la cancha aparece bloqueada y nadie la reservó".

---

### Paso 6.1 — El Timer de Expiración: ¿Qué Pasa si pg-boss Falla?

**Por qué importa**: Cuando un jugador inicia una reserva online con seña, el booking queda en `pending_payment` y se programa un job para expirarlo en 15 minutos. **Si ese job nunca se ejecuta**, el slot queda bloqueado PARA SIEMPRE. El admin ve la grilla con un turno "fantasma" que nadie reservó y nadie puede cancelar.

**Prompt para Claude:**

```
Verificá la robustez del timer de expiración de bookings pending_payment.

1. ¿DÓNDE se programa el job de expiración?
   Buscá en el código dónde se hace boss.send() con un delay de 15 min
   después de crear un booking con status='pending_payment'.
   Si NO existe este job → es un BUG CRÍTICO. Crealo.

2. ¿Qué pasa si pg-boss está caído cuando se programa el job?
   - ¿Hay un cron de "barrido" que busca bookings en pending_payment
     con created_at > 15 minutos y los expira?
   - Si NO existe → CREALO. Es el safety net más importante del sistema.
   - Debe correr cada 5 minutos y hacer:
     UPDATE bookings SET status = 'expired'
     WHERE status = 'pending_payment'
     AND created_at < NOW() - INTERVAL '15 minutes'

3. ¿El worker de auto-complete-bookings.worker.ts maneja esto?
   Revisá: actualmente solo hace autoCompleteOverdueBookings() que
   transiciona confirmed → completed. NO es lo mismo que expirar pending.

4. ¿Hay un test de integración que valide?
   - Crear booking pending_payment
   - Simular que pasan 15 minutos (vi.useFakeTimers)
   - Ejecutar el job/barrido
   - Verificar status = expired
   - Verificar que el slot está libre para otra reserva

IMPACTO SI NO SE RESUELVE: Slots bloqueados permanentemente.
El admin no entiende por qué la cancha "está ocupada" a las 21hs
pero no hay nadie. Pierde ingresos.
```

---

### Paso 6.2 — Refresh de Tokens OAuth de MercadoPago

**Por qué importa**: Cada complejo conecta su propia cuenta de MercadoPago vía OAuth. El access_token de MP **expira** (normalmente en 6 horas). Si no se refresca, las reservas con seña van a fallar silenciosamente cuando el jugador intente pagar.

**Prompt para Claude:**

```
Verificá el manejo de tokens OAuth de MercadoPago por tenant.

1. Según CLAUDE.md: tenants.mp_access_token y tenants.mp_refresh_token
   están encriptados at-rest. ¿Están realmente encriptados?
   Revisá src/lib/crypto/ → ¿hay funciones de encrypt/decrypt?
   ¿Se usan al guardar/leer los tokens de MP?

2. ¿Existe lógica de refresh automático del access_token?
   Buscá en src/modules/payments/mp-gateway.implementation.ts:
   - ¿Antes de crear una preference, verifica si el token expiró?
   - ¿Hace refresh automático usando el refresh_token?
   - ¿Guarda el nuevo access_token en la DB?

3. Si NO existe refresh automático:
   - CREÁ un mecanismo que, al detectar un 401 de MP,
     refresque el token y reintente la operación.
   - O creá un cron job que refresque tokens próximos a expirar.

4. ¿Qué pasa si el refresh_token también expiró?
   (MP tokens duran ~180 días pero pueden ser revocados)
   - ¿Se notifica al admin que debe reconectar MercadoPago?
   - ¿Se desactiva requires_deposit temporalmente?
   - ¿El jugador ve un error amigable o una pantalla rota?

IMPACTO SI NO SE RESUELVE: Después de 6 horas, todas las reservas
con seña de ESE complejo fallan. El admin no sabe por qué "MP no funciona".
```

---

### Paso 6.3 — Consistencia Financiera: Centavos en Todos Lados

**Por qué importa**: CLAUDE.md dice "Montos en centavos de ARS (integer, nunca decimal)". Un solo lugar que mezcle pesos y centavos genera cobros de $120.000 en vez de $1.200 o cobros de $0,12 en vez de $12.000.

**Prompt para Claude:**

```
Auditoría de consistencia financiera.

1. Buscá TODOS los campos numéricos que representan dinero:
   - bookings.price_snapshot → ¿centavos?
   - bookings.deposit_amount → ¿centavos?
   - payments.amount → ¿centavos?
   - cash_flows.amount → ¿centavos?
   - abonados.price_per_session → ¿centavos?
   - abonados.monthly_price → ¿centavos?
   - products.price → ¿centavos?
   - court.pricing (JSONB) → ¿centavos?
   - tenant_subscriptions.amount? → ¿centavos?
   - daily_cash_closes.(total_income, balance, etc.) → ¿centavos?

2. Verificá la conversión en el frontend:
   - ¿Se divide por 100 al mostrar precios al usuario?
   - ¿Se multiplica por 100 al recibir input del usuario?
   - ¿El formateo usa toLocaleString('es-AR') correctamente?

3. Verificá la integración con MercadoPago:
   - MP espera montos en PESOS (no centavos) con hasta 2 decimales.
   - ¿deposit_amount se divide por 100 antes de enviar a MP?
   - ¿El monto recibido del webhook se multiplica por 100 al guardar?

4. Buscá usos de parseFloat, toFixed, Math.round en contextos financieros.
   Cada uno es sospechoso. Los montos deben ser integers siempre.

IMPACTO SI NO SE RESUELVE: Un complejo cobra $1.200.000 de seña
en vez de $12.000 (100x), o $120 en vez de $12.000 (100x menos).
```

---

### Paso 6.4 — Rate Limiting en Endpoints Públicos

**Por qué importa**: Los endpoints públicos (`/api/public/*`) no requieren autenticación. Sin rate limiting, un competidor o bot puede hacer miles de requests por segundo, saturar tu DB, o intentar reservar todos los slots.

**Prompt para Claude:**

```
Verificá la protección contra abuso en endpoints públicos.

1. ¿Hay rate limiting implementado?
   Buscá en src/shared/middleware/ o en next.config.js.
   Si NO hay → esto es un riesgo.

2. Endpoints públicos que necesitan protección:
   - /api/public/[slug]/courts → listar canchas (lectura, bajo riesgo)
   - /api/public/[slug]/availability → slots disponibles (lectura, medio)
   - /api/public/[slug]/book → CREAR reserva (escritura, ALTO riesgo)
   - /api/auth/* → login, magic link (ALTO riesgo: brute force)

3. Soluciones según la prioridad:
   - MÍNIMO: Vercel tiene rate limiting nativo en el plan Pro.
     Documentá cómo activarlo.
   - IDEAL: Middleware custom con Map<IP, timestamp[]> en memoria
     (funciona para serverless si usas edge middleware).
   - POST-LAUNCH: Usar Upstash Redis para rate limiting distribuido.

4. ¿El endpoint de magic link tiene protección contra email bombing?
   - ¿Limita cuántos magic links se pueden enviar al mismo email/hora?
   - Si no → alguien puede enviar 10.000 emails a una víctima usando tu sistema.

IMPACTO SI NO SE RESUELVE: Tu factura de Vercel/Supabase/Resend explota.
O peor: alguien usa tu dominio para spam y te lo blacklistean.
```

---

### Paso 6.5 — Email Deliverability (SPF/DKIM/DMARC)

**Por qué importa**: Si los emails de confirmación llegan a spam, el jugador no sabe que su turno está confirmado. Se presenta en la cancha y el admin dice "no tenés reserva". Caos.

**Prompt para Claude:**

```
Verificá la configuración de deliverability de email.

1. ¿Qué dominio usa el FROM del email?
   Revisá src/modules/notifications/email.provider.ts.
   ¿Es noreply@turnogol.com.ar? ¿O usa el dominio default de Resend?

2. Si usa turnogol.com.ar, verificá en el DNS del dominio:
   - SPF record: ¿incluye Resend como sender autorizado?
   - DKIM record: ¿está configurado con la key de Resend?
   - DMARC record: ¿existe? (mínimo p=none para monitorear)

   NOTA: Esto no lo puede hacer Claude Code — es configuración de DNS.
   Documentá las instrucciones exactas para configurarlo.

3. Si todavía usa el dominio default de Resend (ej: onboarding@resend.dev):
   - Documentá que ANTES de lanzar hay que configurar dominio custom.
   - Sin dominio propio, los emails tienen baja reputación y alta tasa de spam.

4. Verificá que el reply-to está configurado:
   - ¿Los emails de confirmación tienen reply-to del complejo?
   - Si el jugador responde al email, ¿le llega al complejo o a un noreply?

IMPACTO SI NO SE RESUELVE: 30-50% de emails van a spam.
Los jugadores no reciben confirmaciones ni recordatorios.
```

---

### Paso 6.6 — Reconciliación de Pagos: Edge Cases de MP

**Por qué importa**: MercadoPago no es instantáneo ni perfecto. Hay escenarios donde el pago llega DESPUÉS de que el booking expiró, o donde MP cobra pero el webhook nunca llega.

**Prompt para Claude:**

```
Verificá cómo el sistema maneja estos escenarios de MercadoPago:

1. PAGO LLEGA DESPUÉS DE EXPIRACIÓN:
   El jugador paga a los 14:30 min, el webhook llega a los 15:30 min,
   pero el job de expiración ya corrió y el booking está en 'expired'.
   
   ¿Qué hace el webhook handler?
   - ¿Intenta transicionar expired → confirmed? (debería fallar, es estado final)
   - ¿Crea un refund automático?
   - ¿Notifica al admin?
   - Si no maneja este caso → el jugador perdió plata y no tiene turno.

2. WEBHOOK NUNCA LLEGA:
   MP cobra al jugador pero el webhook se pierde por red.
   El booking queda en pending_payment → expira → slot liberado.
   Pero el jugador YA PAGÓ.
   
   ¿Hay un mecanismo de polling?
   - ¿Un job que consulta a la API de MP el status de pagos pendientes?
   - ¿Un botón en el admin para "verificar estado de pago" manualmente?

3. COBRO DUPLICADO:
   MP cobra dos veces (raro pero posible).
   - ¿El sistema detecta pagos duplicados?
   - ¿Crea refund del segundo cobro automáticamente?

4. REFUND FALLA:
   El admin cancela con reembolso pero la API de MP devuelve error.
   Revisá booking.cancellation.ts:
   - ¿Hay retry para refunds fallidos?
   - ¿Se notifica al admin que el refund no se procesó?
   - ¿El booking queda en un estado inconsistente?

IMPACTO: El jugador pagó pero no tiene turno, o tiene turno pero
el complejo no recibió la plata. Ambos generan reclamos y pérdida
de confianza.
```

---

### Paso 6.7 — El Primer Usuario Real: Onboarding Wizard E2E

**Por qué importa**: Si el onboarding wizard no funciona de punta a punta, literalmente no podés tener clientes. Es el flujo MÁS importante y el que se suele testear MENOS porque "es solo un formulario".

**Prompt para Claude:**

```
Usando Playwright, ejecutá el onboarding completo (Flujo 1 de doc7):

1. Navegar a localhost:3000 (landing page)
2. Click en "Probá gratis" o equivalente
3. Registrar con email de test + nombre + celular
4. (Simular) Verificar magic link
5. Wizard paso 1: Datos del complejo (nombre, dirección, ciudad)
6. Wizard paso 2: Crear primera cancha (nombre, tipo, capacidad, precios)
7. Wizard paso 3: Horarios de apertura
8. Wizard paso 4: Configurar seña (saltear MP por ahora)
9. Verificar redirect al dashboard
10. Verificar que el dashboard muestra el checklist de progreso
11. Verificar que el complejo aparece en la URL pública /{slug}
12. Verificar que la grilla pública muestra la cancha creada

VERIFICACIONES CRÍTICAS:
- ¿El tenant se crea con status 'trialing' y trial_ends_at = +30 días?
- ¿La cancha se crea con status 'online'?
- ¿Los horarios default se pre-cargan correctamente?
- ¿El slug se genera y es accesible?
- ¿Si el wizard se interrumpe a la mitad, se puede retomar?

Si CUALQUIER paso del wizard falla, corregí inmediatamente.
Este es el flujo que convierte visitantes en clientes.
```

---

### Paso 6.8 — Ley 25.326: ¿Podés Borrar Datos de un Jugador?

**Por qué importa**: La Ley 25.326 de Protección de Datos Personales de Argentina otorga derechos ARCO (Acceso, Rectificación, Cancelación, Oposición). Si un jugador pide que borres sus datos y no podés, estás en infracción legal.

**Prompt para Claude:**

```
Verificá la capacidad de cumplir con solicitudes ARCO.

1. Revisá src/shared/jobs/workers/data-retention-cleanup.worker.ts:
   - ¿Implementa anonimización de jugadores?
   - ¿Qué campos anonimiza? (email, nombre, teléfono mínimo)
   - ¿Mantiene las reservas históricas pero sin PII? (para reportes del complejo)
   - ¿Setea players.status = 'anonymized'?

2. Verificá el campo players.agreed_to_terms_at + terms_version (doc CLAUDE.md):
   - ¿Se setea al registrarse?
   - ¿Se registra en audit_logs?

3. ¿Existe un endpoint o mecanismo para que un jugador solicite eliminación?
   - Si no existe → documentalo como requisito pre-launch o post-launch inmediato.
   - Mínimo: el jugador puede enviar email y el admin/sistema lo procesa.

4. Verificá que la cascada de anonimización no rompe foreign keys:
   - bookings.player_id → ¿se pone NULL o se mantiene apuntando al player anonimizado?
   - player_tenant_relationships → ¿se eliminan?
   - tenant_player_bans → ¿se eliminan?

IMPACTO: Multas de la AAIP (Agencia de Acceso a la Información Pública)
y pérdida de confianza si un jugador reclama y no podés cumplir.
```

---

### Paso 6.9 — Backup y Disaster Recovery

**Prompt para Claude:**

```
Esto NO es código — es documentación operativa. Pero verificá:

1. ¿Supabase tiene backups automáticos habilitados?
   - Plan Free: backups diarios, retención 7 días
   - Plan Pro: Point-in-Time Recovery (PITR)
   - Documentá cuál plan usa TurnoGol

2. ¿Hay documentación de cómo restaurar un backup?
   Revisá docs/doc19_runbook.md:
   - ¿Tiene procedimiento de restauración?
   - ¿Tiene contacto de emergencia?

3. ¿Qué pasa si la DB se corrompe o se pierde?
   - ¿Los tenants pierden TODA su configuración?
   - ¿Hay forma de re-migrar desde cero?
   - `pnpm supabase:reset` + migrations debería recrear el schema

4. Documentá en doc19 un procedimiento de "Deploy malo → Rollback":
   - Vercel permite rollback al deploy anterior con 1 click
   - ¿Está documentado para el equipo?
```

---

> **RESUMEN FINAL — Las 4 partes del protocolo:**
>
> | Parte | Fases | Enfoque |
> |-------|-------|---------|
> | **1** | 0-1 | Pre-vuelo + Sincronización docs↔código |
> | **2** | 2-3 | Testing de seguridad + E2E con Playwright |
> | **3** | 4-5 | UI/UX, Sentry, jobs, checklist pre-deploy |
> | **4** | 6 | Bombas silenciosas: timers, MP tokens, finanzas, legal |
>
> **Orden de ejecución recomendado**: 0 → 1 → 2 → 6.1 → 6.2 → 6.3 → 3 → 4 → 5 → 6.4-6.9
> (Las bombas silenciosas 6.1-6.3 van ANTES del E2E porque pueden requerir cambios de código)
