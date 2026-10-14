-- ============================================================================
-- MZIMBA SOUTH LUWEREZI CONSTITUENCY PORTAL
-- Migration 005: Immutable Administrative Audit Logs
-- Table: admin_audit_logs
--
-- SECURITY ARCHITECTURE:
-- Cryptographically enforced immutability.
-- Triggers reject any UPDATE or DELETE operation on audit log rows,
-- guaranteeing an immutable forensic record for all administrative actions,
-- project modifications, report triages, and match score verifications.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: admin_audit_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON public.admin_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.admin_audit_logs(entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- 2. Immutability Enforcement Trigger
-- Strictly blocks and aborts any attempt to modify or delete audit log records.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Cryptographic Violation: admin_audit_logs records are strictly immutable and cannot be updated or deleted.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER prevent_audit_log_tampering
BEFORE UPDATE OR DELETE ON public.admin_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_immutability();

-- ----------------------------------------------------------------------------
-- 3. Row Level Security for Audit Logs
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only superadmins can view audit log trails"
  ON public.admin_audit_logs FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can append audit records"
  ON public.admin_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());