-- One-time, database-admin assignment for the requested existing Auth user.
-- This migration refuses to proceed unless the designated UID exists in auth.users.
-- Apply only after reviewing migrations 001-007 and verifying the identity.

DO $assignment$
DECLARE
  designated_uid CONSTANT UUID := '696a44db-fd7d-4131-8175-e00a23a19e67';
  email_confirmed_at TIMESTAMPTZ;
  assigned_rows INTEGER;
BEGIN
  IF to_regclass('public.user_roles') IS NULL OR
     to_regclass('public.admin_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Required role and audit tables are missing. Apply migrations 001 and 005 first.';
  END IF;

  IF to_regprocedure('public.is_superadmin()') IS NULL THEN
    RAISE EXCEPTION 'Superadmin authorization function is missing. No role was assigned.';
  END IF;

  IF position('aal2' IN pg_get_functiondef(
    to_regprocedure('public.is_superadmin()')
  )) = 0 THEN
    RAISE EXCEPTION 'MFA authorization migration 006 is not installed. No role was assigned.';
  END IF;

  IF to_regprocedure('public.track_community_report(text)') IS NULL THEN
    RAISE EXCEPTION 'Restricted report tracking migration 007 is not installed. No role was assigned.';
  END IF;

  SELECT auth_user.email_confirmed_at
    INTO email_confirmed_at
    FROM auth.users AS auth_user
    WHERE auth_user.id = designated_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The designated Auth UID does not exist. No role was assigned.';
  END IF;

  IF email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'The designated Auth account email is not confirmed. No role was assigned.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (designated_uid, 'superadmin')
  ON CONFLICT (user_id, role) DO NOTHING;

  GET DIAGNOSTICS assigned_rows = ROW_COUNT;

  IF assigned_rows = 1 OR NOT EXISTS (
    SELECT 1
      FROM public.admin_audit_logs
      WHERE action_type IN (
        'SUPERADMIN_ROLE_ASSIGNED',
        'SUPERADMIN_ROLE_ASSIGNMENT_CONFIRMED'
      )
        AND entity_type = 'user_roles'
        AND entity_id = designated_uid::TEXT
  ) THEN
    INSERT INTO public.admin_audit_logs (
      actor_email,
      actor_id,
      action_type,
      entity_type,
      entity_id,
      details
    )
    VALUES (
      'Database administrator (' || current_user || ')',
      NULL,
      CASE
        WHEN assigned_rows = 1 THEN 'SUPERADMIN_ROLE_ASSIGNED'
        ELSE 'SUPERADMIN_ROLE_ASSIGNMENT_CONFIRMED'
      END,
      'user_roles',
      designated_uid::TEXT,
      CASE
        WHEN assigned_rows = 1
          THEN 'Assigned superadmin to the verified auth.users UID. Requires AAL2 MFA under migration 006.'
        ELSE 'Confirmed existing superadmin role for the verified auth.users UID. Requires AAL2 MFA under migration 006.'
      END
    );
  END IF;
END;
$assignment$;
