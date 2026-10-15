/**
 * Mzimba Luwerezi Constituency — Sports & League Module
 * Standings calculation, fixtures scheduling, live scorekeeper feed, player rosters & golden boot rankings.
 */

import { getSupabase, isSupabaseConfigured } from './supabase-client.js';

let cachedAreas = [];
let cachedTeams = [];
let cachedMatches = [];
let cachedPlayers = [];

/**
 * Fetches all sports reference data from database.
 */
export async function loadSportsData() {
  if (!isSupabaseConfigured()) {
    return {
      areas: cachedAreas,
      teams: cachedTeams,
      matches: cachedMatches,
      players: cachedPlayers
    };
  }

  try {
    const sb = await getSupabase();
    const [areasRes, teamsRes, matchesRes, playersRes] = await Promise.all([
      sb.from('sports_areas').select('*').order('name'),
      sb.from('sports_teams').select('*').order('name'),
      sb.from('sports_matches').select('*').order('match_date', { ascending: false }),
      sb.from('sports_players').select('*').order('goals', { ascending: false })
    ]);

    if (areasRes.data) cachedAreas = areasRes.data;
    if (teamsRes.data) cachedTeams = teamsRes.data;
    if (matchesRes.data) cachedMatches = matchesRes.data;
    if (playersRes.data) cachedPlayers = playersRes.data;
  } catch (err) {
    console.warn('[Sports] Error fetching sports database records:', err);
  }

  return {
    areas: cachedAreas,
    teams: cachedTeams,
    matches: cachedMatches,
    players: cachedPlayers
  };
}

/**
 * Calculates league standings dynamically from verified completed matches.
 * @param {string} [areaId] 'all' or specific area UUID
 * @returns {Array} Array of table standing rows sorted by Points, GD, GF
 */
export function calculateStandings(areaId = 'all') {
  const teamsMap = {};

  const relevantTeams = areaId === 'all'
    ? cachedTeams
    : cachedTeams.filter((t) => t.area_id === areaId);

  relevantTeams.forEach((t) => {
    teamsMap[t.id] = {
      id: t.id,
      name: t.name,
      area_id: t.area_id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      form: []
    };
  });

  const completedMatches = cachedMatches.filter((m) => m.status === 'Completed');

  completedMatches.forEach((m) => {
    const home = teamsMap[m.home_team_id];
    const away = teamsMap[m.away_team_id];

    if (!home || !away) return;

    const hScore = Number(m.home_score || 0);
    const aScore = Number(m.away_score || 0);

    home.played += 1;
    away.played += 1;
    home.gf += hScore;
    home.ga += aScore;
    away.gf += aScore;
    away.ga += hScore;

    if (hScore > aScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
      home.form.unshift('W');
      away.form.unshift('L');
    } else if (hScore < aScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
      away.form.unshift('W');
      home.form.unshift('L');
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      home.form.unshift('D');
      away.form.unshift('D');
    }
  });

  const standings = Object.values(teamsMap).map((row) => {
    row.gd = row.gf - row.ga;
    row.form = row.form.slice(0, 5);
    return row;
  });

  // Sort by Points desc, Goal Difference desc, Goals For desc, Name asc
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });

  return standings;
}

/**
 * Initializes Sports Hub Overview (sports.html).
 */
