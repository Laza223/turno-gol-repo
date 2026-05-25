-- ============================================================
-- 012_system_admins_audit.sql
-- B10 — Audit trigger on system_admins table.
--
-- Port of supabase/migrations/20260525000002_system_admins_audit.sql
-- (see docs/MIGRATIONS.md). Idempotent: DROP NOT NULL is a no-op when the
-- column is already nullable; CREATE OR REPLACE FUNCTION and
-- DROP TRIGGER IF EXISTS ... CREATE TRIGGER are idempotent by construction.
-- ============================================================

-- System-scoped audit rows (system_admins changes) carry no tenant.
ALTER TABLE audit_logs ALTER COLUMN tenant_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION audit_system_admins_change()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_resource_id UUID;
  v_metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'system_admin.created';
    v_resource_id := NEW.id;
    v_metadata := jsonb_build_object('email', NEW.email, 'status', NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'system_admin.updated';
    v_resource_id := NEW.id;
    v_metadata := jsonb_build_object(
      'changed_fields', (
        SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
        FROM jsonb_each(to_jsonb(NEW)) AS n(key, value)
        WHERE to_jsonb(NEW) ->> key IS DISTINCT FROM to_jsonb(OLD) ->> key
          AND key NOT IN ('updated_at', 'mfa_secret')
      ),
      'status_was', OLD.status,
      'status_now', NEW.status
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'system_admin.deleted';
    v_resource_id := OLD.id;
    v_metadata := jsonb_build_object('email', OLD.email);
  END IF;

  INSERT INTO audit_logs (tenant_id, actor_id, actor_type, action, resource_type, resource_id, metadata, created_at)
  VALUES (
    NULL,
    COALESCE(NULLIF(current_setting('app.current_system_admin_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
    'system',
    v_action,
    'system_admin',
    v_resource_id,
    v_metadata,
    NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_system_admins_audit ON system_admins;
CREATE TRIGGER trg_system_admins_audit
AFTER INSERT OR UPDATE OR DELETE ON system_admins
FOR EACH ROW EXECUTE FUNCTION audit_system_admins_change();
