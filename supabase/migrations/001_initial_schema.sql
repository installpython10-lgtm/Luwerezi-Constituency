-- ============================================================================
-- Mzimba Luwerezi CONSTITUENCY PORTAL
-- Migration 001: Initial Core Schema
-- Tables: profiles, user_roles, development_projects, community_reports
-- ============================================================================

-- Enable essential cryptographic and UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Helper Function: Touch Updated Timestamp
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. Table: profiles
-- Mirrors auth.users metadata for resident dashboard and profile handling.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'resident' CHECK (role IN ('resident', 'superadmin', 'official')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile trigger on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Resident User'),
    NEW.raw_user_meta_data->>'phone',
    'resident'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. Table: user_roles
-- Isolated role assignments for strict server-side Superadmin authorization.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'official', 'auditor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- ----------------------------------------------------------------------------
-- 4. Table: development_projects
-- Public register of constituency infrastructure, expenditures, and verification audits.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.development_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('water', 'education', 'health', 'roads', 'community', 'youth_sports', 'other')),
  location TEXT NOT NULL,
  funding_source TEXT NOT NULL,
  budget NUMERIC(15, 2),
  expenditure NUMERIC(15, 2),
  implementing_agency TEXT,
  start_date TEXT,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'Proposed' CHECK (
    status IN ('Proposed', 'Approved', 'In Progress', 'Delayed', 'Reported Completed', 'Independently Verified', 'Cancelled')
  ),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (
    verification_status IN ('unverified', 'verified', 'unconfirmed')
  ),
  verification_source TEXT,
  verification_date TEXT,
  verification_notes TEXT,
  delay_reason TEXT,
  description TEXT,
  photos JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON public.development_projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_category ON public.development_projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_verification ON public.development_projects(verification_status);

CREATE TRIGGER set_projects_updated_at
BEFORE UPDATE ON public.development_projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. Table: community_reports
-- Resident issue submissions, tracking reference numbers, and case history.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  ward TEXT NOT NULL,
  village TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  attachment_url TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  reporter_name TEXT,
  reporter_phone TEXT,
  reporter_email TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK (
    status IN ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Referred', 'Resolved')
  ),
  status_history JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_ref ON public.community_reports(reference_number);
CREATE INDEX IF NOT EXISTS idx_reports_user ON public.community_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.community_reports(status);

CREATE TRIGGER set_reports_updated_at
BEFORE UPDATE ON public.community_reports
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();