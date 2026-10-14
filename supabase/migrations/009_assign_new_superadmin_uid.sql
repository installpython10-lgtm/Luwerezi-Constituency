-- Upgrade an existing deployment to the newly verified Auth UID.
-- Apply as a database administrator after confirming the UID in Supabase Auth.
DO $assignment$
DECLARE
  designated_uid CONSTANT UUID := '696a44db-fd7d-4131-8175-e00a23a19e67';
  email_confirmed_at TIMESTAMPTZ;
  assigned_rows INTEGER;
  roles_rls_enabled BOOLEAN;
BEGIN
  IF to_regclass('public.user_roles') IS NULL OR
     to_regclass('public.admin_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Required role and audit tables are missing. No role was assigned.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_roles'
        AND column_name = 'user_id'
        AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_roles'
        AND column_name = 'role'
        AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.user_roles'::regclass
        AND conname = 'user_roles_user_role_unique'
        AND contype = 'u'
        AND lower(pg_get_constraintdef(oid)) LIKE '%(user_id, role)%'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_row
      JOIN pg_attribute AS column_row
        ON column_row.attrelid = constraint_row.conrelid
       AND column_row.attnum = ANY(constraint_row.conkey)
      WHERE constraint_row.conrelid = 'public.user_roles'::regclass
        AND constraint_row.confrelid = 'auth.users'::regclass
        AND constraint_row.contype = 'f'
        AND column_row.attname = 'user_id'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_row
      JOIN pg_attribute AS column_row
        ON column_row.attrelid = constraint_row.conrelid
       AND column_row.attnum = ANY(constraint_row.conkey)
      WHERE constraint_row.conrelid = 'public.user_roles'::regclass
        AND constraint_row.contype = 'c'
        AND column_row.attname = 'role'
        AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%superadmin%'
  ) THEN
    RAISE EXCEPTION 'The user_roles schema does not match the expected guarded assignment schema. No role was assigned.';
  END IF;

  SELECT relation.relrowsecurity
    INTO roles_rls_enabled
    FROM pg_class AS relation
    WHERE relation.oid = 'public.user_roles'::regclass;

  IF NOT roles_rls_enabled THEN
    RAISE EXCEPTION 'Row Level Security is not enabled on public.user_roles. No role was assigned.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'user_roles'
        AND policyname = 'Only superadmins can view or manage roles'
        AND cmd = 'ALL'
        AND lower(coalesce(qual, '')) LIKE '%is_superadmin%'
        AND lower(coalesce(with_check, '')) LIKE '%is_superadmin%'
  ) THEN
    RAISE EXCEPTION 'The expected Superadmin-only user_roles RLS policy is missing or changed. No role was assigned.';
  END IF;

  IF to_regprocedure('public.is_superadmin()') IS NULL OR
     position('aal2' IN lower(pg_get_functiondef(
       to_regprocedure('public.is_superadmin()')
     ))) = 0 THEN
    RAISE EXCEPTION 'The AAL2-protected Superadmin authorization function is missing. No role was assigned.';
  END IF;

  IF to_regprocedure('public.track_community_report(text)') IS NULL THEN
    RAISE EXCEPTION 'Restricted report tracking migration 007 is not installed. No role was assigned.';
  END IF;

  SELECT auth_user.email_confirmed_at
    INTO email_confirmed_at
    FROM auth.users AS auth_user
    WHERE auth_user.id = designated_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The specified Auth UID does not exist. No role was assigned.';
  END IF;

  IF email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'The specified Auth account email is not confirmed. No role was assigned.';
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
          THEN 'Assigned superadmin to the verified auth.users UID after validating user_roles schema, RLS policy, confirmed account, and AAL2 authorization. '
        ELSE 'Confirmed existing superadmin role for the verified auth.users UID after validating the guarded authorization configuration. '
      END
    );
  END IF;
END;
$assignment$;
