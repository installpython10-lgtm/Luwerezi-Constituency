-- ============================================================================
-- Mzimba Luwerezi CONSTITUENCY PORTAL
-- Migration 002: Sports & League Management Schema
-- Tables: sports_seasons, sports_areas, sports_teams, sports_players,
--         sports_matches, sports_match_events
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: sports_seasons
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sports_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Table: sports_areas
-- Geographical competition zones across Luwerezi.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sports_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. Table: sports_teams
-- Community clubs registered in specific geographical areas.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sports_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.sports_areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT,
  home_ground TEXT,
  coach_name TEXT,
  captain_name TEXT,
  founded_year TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_teams_name_area_unique UNIQUE (area_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sports_teams_area ON public.sports_teams(area_id);

-- ----------------------------------------------------------------------------
-- 4. Table: sports_players
-- Licensed players, squad rosters, and official seasonal statistics.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sports_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.sports_teams(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  jersey_number INTEGER,
  position TEXT CHECK (position IN ('Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Player')),
  appearances INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  clean_sheets INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sports_players_team ON public.sports_players(team_id);
CREATE INDEX IF NOT EXISTS idx_sports_players_goals ON public.sports_players(goals DESC);

-- ----------------------------------------------------------------------------
-- 5. Table: sports_matches
-- Fixtures calendar, audited results, and live match center feeds.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sports_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES public.sports_seasons(id) ON DELETE SET NULL,
  area_id UUID NOT NULL REFERENCES public.sports_areas(id) ON DELETE CASCADE,
  home_team_id UUID NOT NULL REFERENCES public.sports_teams(id) ON DELETE CASCADE,
  away_team_id UUID NOT NULL REFERENCES public.sports_teams(id) ON DELETE CASCADE,
  match_date DATE NOT NULL,
  kickoff_time TEXT DEFAULT '15:00',
  venue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (
    status IN ('Scheduled', 'In Progress', 'Completed', 'Postponed', 'Abandoned')
  ),
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  is_live BOOLEAN NOT NULL DEFAULT FALSE,
  current_period TEXT DEFAULT 'Scheduled',
  match_report TEXT,
  referee_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_matches_different_teams CHECK (home_team_id <> away_team_id)
);

CREATE INDEX IF NOT EXISTS idx_sports_matches_status ON public.sports_matches(status);
CREATE INDEX IF NOT EXISTS idx_sports_matches_area ON public.sports_matches(area_id);
CREATE INDEX IF NOT EXISTS idx_sports_matches_date ON public.sports_matches(match_date DESC);

CREATE TRIGGER set_sports_matches_updated_at
BEFORE UPDATE ON public.sports_matches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. Table: sports_match_events
-- Match timeline events (goals, disciplinary cards, substitutions).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sports_match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.sports_matches(id) ON DELETE CASCADE,
  minute INTEGER NOT NULL CHECK (minute >= 0 AND minute <= 130),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('Goal', 'Yellow Card', 'Red Card', 'Substitution', 'Penalty', 'Own Goal')
  ),
  team_id UUID NOT NULL REFERENCES public.sports_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.sports_players(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_events_match ON public.sports_match_events(match_id);