-- ============================================================================
-- MZIMBA SOUTH LUWEREZI CONSTITUENCY PORTAL
-- Migration 003: Confidential Safeguarding & Welfare Schema
-- Tables: safeguarding_reports, safeguarding_access_log
--
-- SECURITY ARCHITECTURE:
-- Segregated from public community case management tables.
-- Strict data minimization, air-gapped access controls, and mandatory
-- access logging for child protection and vulnerable adult welfare compliance.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: safeguarding_reports
-- Confidential intake channel strictly restricted to authorized welfare personnel.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.safeguarding_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_key TEXT UNIQUE NOT NULL,
  concern_type TEXT NOT NULL CHECK (
    concern_type IN (
      'child_protection',
      'gender_violence',
      'abuse_of_authority',
      'vulnerable_adult',
      'other_sensitive'
    )
  ),
  location_approx TEXT NOT NULL,
  narrative TEXT NOT NULL,
  safe_contact_method TEXT,
  status TEXT NOT NULL DEFAULT 'Restricted Intake Received' CHECK (
    status IN (
      'Restricted Intake Received',
      'Assigned to Welfare Officer',
      'Referred to DSWO / VSU',
      'Case Active',
      'Concluded / Closed'
    )
  ),
  assigned_officer_notes TEXT,
  statutory_referral_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safeguarding_intake_key ON public.safeguarding_reports(intake_key);
CREATE INDEX IF NOT EXISTS idx_safeguarding_status ON public.safeguarding_reports(status);
CREATE INDEX IF NOT EXISTS idx_safeguarding_concern_type ON public.safeguarding_reports(concern_type);

CREATE TRIGGER set_safeguarding_updated_at
BEFORE UPDATE ON public.safeguarding_reports
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. Table: safeguarding_access_log
-- Immutable forensic access trail. Every query, inspection, or status change
-- on safeguarding records must register an access log entry.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.safeguarding_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.safeguarding_reports(id) ON DELETE CASCADE,
  accessed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accessor_email TEXT,
  access_reason TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safeguarding_log_report ON public.safeguarding_access_log(report_id);
CREATE INDEX IF NOT EXISTS idx_safeguarding_log_accessed_at ON public.safeguarding_access_log(accessed_at DESC);