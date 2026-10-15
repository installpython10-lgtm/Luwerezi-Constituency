/**
 * Mzimba Luwerezi Constituency — Resident Portal & Dashboard Module
 * Handles resident authentication tabs, private case history, and case detail modals.
 */

import { getSupabase, getCurrentUser, signInUser, signUpResident, signOutUser } from './supabase-client.js';

let cachedResidentReports = [];

/**
 * Initializes Authentication Page tabs, passwords, and forms on auth.html.
 */
export function initAuthPage() {
  const tabLogin = document.getElementById('tabLoginBtn');
  const tabRegister = document.getElementById('tabRegisterBtn');
  const tabRecovery = document.getElementById('tabRecoveryBtn');
  const panelLogin = document.getElementById('panelLogin');
  const panelRegister = document.getElementById('panelRegister');
  const panelRecovery = document.getElementById('panelRecovery');
  const alertBanner = document.getElementById('authAlertBanner');
  const forgotLink = document.getElementById('forgotPasswordLink');
  const backToLoginBtn = document.getElementById('backToLoginBtn');

  if (!panelLogin || !panelRegister) return;

  function switchTab(activeBtn, activePanel) {
    [tabLogin, tabRegister, tabRecovery].forEach((btn) => {
      btn?.classList.remove('active');
      btn?.setAttribute('aria-selected', 'false');
    });
    [panelLogin, panelRegister, panelRecovery].forEach((p) => {
      p?.setAttribute('hidden', '');
    });

    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-selected', 'true');
    activePanel.removeAttribute('hidden');
    if (alertBanner) alertBanner.style.display = 'none';
  }

  tabLogin?.addEventListener('click', () => switchTab(tabLogin, panelLogin));
  tabRegister?.addEventListener('click', () => switchTab(tabRegister, panelRegister));
  tabRecovery?.addEventListener('click', () => switchTab(tabRecovery, panelRecovery));
  forgotLink?.addEventListener('click', () => switchTab(tabRecovery, panelRecovery));
  backToLoginBtn?.addEventListener('click', () => switchTab(tabLogin, panelLogin));

  // Show/Hide Password toggles
  document.querySelectorAll('.toggle-password-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      }
    });
  });

  // Login Form Submission
  const loginForm = document.getElementById('residentLoginForm');
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertBanner) alertBanner.style.display = 'none';

    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;
    const submitBtn = document.getElementById('loginSubmitBtn');

    if (!email || !password) {
      showAuthError('Please enter both your email address and password.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }

    try {
      const { data, error } = await signInUser(email, password);
      if (error) throw error;

      if (data?.user) {
        window.location.href = 'resident-dashboard.html';
      }
    } catch (err) {
      console.warn('[Auth] Login error:', err);
      showAuthError(err.message || 'Invalid email or password. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In to Resident Dashboard';
      }
    }
  });

  // Registration Form Submission
  const registerForm = document.getElementById('residentRegisterForm');
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertBanner) alertBanner.style.display = 'none';

    const fullName = document.getElementById('regFullName')?.value?.trim();
    const email = document.getElementById('regEmail')?.value?.trim();
    const phone = document.getElementById('regPhone')?.value?.trim() || '';
    const password = document.getElementById('regPassword')?.value;
    const confirmPassword = document.getElementById('regConfirmPassword')?.value;
    const termsCheck = document.getElementById('regTermsCheck');
    const submitBtn = document.getElementById('registerSubmitBtn');

    if (!fullName || !email || !password || !confirmPassword) {
      showAuthError('All required registration fields must be completed.');
      return;
    }

    if (password.length < 8) {
      showAuthError('Password must contain at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      showAuthError('Passwords do not match. Please re-enter.');
      return;
    }

    if (termsCheck && !termsCheck.checked) {
      showAuthError('Please accept the Terms of Use and Privacy Policy.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Account...';
    }

    try {
      const { data, error } = await signUpResident(email, password, fullName, phone);
      if (error) throw error;

      if (alertBanner) {
        alertBanner.className = 'alert-box alert-success mb-4';
        alertBanner.innerHTML = `
          <strong>Registration Successful!</strong> Please check <code>${email}</code> for an email verification link to activate your resident account.
        `;
        alertBanner.style.display = 'block';
        registerForm.reset();
      }
    } catch (err) {
      console.warn('[Auth] Register error:', err);
      showAuthError(err.message || 'Unable to complete registration. Try another email.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register Resident Account';
      }
    }
  });

  // Password Recovery Form Submission
  const recoveryForm = document.getElementById('residentRecoveryForm');
  recoveryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('recoveryEmail')?.value?.trim();
    const submitBtn = document.getElementById('recoverySubmitBtn');

    if (!email) {
      showAuthError('Please enter your registered email address.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending link...';
    }

    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth.html?mode=reset`
      });
      if (error) throw error;

      if (alertBanner) {
        alertBanner.className = 'alert-box alert-success mb-4';
        alertBanner.innerHTML = `If an account exists for <code>${email}</code>, a secure reset link has been dispatched to your inbox.`;
        alertBanner.style.display = 'block';
      }
    } catch (err) {
      showAuthError('Error dispatching reset instructions. Try again later.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Password Reset Link';
      }
    }
  });

  function showAuthError(msg) {
    if (alertBanner) {
      alertBanner.className = 'alert-box alert-error mb-4';
      alertBanner.textContent = msg;
      alertBanner.style.display = 'block';
    }
  }
}

/**
 * Initializes Resident Dashboard on resident-dashboard.html.
 */
export async function initResidentDashboard() {
  const greetingEl = document.getElementById('residentGreeting');
  const emailSubEl = document.getElementById('residentEmailSub');
  const tbody = document.getElementById('myReportsTbody');
  const searchInput = document.getElementById('myReportsSearch');
  const signOutBtn = document.getElementById('residentSignOutBtn');
  const logoutNavBtn = document.getElementById('residentLogoutNavBtn');

  if (!tbody) return;

  // Session Authentication Check
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    window.location.href = 'auth.html';
    return;
  }

  // Personalization
  const residentName = currentUser.user_metadata?.full_name || 'Resident';
  if (greetingEl) greetingEl.textContent = `Welcome, ${residentName}`;
  if (emailSubEl) emailSubEl.textContent = `Active Session: ${currentUser.email}`;

  // Sign out bindings
  const handleLogout = async () => {
    await signOutUser();
    window.location.href = 'index.html';
  };
  signOutBtn?.addEventListener('click', handleLogout);
  logoutNavBtn?.addEventListener('click', handleLogout);

  // Fetch private user reports (enforced via Supabase RLS)
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('community_reports')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      cachedResidentReports = data;
    }
  } catch (err) {
    console.warn('[Resident] Error fetching user cases:', err);
  }

  updateMetrics(cachedResidentReports);
  renderResidentTable(cachedResidentReports, tbody);

  // Search filter
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    const filtered = cachedResidentReports.filter((r) =>
      r.reference_number.toLowerCase().includes(q) ||
      (r.title || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q) ||
      (r.village || '').toLowerCase().includes(q)
    );
    renderResidentTable(filtered, tbody);
  });

  initCaseModalEvents();
}

/**
 * Updates summary count metrics.
 */
function updateMetrics(reports) {
  const totalEl = document.getElementById('statMyTotalReports');
  const reviewEl = document.getElementById('statMyPendingReports');
  const inProgressEl = document.getElementById('statMyInProgressReports');
  const resolvedEl = document.getElementById('statMyResolvedReports');

  if (totalEl) totalEl.textContent = reports.length.toString();
  if (reviewEl) reviewEl.textContent = reports.filter((r) => r.status === 'Submitted' || r.status === 'Under Review').length.toString();
  if (inProgressEl) inProgressEl.textContent = reports.filter((r) => r.status === 'Assigned' || r.status === 'In Progress' || r.status === 'Referred').length.toString();
  if (resolvedEl) resolvedEl.textContent = reports.filter((r) => r.status === 'Resolved').length.toString();
}

/**
 * Renders resident cases table.
 */
function renderResidentTable(reports, tbody) {
  if (reports.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-muted">
          You have not submitted any community reports under this account yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = reports.map((r) => `
    <tr>
      <td class="font-mono font-bold">${r.reference_number}</td>
      <td class="text-muted">${r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent'}</td>
      <td><span class="badge text-2xs">${r.category || 'General'}</span></td>
      <td class="font-bold">${r.title || 'Report'}</td>
      <td class="text-muted">${r.village || ''}, ${r.ward || ''}</td>
      <td><span class="badge badge-accent text-2xs">${r.status || 'Submitted'}</span></td>
      <td class="text-right">
        <button type="button" class="btn btn-outline btn-xs btn-inspect-case" data-ref="${r.reference_number}">
          View Log
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-inspect-case').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ref = btn.getAttribute('data-ref');
      openCaseModal(ref);
    });
  });
}

