/**
 * Mzimba South Luwerezi Constituency — Projects & Oversight Module
 * Handles project register querying, search filters, detail inspection, and oversight field logs.
 */

import { getSupabase, isSupabaseConfigured, SUPABASE_UNAVAILABLE_MESSAGE } from './supabase-client.js';

let cachedProjects = [];
let projectsUnavailable = false;

/**
 * Loads projects from Supabase development_projects table.
 * @returns {Promise<Array>}
 */
export async function fetchProjects() {
  if (!isSupabaseConfigured()) {
    projectsUnavailable = true;
    return cachedProjects;
  }

  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('development_projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      projectsUnavailable = true;
      console.warn('[Projects] Error fetching projects from database:', error);
    } else if (Array.isArray(data)) {
      projectsUnavailable = false;
      cachedProjects = data;
      return cachedProjects;
    }
  } catch (err) {
    projectsUnavailable = true;
    console.warn('[Projects] Error fetching projects from database:', err);
  }
  return cachedProjects;
}

/**
 * Initializes Projects Register page (projects.html).
 */
export async function initProjectsPage() {
  const container = document.getElementById('projectsGridContainer');
  const countLabel = document.getElementById('projectsResultCount');
  const filterForm = document.getElementById('projectsFilterForm');
  const searchInput = document.getElementById('projectSearchInput');
  const categorySelect = document.getElementById('projectCategorySelect');
  const statusSelect = document.getElementById('projectStatusSelect');
  const verificationSelect = document.getElementById('projectVerificationSelect');

  if (!container) return;

  const projects = await fetchProjects();
  renderProjectsList(projects, container, countLabel);

  function applyFilters() {
    const query = searchInput?.value?.toLowerCase().trim() || '';
    const selectedCat = categorySelect?.value || 'all';
    const selectedStatus = statusSelect?.value || 'all';
    const selectedVerif = verificationSelect?.value || 'all';

    const filtered = cachedProjects.filter((p) => {
      const matchQuery = !query ||
        p.name?.toLowerCase().includes(query) ||
        p.project_id?.toLowerCase().includes(query) ||
        p.location?.toLowerCase().includes(query);

      const matchCat = selectedCat === 'all' || p.category === selectedCat;
      const matchStatus = selectedStatus === 'all' || p.status === selectedStatus;

      let matchVerif = true;
      if (selectedVerif === 'verified') matchVerif = p.verification_status === 'verified';
      if (selectedVerif === 'pending') matchVerif = p.verification_status === 'unverified';
      if (selectedVerif === 'unconfirmed') matchVerif = p.verification_status === 'unconfirmed';

      return matchQuery && matchCat && matchStatus && matchVerif;
    });

    renderProjectsList(filtered, container, countLabel);
  }

  if (filterForm) {
    searchInput?.addEventListener('input', applyFilters);
    categorySelect?.addEventListener('change', applyFilters);
    statusSelect?.addEventListener('change', applyFilters);
    verificationSelect?.addEventListener('change', applyFilters);
    filterForm.addEventListener('reset', () => {
      setTimeout(() => renderProjectsList(cachedProjects, container, countLabel), 50);
    });
  }
}

/**
 * Renders list of project row cards into container.
 * @param {Array} projects 
 * @param {HTMLElement} container 
 * @param {HTMLElement} [countLabel] 
 */
