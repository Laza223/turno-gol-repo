# Decisión: el programa de referidos es permanente y el código se genera para todos

**Fecha:** 2026-10-31 · **Decide:** Lazar (founder), por chat · **Supera:** R2 de [`2026-09-26-referidos.md`](2026-09-26-referidos.md) (la fecha de cierre, 2026-10-31 23:59 ART).

## Qué cambia

1. **No hay fecha de cierre.** Cuenta como referido cualquier complejo que se registre con el link (o al que se le asigne referidor a mano) mientras el programa esté vigente. El premio sigue ganándose cuando el referido paga, aunque sea mucho después. `REFERRAL_PROMO_ENDS_AT` se eliminó de `src/shared/constants.ts` y de todos los lugares que lo usaban.
2. **El código se genera para todos los complejos**, no solo para los que el super-admin habilitaba o los que apretaban "Generar mi link":
   - los existentes: la migración 105 les asigna un código opaco (mismo alfabeto y formato de la 094);
   - las altas nuevas: `createTenantWithTrial` lo genera con `ensureReferralCode` justo después de crear el complejo. Si esa generación falla, el alta NO se frena: queda registrado en el log y el botón "Generar mi link" de `/settings/invitar` sigue funcionando como respaldo.
3. El cartel de Hoy aparece para todos los `admin` (nunca para `manager`), respeta `referral_banner_dismissed_at` y mantiene el texto actual ("Obtené hasta 6 meses gratis de TurnoGol"). El dueño dijo: "no es tan molesto el cartelito, de última lo cierran".
4. Los Términos (`/terminos`, punto 7) pierden la fecha y siguen diciendo que TurnoGol puede modificar o finalizar el programa respetando los meses ya ganados.

## Qué NO cambia

- Premio: 1 mes por cada referido que paga su primer mes (R1). Tope: 6 meses (`REFERRAL_REWARD_CAP`).
- Cada premio lo aprueba el founder antes de aplicarse (R4). Método manual: R5 y [`2026-10-22-referidos-metodo-manual-premio.md`](2026-10-22-referidos-metodo-manual-premio.md).
- R6: el código es opaco y lo emite el sistema; nunca se usa el slug.
- Sin cupos falsos ni escasez (R2 en lo que sigue valiendo) y la revisión de datos de R7: ahora no hay un 2026-11-01 que fuerce la decisión, pero la revisión con datos sigue siendo buena práctica.

## Brecha entre el 1/11 y el deploy

Mientras el corte estuvo en el código, las altas posteriores al 2026-10-31 23:59 ART que llegaron con un código quedaron con `referred_by_tenant_id` NULL. Para detectarlas (solo lectura, la corre Lazar):

```sql
SELECT t.id, t.name, t.created_at, su.signup_referral_code
FROM staff_users su
JOIN tenant_staff_members m ON m.staff_user_id = su.id
JOIN tenants t ON t.id = m.tenant_id
WHERE su.signup_referral_code IS NOT NULL
  AND su.created_at > '2026-11-01T02:59:59.999Z'
  AND t.referred_by_tenant_id IS NULL;
```

Si devuelve filas, se corrigen con "Asignar referidor" en el super-admin (`assignReferrer`, que ya no exige que el complejo sea anterior al corte).