/**
 * Case details inspection modal
 */
function openCaseModal(ref) {
  const report = cachedResidentReports.find((r) => r.reference_number === ref);
  const modal = document.getElementById('caseDetailModal');
  if (!modal || !report) return;

  document.getElementById('modalCaseRef').textContent = `REF: ${report.reference_number}`;
  document.getElementById('caseModalTitle').textContent = report.title || 'Case Review';
  document.getElementById('modalCaseCategory').textContent = report.category || 'General';
  document.getElementById('modalCaseStatusBadge').textContent = report.status || 'Active';
  document.getElementById('modalCaseDate').textContent = report.created_at ? new Date(report.created_at).toLocaleDateString() : '';
  document.getElementById('modalCaseLocation').textContent = `${report.village || ''}, ${report.ward || 'Luwerezi'}`;
  document.getElementById('modalCaseDesc').textContent = report.description || 'No description provided.';

  const timelineContainer = document.getElementById('modalCaseTimeline');
  if (timelineContainer) {
    const history = Array.isArray(report.status_history) && report.status_history.length > 0
      ? report.status_history
      : [{ status: report.status, timestamp: report.created_at, notes: 'Case logged into registry.' }];

    timelineContainer.innerHTML = history.map((item) => `
      <li class="timeline-item">
        <span class="timeline-date">${item.timestamp ? new Date(item.timestamp).toLocaleDateString() : ''}</span>
        <strong>${item.status}</strong>
        <p class="text-xs text-muted">${item.notes || ''}</p>
      </li>
    `).join('');
  }

  modal.removeAttribute('hidden');
}

function initCaseModalEvents() {
  const modal = document.getElementById('caseDetailModal');
  const closeBtn = document.getElementById('closeCaseModalBtn');
  const closeBtm = document.getElementById('closeCaseModalBottomBtn');

  const close = () => modal?.setAttribute('hidden', '');
  closeBtn?.addEventListener('click', close);
  closeBtm?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
}