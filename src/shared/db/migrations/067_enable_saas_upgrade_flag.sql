-- ============================================================
-- 067_enable_saas_upgrade_flag.sql
-- Prende el upgrade self-service de plan (`/api/billing/upgrade`).
--
-- Por qué estaba apagado (TG-P1-MP-02): el proraeo de un upgrade llega al
-- webhook como un evento `payment`, exactamente igual que la seña de una
-- reserva. El handler elegía la cuenta de MercadoPago por tipo de evento, así
-- que consultaba ese pago con el token OAuth del COMPLEJO — cuando la
-- preferencia la había creado la cuenta MASTER de TurnoGol. MP no encuentra un
-- pago de otra cuenta: el job fallaba y el upgrade nunca se aplicaba pese a
-- estar cobrado. Un complejo que jamás conectó MP para señas ni siquiera
-- llegaba hasta ahí (moría en `TenantMpNotConnectedError`). Por eso la ruta
-- devolvía 501 en vez de arriesgar cobrar sin entregar.
--
-- Qué cambió: la `notification_url` de todo lo que cobra la cuenta master
-- ahora lleva `&source=saas` (billing.service.computeNotificationUrl) y el
-- handler elige la cuenta con ese discriminador, verificando además que el
-- `external_reference` del pago concuerde. Con eso el flujo cierra y el gate
-- deja de tener razón de ser.
--
-- Se prende con una fila global en vez de borrar el gate del código a
-- propósito: es plata real por un camino recién estrenado, y conviene poder
-- apagarlo (global o por complejo) sin esperar un deploy.
-- ============================================================

INSERT INTO feature_flags (key, value, tenant_id)
SELECT 'saas_upgrade', true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags WHERE key = 'saas_upgrade' AND tenant_id IS NULL
);
