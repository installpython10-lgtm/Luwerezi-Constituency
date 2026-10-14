/**
 * Mzimba South Luwerezi Constituency — Main Application Orchestrator
 * Bootstraps i18n, navigation, responsive menus, page controllers, PWA service worker, and developer credit.
 */

import { initI18n } from './modules/i18n.js';
import { initDeveloperBadge } from './modules/developer-credit.js';
import { initAdminShortcut } from './modules/admin-shortcut.js';
import {
  getCurrentUser,
  loadSupabaseConfig,
  isSupabaseConfigured,
  SUPABASE_UNAVAILABLE_MESSAGE
} from './modules/supabase-client.js';

// Page-specific modules
import { initReportSubmission, initReportTracking, initSafeguardingIntake } from './modules/reporting.js';
import { initHomeProjects, initProjectsPage, initProjectDetail, initVerificationPage } from './modules/projects.js';
import {
  initSportsHub,
  initSportsTables,
  initSportsFixtures,
  initSportsLive,
  initSportsTeams,
  initSportsStats
} from './modules/sports.js';
import { initAuthPage, initResidentDashboard } from './modules/resident.js';
import { initAdminConsole } from './modules/admin.js';

document.addEventListener('DOMContentLoaded', async () => {
  const pageId = document.body.dataset.page;
  initAdminShortcut();
  if (pageId === 'admin') initAdminConsole();

  await loadSupabaseConfig();

  // 1. Initialize core infrastructure
  initI18n();
  initDeveloperBadge();
  initMobileNav();
  updateDynamicFooterYear();
  checkAuthNavigationState();

  // 2. Dispatch page-specific controller based on body data-page
  showBackendUnavailableNotice(pageId);

  switch (pageId) {
    case 'home':
      initHomeProjects();
      break;
    case 'projects':
      initProjectsPage();
      break;
    case 'project-detail':
      initProjectDetail();
      break;
    case 'verification':
      initVerificationPage();
      break;
    case 'report-issue':
      initReportSubmission();
      break;
    case 'track-report':
      initReportTracking();
      break;
    case 'safeguarding':
      initSafeguardingIntake();
      break;
    case 'sports':
      initSportsHub();
      break;
    case 'sports-tables':
      initSportsTables();
      break;
    case 'sports-fixtures':
      initSportsFixtures();
      break;
    case 'sports-live':
      initSportsLive();
      break;
    case 'sports-teams':
      initSportsTeams();
      break;
    case 'sports-stats':
      initSportsStats();
      break;
    case 'auth':
      initAuthPage();
      break;
    case 'resident-dashboard':
      initResidentDashboard();
      break;
    case 'admin':
      break;
    case 'contact':
      initContactForm();
      break;
    default:
      // Static informational pages (about, privacy, terms, news)
      break;
  }

  // 3. Register Progressive Web App Service Worker
  registerPwaServiceWorker();
});

/**
 * Explains why database-backed forms and sports data are unavailable without Supabase.
 */
function showBackendUnavailableNotice(pageId) {
  const databasePages = new Set([
    'report-issue',
    'track-report',
    'safeguarding',
    'sports',
    'sports-tables',
    'sports-fixtures',
    'sports-live',
    'sports-teams',
    'sports-stats',
    'auth',
    'resident-dashboard'
  ]);

  if (isSupabaseConfigured() || !databasePages.has(pageId)) return;

  const main = document.querySelector('main');
  if (!main) return;

  const notice = document.createElement('div');
  notice.className = 'container alert-box alert-error mt-4';
  notice.setAttribute('role', 'status');
  notice.textContent = SUPABASE_UNAVAILABLE_MESSAGE;
  main.prepend(notice);
}

/**
 * Sets up mobile navigation drawer toggle.
 */
function initMobileNav() {
  const toggleBtn = document.getElementById('mobileNavToggle');
  const nav = document.getElementById('primaryNavigation');

  if (!toggleBtn || !nav) return;

  toggleBtn.addEventListener('click', () => {
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
    nav.classList.toggle('open');
  });

  // Close nav on click outside on small screens
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target) && !toggleBtn.contains(e.target)) {
      nav.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

/**
 * Synchronizes current year in footer copyright notices.
 */
function updateDynamicFooterYear() {
  const yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear().toString();
  }
}

/**
 * Checks session state to update header Resident Login/Dashboard button.
 */
async function checkAuthNavigationState() {
  const authBtn = document.getElementById('authNavBtn');
  if (!authBtn) return;

  try {
    const user = await getCurrentUser();
    if (user) {
      authBtn.href = 'resident-dashboard.html';
      authBtn.textContent = 'Dashboard';
      authBtn.setAttribute('data-i18n', 'nav_resident_dashboard');
    }
  } catch (err) {
    // Non-blocking
  }
}

/**
 * Handles General Inquiry Form on contact.html.
 */
function initContactForm() {
  const form = document.getElementById('generalContactForm');
  const successBox = document.getElementById('contactFormSuccess');
  const submitBtn = document.getElementById('sendContactBtn');

  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Routing Message...';
    }

    setTimeout(() => {
      form.reset();
      if (successBox) successBox.style.display = 'block';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Administrative Message';
      }
    }, 600);
  });
}

/**
 * Registers PWA Service Worker for offline resilience and fast caching.
 */
function registerPwaServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      const serviceWorkerUrl = new URL('../sw.js', import.meta.url);
      navigator.serviceWorker.register(serviceWorkerUrl)
        .then((reg) => {
          console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] ServiceWorker registration bypassed:', err);
        });
    });
  }
}