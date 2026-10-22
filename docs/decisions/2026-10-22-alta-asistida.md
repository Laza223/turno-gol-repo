# Decisión: alta asistida de un complejo desde el super-admin

**Fecha:** 2026-10-22 · **Decide:** Lazar (founder) · **Insumo:** [`10-aprendizajes.md`](../gtm/ejecucion/10-aprendizajes.md), 2026-09-02. El alta de P1 se hizo a mano porque el único camino era el self-signup.

## Problema

El único camino de alta era el self-signup: `/register`, después confirmar el email y por último el wizard. Cada complejo que se vende por WhatsApp depende de que el dueño haga los tres pasos solo, o de una intervención manual que no queda auditada.

## Decisiones

1. **Acceso con contraseña temporal.** El super-admin crea la cuenta del dueño con el email ya confirmado y una contraseña temporal que se muestra **una sola vez**. Se la pasa al dueño por WhatsApp. Es el mismo mecanismo que "Resetear contraseña" (`force_password_change`). En el primer ingreso `/reset-password` lo obliga a crear la suya, con el copy de "Creá tu contraseña" (`staff_invited`).
2. **Precarga de datos básicos.**
   - Del complejo: nombre, dirección, ciudad, provincia y teléfono.
   - Del dueño: nombre, apellido y email.

   El email del dueño es también el email del complejo, igual que en el self-signup. Horarios y canchas los carga el dueño en el wizard, o el super-admin con la impersonación que ya existe.
3. **El primer ingreso arranca el wizard desde Horarios.** El wizard no cambia: `createTenantWithTrial` deja `onboarding_step = 1`, así que `resolveWizardStep` cae en el paso 2.
4. **Referido opcional en el mismo formulario.** Acepta el código o el link `/r/<CODE>`, con las mismas reglas que el self-signup (`resolveSignupReferrer`: promo vigente, complejo no `deleted`/`churned`, sin autorreferido). A diferencia del self-signup, un código inválido **frena el alta** con el error en el campo: lo tipeó el super-admin y lo tiene que poder corregir. El panel "Asignar referidor" del detalle sigue sirviendo para después.
5. **Trial de 30 días**, igual que el self-signup (`TRIAL_DAYS`): el lifecycle no cambia. Para extenderlo está el botón de siempre. Cualquier otro largo es REQUIERE INPUT.

## Reglas

- Guard `requireSystemAdminAction` (triple check + rate limit `superAdminAction`).
- **F5** ([`2026-10-14-foco-jugador-rival.md`](2026-10-14-foco-jugador-rival.md)): si el email ya es de un jugador, se rechaza **antes** de crear nada. También se rechaza si ya es de un staff: en esta versión un dueño con cuenta no suma un segundo complejo por acá.
- La creación queda en `audit_logs` como `support.tenant.created`, en la **misma transacción** que la membresía y la suscripción. La contraseña no va nunca a un log, al audit ni a Sentry.
- **Orden y compensación.** La cuenta de Auth se crea primero, porque es el único efecto externo y se deshace limpio con `deleteUser`. Si después falla la escritura en la base, se borran la cuenta de Auth y la fila de `staff_users`, y el error sube. Si no se puede borrar la fila de staff, la cuenta de Auth se deja: ese caso solo se da cuando la transacción commiteó y se perdió la respuesta, y el complejo está entero. Cualquier falla de la compensación va a Sentry con los ids de la cuenta y de la fila de staff, nunca con la contraseña.

## Fuera de esta versión

- El dueño que ya tiene cuenta de staff y quiere un segundo complejo.
- Precargar horarios o canchas.
- Un trial de otro largo.
- Reutilizar una cuenta de Auth que ya existe sin fila de staff ni de jugador, como un `/register` que nunca se confirmó. Hoy el alta se frena con un mensaje que dice cómo destrabarlo: otro email, o borrar ese acceso en Supabase Auth. Reutilizarla queda pendiente de decisión del dueño.

## Riesgos aceptados

- El email queda confirmado sin que el dueño lo verifique. Si tiene un error de tipeo, la cuenta queda a nombre de una dirección ajena. Por eso el formulario pide revisarlo, y el mail de bienvenida va a esa dirección.
- Si la respuesta se pierde después del commit (se cae la red o se cierra la pestaña), el super-admin no llega a ver la contraseña temporal. El complejo quedó entero, así que reintentar con el mismo email da `staff_account`: la fila de staff ya existe. La salida es buscar el complejo en `/super-admin/tenants`, abrir el detalle y usar **"Resetear contraseña"** con el email del dueño (`resetStaffPasswordAction`). Genera otra temporal con `force_password_change`, conserva los claims del tenant y queda auditado como `support.user.password_reset`.
- `createTenantWithTrial` inserta `tenants` fuera de la transacción (preexistente, igual que en el self-signup). Si la transacción falla después, queda un complejo sin miembros. La compensación no lo borra: borrar en `tenants` arrastra cascadas.