function renderProjectsList(projects, container, countLabel) {
  if (projectsUnavailable) {
    if (countLabel) countLabel.textContent = 'Unavailable';
    container.innerHTML = `
      <div class="alert-box alert-error" role="status">
        ${isSupabaseConfigured()
          ? 'The project register is temporarily unavailable. Please try again later.'
          : SUPABASE_UNAVAILABLE_MESSAGE}
      </div>
    `;
    return;
  }

  if (countLabel) {
    countLabel.textContent = `Showing ${projects.length} documented projects`;
  }

  if (!projects || projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <p class="empty-state-title">No documented projects found matching filters</p>
        <p class="empty-state-subtitle">Adjust your search term or category filters.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = projects.map((p) => {
    const statusBadgeClass = `badge-${p.status ? p.status.toLowerCase().replace(/\s+/g, '-') : 'proposed'}`;
    const formattedBudget = p.budget ? `MWK ${Number(p.budget).toLocaleString()}` : 'Record Pending';
    const verifLabel = p.verification_status === 'verified'
      ? 'Independently Verified'
      : (p.verification_status === 'unconfirmed' ? 'Unable to Confirm' : 'Awaiting Inspection');

    return `
      <article class="project-card-row">
        <div class="project-row-main">
          <div class="flex items-center gap-2">
            <span class="badge badge-mono text-2xs">${p.project_id || 'PROJ'}</span>
            <span class="badge text-2xs">${p.category || 'General'}</span>
            <span class="badge ${statusBadgeClass} text-2xs">${p.status || 'In Progress'}</span>
          </div>
          <h2 class="project-row-title">
            <a href="project-detail.html?id=${p.id || p.project_id}">${p.name}</a>
          </h2>
          <p class="project-row-location">
            <span aria-hidden="true">📍</span> ${p.location || 'Luwerezi Constituency'}
          </p>
        </div>

        <div class="project-row-finance">
          <div>
            <span class="text-muted block text-2xs uppercase">Budget:</span>
            <strong class="font-mono text-xs">${formattedBudget}</strong>
          </div>
          <div>
            <span class="text-muted block text-2xs uppercase">Oversight:</span>
            <span class="text-xs ${p.verification_status === 'verified' ? 'font-bold' : ''}">${verifLabel}</span>
          </div>
        </div>

        <div>
          <a href="project-detail.html?id=${p.id || p.project_id}" class="btn btn-outline btn-xs">
            Inspect Project &rarr;
          </a>
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Initializes Homepage Recent Projects Preview (index.html).
 */
export async function initHomeProjects() {
  const container = document.getElementById('homeProjectsContainer');
  const countEl = document.getElementById('verifiedProjectsCount');
  if (!container) return;

  const projects = await fetchProjects();

  if (countEl) {
    countEl.textContent = projectsUnavailable ? '—' : projects.length.toString();
  }

  const preview = projects.slice(0, 3);
  renderProjectsList(preview, container);
}

/**
 * Initializes Single Project Detail Page (project-detail.html).
 */
export async function initProjectDetail() {
  const container = document.getElementById('projectDetailContent');
  const loader = document.getElementById('projectDetailLoader');
  if (!container) return;

  if (!isSupabaseConfigured()) {
    if (loader) {
      loader.innerHTML = `<div class="alert-box alert-error" role="status">${SUPABASE_UNAVAILABLE_MESSAGE}</div>`;
    }
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const projectIdParam = urlParams.get('id');

  if (!projectIdParam) {
    if (loader) {
      loader.innerHTML = `
        <div class="alert-box alert-error">
          No project ID specified. Return to the <a href="projects.html" class="underline">Projects Register</a>.
        </div>
      `;
    }
    return;
  }

  try {
    const sb = await getSupabase();
    const { data: project, error } = await sb
      .from('development_projects')
      .select('*')
      .or(`id.eq.${projectIdParam},project_id.eq.${projectIdParam}`)
      .maybeSingle();

    if (error || !project) {
      if (loader) {
        loader.innerHTML = `
          <div class="alert-box alert-error">
            Project record not found. It may have been archived or pending registration.
          </div>
        `;
      }
      return;
    }

    // Populate Detail View Fields
    if (loader) loader.style.display = 'none';
    container.style.display = 'grid';

    document.getElementById('pjIdBadge').textContent = project.project_id || 'ID: --';
    document.getElementById('pjCategoryBadge').textContent = project.category || 'Infrastructure';
    document.getElementById('pjStatusBadge').textContent = project.status || 'Active';
    document.getElementById('pjTitle').textContent = project.name;
    document.getElementById('pjLocationText').textContent = project.location || 'Mzimba South Luwerezi';
    document.getElementById('projectBreadcrumbTitle').textContent = project.name;

    // Verification Box
    const verifTitle = document.getElementById('pjVerifTitle');
    const verifDetails = document.getElementById('pjVerifDetails');
    const verifSource = document.getElementById('pjVerifSource');
    const verifDate = document.getElementById('pjVerifDate');
    const verifBox = document.getElementById('pjVerificationBox');

    if (project.verification_status === 'verified') {
      verifTitle.textContent = 'Independently Verified by Oversight Committee';
      verifDetails.textContent = project.verification_notes || 'Physical inspection confirmed functional facility matching approved specifications.';
      verifSource.textContent = project.verification_source || 'Luwerezi Community Oversight Team';
      verifDate.textContent = project.verification_date || 'Documented';
      verifBox.className = 'verification-callout-card border-2';
    } else if (project.verification_status === 'unconfirmed') {
      verifTitle.textContent = 'Unable to Confirm (Documentation Pending)';
      verifDetails.textContent = project.verification_notes || 'Field documentation incomplete. Awaiting M\'mbelwa District Council audit records.';
      verifSource.textContent = 'Constituency Records Desk';
      verifDate.textContent = 'Pending Re-inspection';
    } else {
      verifTitle.textContent = 'Awaiting Independent Field Inspection';
      verifDetails.textContent = 'Project declared by contractor; field verification inspection scheduled.';
      verifSource.textContent = 'Contractor Notice';
      verifDate.textContent = 'Scheduled';
    }

    // Scope & Description
    document.getElementById('pjDescription').innerHTML = `<p>${project.description || 'Scope details documented in constituency development plan.'}</p>`;

    // Delays
    const delayBox = document.getElementById('pjDelayBox');
    if (project.delay_reason && delayBox) {
      document.getElementById('pjDelayReason').textContent = project.delay_reason;
      delayBox.style.display = 'block';
    }

    // Evidence Gallery
    const gallery = document.getElementById('pjEvidenceGallery');
    if (gallery) {
      const photos = Array.isArray(project.photos) && project.photos.length > 0
        ? project.photos
        : ['assets/images/logo.png'];

      gallery.innerHTML = photos.map((imgUrl, i) => `
        <div class="evidence-thumb-card">
          <img src="${imgUrl}" alt="Ground verification proof #${i + 1}" class="evidence-thumb-img" loading="lazy">
          <span class="evidence-caption">Inspection Benchmark Proof #${i + 1}</span>
        </div>
      `).join('');
    }

    // Financials
    document.getElementById('pjFundingSource').textContent = project.funding_source || 'Constituency Development Fund (CDF)';
    document.getElementById('pjApprovedBudget').textContent = project.budget ? `MWK ${Number(project.budget).toLocaleString()}` : 'Record Pending';
    document.getElementById('pjExpenditure').textContent = project.expenditure ? `MWK ${Number(project.expenditure).toLocaleString()}` : 'Record Pending';
    document.getElementById('pjImplementer').textContent = project.implementing_agency || 'District Council Contractor Desk';
    document.getElementById('pjStartDate').textContent = project.start_date || 'Documented in Plan';
    document.getElementById('pjTargetDate').textContent = project.target_date || 'Target Ongoing';

    // Link report
    const reportLink = document.getElementById('pjReportLink');
    if (reportLink) {
      reportLink.href = `report-issue.html?project=${encodeURIComponent(project.project_id || project.name)}`;
    }
  } catch (err) {
    console.error('[ProjectDetail] Error loading detail:', err);
    if (loader) {
      loader.innerHTML = `
        <div class="alert-box alert-error" role="status">
          The project record is temporarily unavailable. Please try again later.
        </div>
      `;
    }
  }
}

/**
 * Initializes Independent Oversight Logs on verification.html.
 */
export async function initVerificationPage() {
  const container = document.getElementById('oversightLogsContainer');
  if (!container) return;

  const projects = await fetchProjects();
  const verifiedProjects = projects.filter((p) => p.verification_status === 'verified' || p.verification_status === 'unconfirmed');

  if (projectsUnavailable) {
    container.innerHTML = `
      <div class="alert-box alert-error" role="status">
        ${isSupabaseConfigured()
          ? 'Oversight logs are temporarily unavailable. Please try again later.'
          : SUPABASE_UNAVAILABLE_MESSAGE}
      </div>
    `;
    return;
  }

  if (verifiedProjects.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <p class="empty-state-title">No field verification logs currently published</p>
        <p class="empty-state-subtitle">Inspection audits are uploaded after community committee sign-offs.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = verifiedProjects.map((p) => `
    <article class="card p-5 border mb-3">
      <div class="flex justify-between items-start flex-wrap gap-2 mb-2">
        <div>
          <span class="badge badge-mono text-2xs">${p.project_id || 'AUDIT'}</span>
          <h3 class="text-base font-bold mt-1">${p.name}</h3>
          <p class="text-xs text-muted">Location: ${p.location || 'Luwerezi'}</p>
        </div>
        <div>
          <span class="badge ${p.verification_status === 'verified' ? 'badge-verified' : 'badge-unconfirmed'}">
            ${p.verification_status === 'verified' ? 'Verified by Committee' : 'Unable to Confirm'}
          </span>
        </div>
      </div>
      <p class="text-xs text-secondary mb-3">${p.verification_notes || 'Ground benchmark assessment completed.'}</p>
      <div class="flex justify-between items-center text-2xs text-muted border-t pt-2">
        <span>Auditor: ${p.verification_source || 'Community Oversight Committee'}</span>
        <a href="project-detail.html?id=${p.id || p.project_id}" class="underline font-bold text-black">
          View Evidence &rarr;
        </a>
      </div>
    </article>
  `).join('');
}