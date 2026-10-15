-- ============================================================================
-- Mzimba Luwerezi CONSTITUENCY PORTAL
-- Migration 004: Row Level Security (RLS) & Access Policies
-- 
-- Enforces zero unauthorized access:
-- 1. Residents can only view their own private submissions.
-- 2. Public can inspect transparency registers, sports schedules, and tables.
-- 3. Only authenticated Superadmins can perform administrative mutations.
-- 4. Safeguarding reports are air-gapped with zero public read access.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper Function: Check Superadmin Privilege
-- Defined as SECURITY DEFINER to prevent recursive RLS evaluation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'superadmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- 2. ENABLE RLS ON ALL PUBLIC TABLES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safeguarding_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safeguarding_access_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. PROFILES POLICIES
-- ============================================================================
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_superadmin());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================================
-- 4. USER ROLES POLICIES
-- ============================================================================
CREATE POLICY "Only superadmins can view or manage roles"
  ON public.user_roles FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ============================================================================
-- 5. DEVELOPMENT PROJECTS POLICIES (Public Transparency)
-- ============================================================================
CREATE POLICY "Public can inspect development projects"
  ON public.development_projects FOR SELECT
  TO public
  USING (TRUE);

CREATE POLICY "Only superadmins can insert projects"
  ON public.development_projects FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Only superadmins can update projects"
  ON public.development_projects FOR UPDATE
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Only superadmins can delete projects"
  ON public.development_projects FOR DELETE
  TO authenticated
  USING (public.is_superadmin());

-- ============================================================================
-- 6. COMMUNITY REPORTS POLICIES
-- ============================================================================
-- Anyone (resident or anonymous visitor) can submit a community infrastructure report
CREATE POLICY "Anyone can lodge a community issue report"
  ON public.community_reports FOR INSERT
  TO public
  WITH CHECK (TRUE);

-- Authenticated residents can view solely reports logged under their user_id
CREATE POLICY "Residents can view their own logged cases"
  ON public.community_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_superadmin());

-- Anonymous tracking is provided by the restricted RPC in migration 007.
-- Do not grant anon direct SELECT on community_reports.

-- Only Superadmins can triage, update status, and manage reports
CREATE POLICY "Only superadmins can update community reports"
  ON public.community_reports FOR UPDATE
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Only superadmins can delete community reports"
  ON public.community_reports FOR DELETE
  TO authenticated
  USING (public.is_superadmin());

-- ============================================================================
-- 7. SPORTS MODULE POLICIES (Public View, Superadmin Edit)
-- ============================================================================
-- Public SELECT permissions
CREATE POLICY "Public can view sports seasons" ON public.sports_seasons FOR SELECT TO public USING (TRUE);
CREATE POLICY "Public can view sports areas" ON public.sports_areas FOR SELECT TO public USING (TRUE);
CREATE POLICY "Public can view sports teams" ON public.sports_teams FOR SELECT TO public USING (TRUE);
CREATE POLICY "Public can view sports players" ON public.sports_players FOR SELECT TO public USING (TRUE);
CREATE POLICY "Public can view sports matches" ON public.sports_matches FOR SELECT TO public USING (TRUE);
CREATE POLICY "Public can view match events" ON public.sports_match_events FOR SELECT TO public USING (TRUE);

-- Superadmin WRITE permissions
CREATE POLICY "Superadmin manage sports seasons" ON public.sports_seasons FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmin manage sports areas" ON public.sports_areas FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmin manage sports teams" ON public.sports_teams FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmin manage sports players" ON public.sports_players FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmin manage sports matches" ON public.sports_matches FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmin manage match events" ON public.sports_match_events FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ============================================================================
-- 8. SAFEGUARDING POLICIES (Strict Air-Gap)
-- ============================================================================
-- Public can ONLY submit into safeguarding table; zero public SELECT allowed
CREATE POLICY "Anyone can submit confidential safeguarding report"
  ON public.safeguarding_reports FOR INSERT
  TO public
  WITH CHECK (TRUE);

-- Strictly Superadmins / Authorized Welfare Officers can view or update safeguarding
CREATE POLICY "Only authorized superadmins can inspect safeguarding queue"
  ON public.safeguarding_reports FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Only authorized superadmins can update safeguarding records"
  ON public.safeguarding_reports FOR UPDATE
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Safeguarding access logs are strictly accessible by Superadmins
CREATE POLICY "Only superadmins can view safeguarding access log"
  ON public.safeguarding_access_log FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert access audit records"
  ON public.safeguarding_access_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());