export async function initSportsHub() {
  await loadSportsData();

  // Populate Active Live Match Banner if match is currently marked Live
  const liveMatch = cachedMatches.find((m) => m.status === 'In Progress' || m.is_live);
  const liveBannerSection = document.getElementById('sportsLiveMatchBannerSection');
  if (liveBannerSection) {
    if (liveMatch) {
      const homeTeam = cachedTeams.find((t) => t.id === liveMatch.home_team_id)?.name || 'Home';
      const awayTeam = cachedTeams.find((t) => t.id === liveMatch.away_team_id)?.name || 'Away';
      const detailsEl = document.getElementById('hubLiveMatchDetails');
      if (detailsEl) {
        detailsEl.innerHTML = `
          <span class="live-match-teams">${homeTeam} vs ${awayTeam}</span>
          <span class="live-match-score">${liveMatch.home_score || 0} - ${liveMatch.away_score || 0}</span>
          <span class="live-match-clock">${liveMatch.current_period || 'LIVE'}</span>
        `;
      }
      liveBannerSection.style.display = 'block';
    } else {
      liveBannerSection.style.display = 'none';
    }
  }

  // Standings Snapshot
  const standingsTbody = document.getElementById('hubStandingsTbody');
  if (standingsTbody) {
    const standings = calculateStandings('all');
    if (standings.length === 0) {
      standingsTbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No league records registered yet.</td></tr>`;
    } else {
      standingsTbody.innerHTML = standings.slice(0, 5).map((row, idx) => `
        <tr>
          <td class="font-bold text-center">${idx + 1}</td>
          <td class="font-bold">${row.name}</td>
          <td class="text-center">${row.played}</td>
          <td class="text-center">${row.won}</td>
          <td class="text-center">${row.drawn}</td>
          <td class="text-center">${row.lost}</td>
          <td class="text-center">${row.gd > 0 ? `+${row.gd}` : row.gd}</td>
          <td class="text-center font-bold font-mono">${row.points}</td>
        </tr>
      `).join('');
    }
  }

  // Previews: Recent Results & Upcoming Fixtures
  const recentResultsContainer = document.getElementById('hubRecentResultsList');
  if (recentResultsContainer) {
    const past = cachedMatches.filter((m) => m.status === 'Completed').slice(0, 3);
    if (past.length === 0) {
      recentResultsContainer.innerHTML = `<div class="empty-state-card py-4"><p class="text-xs text-muted">No completed match scorecards logged yet.</p></div>`;
    } else {
      recentResultsContainer.innerHTML = past.map((m) => renderMiniMatchCard(m)).join('');
    }
  }

  const upcomingContainer = document.getElementById('hubUpcomingFixturesList');
  if (upcomingContainer) {
    const scheduled = cachedMatches.filter((m) => m.status === 'Scheduled').slice(0, 3);
    if (scheduled.length === 0) {
      upcomingContainer.innerHTML = `<div class="empty-state-card py-4"><p class="text-xs text-muted">No scheduled fixtures posted at this moment.</p></div>`;
    } else {
      upcomingContainer.innerHTML = scheduled.map((m) => renderMiniMatchCard(m)).join('');
    }
  }
}

/**
 * Helper to render compact match cards on the hub.
 */
function renderMiniMatchCard(m) {
  const home = cachedTeams.find((t) => t.id === m.home_team_id)?.name || 'Home Club';
  const away = cachedTeams.find((t) => t.id === m.away_team_id)?.name || 'Away Club';
  const isCompleted = m.status === 'Completed';

  return `
    <div class="card p-3 flex justify-between items-center text-xs">
      <div>
        <span class="text-muted block text-2xs">${m.match_date ? new Date(m.match_date).toLocaleDateString() : ''} &bull; ${m.venue || 'Pitch'}</span>
        <strong>${home}</strong> vs <strong>${away}</strong>
      </div>
      <div class="text-right">
        ${isCompleted
          ? `<span class="badge badge-mono font-bold">${m.home_score} - ${m.away_score}</span>`
          : `<span class="badge badge-outline">${m.kickoff_time || 'Scheduled'}</span>`}
      </div>
    </div>
  `;
}

/**
 * Initializes League Standings & Tables Page (sports-tables.html).
 */
export async function initSportsTables() {
  await loadSportsData();

  const areaSelect = document.getElementById('tableAreaSelect');
  const tbody = document.getElementById('mainStandingsTbody');
  const heading = document.getElementById('currentZoneTableHeading');

  if (!tbody) return;

  // Populate area dropdown
  if (areaSelect) {
    areaSelect.innerHTML = `
      <option value="all">All Zones (Consolidated)</option>
      ${cachedAreas.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}
    `;

    areaSelect.addEventListener('change', () => {
      const selectedAreaId = areaSelect.value;
      const selectedAreaName = areaSelect.options[areaSelect.selectedIndex].text;
      if (heading) heading.textContent = `${selectedAreaName} Standings`;
      renderFullStandingsTable(selectedAreaId, tbody);
    });
  }

  renderFullStandingsTable('all', tbody);
}

function renderFullStandingsTable(areaId, tbody) {
  const standings = calculateStandings(areaId);

  if (standings.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-6 text-muted">
          No active teams or match records in this zone yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = standings.map((row, idx) => {
    const formPills = row.form.map((res) => {
      const cls = res === 'W' ? 'w' : (res === 'D' ? 'd' : 'l');
      return `<span class="form-pill ${cls}">${res}</span>`;
    }).join('');

    return `
      <tr>
        <td class="font-mono text-center font-bold">${idx + 1}</td>
        <td class="td-team">${row.name}</td>
        <td>${row.played}</td>
        <td>${row.won}</td>
        <td>${row.drawn}</td>
        <td>${row.lost}</td>
        <td>${row.gf}</td>
        <td>${row.ga}</td>
        <td>${row.gd > 0 ? `+${row.gd}` : row.gd}</td>
        <td class="td-pts">${row.points}</td>
        <td class="hide-mobile">
          <div class="form-badge-strip">${formPills || '&mdash;'}</div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Initializes Fixtures & Results Page (sports-fixtures.html).
 */
export async function initSportsFixtures() {
  await loadSportsData();

  const tabFixturesBtn = document.getElementById('tabFixturesBtn');
  const tabResultsBtn = document.getElementById('tabResultsBtn');
  const fixturesPanel = document.getElementById('fixturesTabPanel');
  const resultsPanel = document.getElementById('resultsTabPanel');
  const scheduledContainer = document.getElementById('scheduledFixturesContainer');
  const resultsContainer = document.getElementById('pastResultsContainer');
  const areaSelect = document.getElementById('fixtureAreaSelect');
  const searchInput = document.getElementById('fixtureSearchInput');

  if (!scheduledContainer || !resultsContainer) return;

  // Populate area selector
  if (areaSelect) {
    areaSelect.innerHTML = `
      <option value="all">All Areas / Zones</option>
      ${cachedAreas.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}
    `;
  }

  // Tab switching
  tabFixturesBtn?.addEventListener('click', () => {
    tabFixturesBtn.classList.add('active');
    tabFixturesBtn.setAttribute('aria-selected', 'true');
    tabResultsBtn.classList.remove('active');
    tabResultsBtn.setAttribute('aria-selected', 'false');
    fixturesPanel.removeAttribute('hidden');
    resultsPanel.setAttribute('hidden', '');
  });

  tabResultsBtn?.addEventListener('click', () => {
    tabResultsBtn.classList.add('active');
    tabResultsBtn.setAttribute('aria-selected', 'true');
    tabFixturesBtn.classList.remove('active');
    tabFixturesBtn.setAttribute('aria-selected', 'false');
    resultsPanel.removeAttribute('hidden');
    fixturesPanel.setAttribute('hidden', '');
  });

  function renderMatches() {
    const areaFilter = areaSelect?.value || 'all';
    const query = searchInput?.value?.toLowerCase().trim() || '';

    const scheduled = cachedMatches.filter((m) => m.status === 'Scheduled' || m.status === 'In Progress');
    const completed = cachedMatches.filter((m) => m.status === 'Completed' || m.status === 'Postponed');

    const filterList = (list) => list.filter((m) => {
      const matchArea = areaFilter === 'all' || m.area_id === areaFilter;
      const homeTeam = cachedTeams.find((t) => t.id === m.home_team_id)?.name.toLowerCase() || '';
      const awayTeam = cachedTeams.find((t) => t.id === m.away_team_id)?.name.toLowerCase() || '';
      const venue = (m.venue || '').toLowerCase();
      const matchQuery = !query || homeTeam.includes(query) || awayTeam.includes(query) || venue.includes(query);
      return matchArea && matchQuery;
    });

    renderMatchList(filterList(scheduled), scheduledContainer, false);
    renderMatchList(filterList(completed), resultsContainer, true);
  }

  areaSelect?.addEventListener('change', renderMatches);
  searchInput?.addEventListener('input', renderMatches);

  renderMatches();
}

function renderMatchList(matches, container, isPastView) {
  if (matches.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <p class="empty-state-title">No match records found</p>
      </div>
    `;
    return;
  }

  container.innerHTML = matches.map((m) => {
    const homeTeam = cachedTeams.find((t) => t.id === m.home_team_id)?.name || 'Home Club';
    const awayTeam = cachedTeams.find((t) => t.id === m.away_team_id)?.name || 'Away Club';
    const areaName = cachedAreas.find((a) => a.id === m.area_id)?.name || 'Constituency';
    const isLive = m.status === 'In Progress';

    return `
      <article class="match-card ${isLive ? 'is-live' : ''}">
        <div class="match-card-meta">
          <span class="match-card-date">${m.match_date ? new Date(m.match_date).toLocaleDateString() : 'Date TBD'}</span>
          <span class="text-muted">${m.kickoff_time || '15:00'} &bull; ${areaName}</span>
          <span class="match-card-venue">📍 ${m.venue || 'Pitch TBA'}</span>
        </div>

        <div class="match-card-teams">
          <div class="team-participant team-home">${homeTeam}</div>
          ${m.status === 'Completed'
            ? `<div class="match-score-pill">${m.home_score} - ${m.away_score}</div>`
            : (isLive
              ? `<div class="match-score-pill">${m.home_score} - ${m.away_score}</div>`
              : `<div class="match-vs-pill">VS</div>`)}
          <div class="team-participant team-away">${awayTeam}</div>
        </div>

        <div class="match-card-action">
          ${isLive
            ? `<a href="sports-live.html" class="btn btn-secondary btn-xs"><span class="live-dot mr-1"></span> Follow Live</a>`
            : `<span class="badge ${m.status === 'Completed' ? 'badge-verified' : 'badge-outline'} text-2xs">${m.status}</span>`}
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Initializes Verified Live Match Center (sports-live.html).
 */
export async function initSportsLive() {
  await loadSportsData();

  const container = document.getElementById('liveMatchesContainer');
  const refreshBtn = document.getElementById('refreshLiveMatchesBtn');
  const statusText = document.getElementById('liveCenterStatusText');

  if (!container) return;

  async function renderLiveMatches() {
    // Re-fetch matches to ensure real-time accuracy
    await loadSportsData();
    const liveMatches = cachedMatches.filter((m) => m.status === 'In Progress' || m.is_live);

    if (liveMatches.length === 0) {
      if (statusText) statusText.textContent = 'Pitch Monitoring Active • No Matches In Progress';
      container.innerHTML = `
        <div class="empty-state-card">
          <div class="text-3xl mb-2" aria-hidden="true">&#9917;</div>
          <h2 class="empty-state-title">No Matches Currently in Progress</h2>
          <p class="empty-state-subtitle">Scores are posted in real-time only when authorized match officials are actively transmitting events from constituency grounds.</p>
          <div class="mt-4 flex justify-center gap-3">
            <a href="sports-fixtures.html" class="btn btn-primary btn-sm">View Fixtures Schedule</a>
            <a href="sports-tables.html" class="btn btn-outline btn-sm">View Current Standings</a>
          </div>
        </div>
      `;
      return;
    }

    if (statusText) statusText.textContent = `LIVE BROADCASTING • ${liveMatches.length} Match(es) Active`;

    container.innerHTML = liveMatches.map((m) => {
      const homeTeam = cachedTeams.find((t) => t.id === m.home_team_id)?.name || 'Home Club';
      const awayTeam = cachedTeams.find((t) => t.id === m.away_team_id)?.name || 'Away Club';
      const area = cachedAreas.find((a) => a.id === m.area_id)?.name || 'Zone Match';

      return `
        <article class="live-center-scoreboard">
          <span class="scoreboard-period-badge">
            <span class="live-dot mr-1"></span> ${m.current_period || 'LIVE 1ST HALF'}
          </span>
          <div class="scoreboard-teams-row">
            <div class="scoreboard-team-name text-right">${homeTeam}</div>
            <div class="scoreboard-score-display">${m.home_score || 0} - ${m.away_score || 0}</div>
            <div class="scoreboard-team-name text-left">${awayTeam}</div>
          </div>
          <div class="scoreboard-match-info">
            <span>📍 ${m.venue || 'Ground'} &bull; Area: ${area} &bull; Scorekeeper Audited</span>
          </div>
        </article>
      `;
    }).join('');
  }

  refreshBtn?.addEventListener('click', renderLiveMatches);
  renderLiveMatches();
}

/**
 * Initializes Teams & Player Rosters (sports-teams.html).
 */
export async function initSportsTeams() {
  await loadSportsData();

  const container = document.getElementById('teamsGridContainer');
  const countLabel = document.getElementById('teamsCountLabel');
  const areaSelect = document.getElementById('teamsAreaSelect');
  const searchInput = document.getElementById('teamsSearchInput');

  if (!container) return;

  if (areaSelect) {
    areaSelect.innerHTML = `
      <option value="all">All Areas / Zones</option>
      ${cachedAreas.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}
    `;
  }

  function renderTeams() {
    const areaFilter = areaSelect?.value || 'all';
    const query = searchInput?.value?.toLowerCase().trim() || '';

    const filtered = cachedTeams.filter((t) => {
      const matchArea = areaFilter === 'all' || t.area_id === areaFilter;
      const matchQuery = !query || t.name.toLowerCase().includes(query) || (t.home_ground || '').toLowerCase().includes(query);
      return matchArea && matchQuery;
    });

    if (countLabel) countLabel.textContent = `Showing ${filtered.length} verified teams`;

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-state-card col-span-3"><p class="empty-state-title">No registered teams found matching filters</p></div>`;
      return;
    }

    container.innerHTML = filtered.map((t) => {
      const areaName = cachedAreas.find((a) => a.id === t.area_id)?.name || 'Zone';
      const squadCount = cachedPlayers.filter((p) => p.team_id === t.id).length;

      return `
        <article class="team-card-profile">
          <div>
            <div class="team-card-header">
              <span class="badge badge-mono text-2xs">${areaName}</span>
              <span class="text-xs text-muted font-bold font-mono">${squadCount} Players</span>
            </div>
            <h3 class="team-card-title">${t.name}</h3>
            <p class="team-card-ground">📍 Pitch: ${t.home_ground || 'Home Ground TBD'}</p>
          </div>

          <div class="team-card-stats">
            <div class="team-stat-item">
              <strong>${t.founded_year || 'Est.'}</strong>
              <span>Founded</span>
            </div>
            <div class="team-stat-item">
              <strong>${t.coach_name || 'Coach'}</strong>
              <span>Coach</span>
            </div>
            <div class="team-stat-item">
              <strong>${t.captain_name || 'Captain'}</strong>
              <span>Captain</span>
            </div>
          </div>

          <button type="button" class="btn btn-outline btn-xs w-full btn-view-squad" data-team-id="${t.id}">
            Inspect Squad Roster &rarr;
          </button>
        </article>
      `;
    }).join('');

    // Attach Roster Modal openers
    document.querySelectorAll('.btn-view-squad').forEach((btn) => {
      btn.addEventListener('click', () => {
        const teamId = btn.getAttribute('data-team-id');
        openTeamRosterModal(teamId);
      });
    });
  }

  areaSelect?.addEventListener('change', renderTeams);
  searchInput?.addEventListener('input', renderTeams);

  renderTeams();
  initRosterModalEvents();
}

/**
 * Squad Roster Inspection Modal
 */
function openTeamRosterModal(teamId) {
  const modal = document.getElementById('teamRosterModal');
  const team = cachedTeams.find((t) => t.id === teamId);
  const players = cachedPlayers.filter((p) => p.team_id === teamId);
  const tbody = document.getElementById('modalRosterTbody');

  if (!modal || !team || !tbody) return;

  document.getElementById('rosterModalTitle').textContent = team.name;
  document.getElementById('modalTeamGround').textContent = `Home Ground: ${team.home_ground || 'Designated Venue'}`;
  document.getElementById('modalTeamZone').textContent = cachedAreas.find((a) => a.id === team.area_id)?.name || 'Zone';

  if (players.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No squad members registered under this club yet.</td></tr>`;
  } else {
    tbody.innerHTML = players.map((p, idx) => `
      <tr>
        <td class="font-mono">${p.jersey_number || idx + 1}</td>
        <td class="font-bold">${p.full_name}</td>
        <td>${p.position || 'Player'}</td>
        <td class="text-center">${p.appearances || 0}</td>
        <td class="text-center font-bold font-mono">${p.goals || 0}</td>
      </tr>
    `).join('');
  }

  modal.removeAttribute('hidden');
}

function initRosterModalEvents() {
  const modal = document.getElementById('teamRosterModal');
  const closeTop = document.getElementById('closeRosterModalBtn');
  const closeBtm = document.getElementById('closeRosterModalBottomBtn');

  const close = () => modal?.setAttribute('hidden', '');
  closeTop?.addEventListener('click', close);
  closeBtm?.addEventListener('click', close);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
}

/**
 * Initializes Statistics & Golden Boot Page (sports-stats.html).
 */
export async function initSportsStats() {
  await loadSportsData();

  const scorersTbody = document.getElementById('topScorersTbody');
  const cleanSheetsTbody = document.getElementById('cleanSheetsTbody');
  const disciplinaryTbody = document.getElementById('disciplinaryTbody');
  const areaSelect = document.getElementById('statsAreaSelect');

  if (!scorersTbody) return;

  if (areaSelect) {
    areaSelect.innerHTML = `
      <option value="all">All Zones (Consolidated)</option>
      ${cachedAreas.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}
    `;
    areaSelect.addEventListener('change', renderStats);
  }

  function renderStats() {
    const areaFilter = areaSelect?.value || 'all';

    // Top Goal Scorers
    const sortedPlayers = [...cachedPlayers].sort((a, b) => (b.goals || 0) - (a.goals || 0));
    const filteredScorers = areaFilter === 'all'
      ? sortedPlayers
      : sortedPlayers.filter((p) => {
        const team = cachedTeams.find((t) => t.id === p.team_id);
        return team && team.area_id === areaFilter;
      });

    if (filteredScorers.length === 0) {
      scorersTbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-muted">No goal scorer records logged yet.</td></tr>`;
    } else {
      scorersTbody.innerHTML = filteredScorers.slice(0, 15).map((p, idx) => {
        const team = cachedTeams.find((t) => t.id === p.team_id);
        const area = team ? cachedAreas.find((a) => a.id === team.area_id)?.name : 'Zone';

        return `
          <tr>
            <td class="font-mono font-bold text-center">${idx + 1}</td>
            <td class="font-bold">${p.full_name}</td>
            <td>${team ? team.name : 'Club'}</td>
            <td><span class="badge text-2xs">${area || 'Zone'}</span></td>
            <td class="text-center font-mono">${p.appearances || 0}</td>
            <td class="text-center font-mono">${p.assists || 0}</td>
            <td class="text-center font-mono font-bold text-base">${p.goals || 0}</td>
          </tr>
        `;
      }).join('');
    }

    // Clean Sheets
    const goalkeepers = cachedPlayers.filter((p) => p.position === 'Goalkeeper' || p.clean_sheets > 0);
    goalkeepers.sort((a, b) => (b.clean_sheets || 0) - (a.clean_sheets || 0));

    if (cleanSheetsTbody) {
      if (goalkeepers.length === 0) {
        cleanSheetsTbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No goalkeeping clean sheets logged yet.</td></tr>`;
      } else {
        cleanSheetsTbody.innerHTML = goalkeepers.slice(0, 5).map((gk, idx) => {
          const team = cachedTeams.find((t) => t.id === gk.team_id)?.name || 'Club';
          return `
            <tr>
              <td class="font-mono font-bold text-center">${idx + 1}</td>
              <td class="font-bold">${gk.full_name}</td>
              <td>${team}</td>
              <td class="text-center font-mono font-bold">${gk.clean_sheets || 0}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Disciplinary
    const booked = cachedPlayers.filter((p) => (p.yellow_cards || 0) > 0 || (p.red_cards || 0) > 0);
    booked.sort((a, b) => ((b.red_cards || 0) * 2 + (b.yellow_cards || 0)) - ((a.red_cards || 0) * 2 + (a.yellow_cards || 0)));

    if (disciplinaryTbody) {
      if (booked.length === 0) {
        disciplinaryTbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No disciplinary infractions recorded.</td></tr>`;
      } else {
        disciplinaryTbody.innerHTML = booked.slice(0, 5).map((p) => {
          const team = cachedTeams.find((t) => t.id === p.team_id)?.name || 'Club';
          const isSuspended = (p.red_cards || 0) > 0 || (p.yellow_cards || 0) >= 2;
          return `
            <tr>
              <td class="font-bold">${p.full_name}</td>
              <td>${team}</td>
              <td class="text-center font-mono">${p.yellow_cards || 0}</td>
              <td class="text-center font-mono">${p.red_cards || 0}</td>
              <td>
                <span class="badge ${isSuspended ? 'badge-delayed' : 'badge-outline'} text-2xs">
                  ${isSuspended ? 'Suspended' : 'Clear'}
                </span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  renderStats();
}