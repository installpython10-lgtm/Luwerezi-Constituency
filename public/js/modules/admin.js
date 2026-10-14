/**
 * Mzimba South Luwerezi Constituency — Superadmin Console Module
 * Protected administrative operations: project records, case triage, sports matchdesk, and audit logs.
 */

import {
  getSupabase,
  DESIGNATED_SUPERADMIN_ID,
  getSafeAuthErrorDetails,
  signInUser,
  signOutUser,
  getCurrentUser,
  getCurrentMfaAssuranceLevel,
  getCurrentTotpFactors,
  beginTotpEnrollment,
  restartTotpEnrollment,
  verifyTotpEnrollment,
  verifySuperadminMfa,
  loadSupabaseConfig,
  isSuperadmin,
  isSupabaseConfigured,
  SUPABASE_UNAVAILABLE_MESSAGE
} from './supabase-client.js';

let adminProjects = [];
let adminReports = [];
let adminSafeguards = [];
let adminMatches = [];
let adminAuditLogs = [];
let loginInProgress = false;
let adminConsoleInitialized = false;
let pendingTotpFactorId = null;
let mfaVerificationInProgress = false;
let enrollmentVerificationInProgress = false;
let enrollmentStartInProgress = false;

/**
 * Initializes Superadmin Console on admin.html.
 */
export async function initAdminConsole() {
  if (adminConsoleInitialized) return;
  adminConsoleInitialized = true;

  const loginSection = document.getElementById('adminLoginSection');
  const consoleSection = document.getElementById('adminConsoleSection');
  const mfaDiagnostics = document.getElementById('adminMfaDiagnostics');
  const mfaDiagnosticsAccount = document.getElementById('adminMfaDiagnosticsAccount');
  const mfaDiagnosticsStatus = document.getElementById('adminMfaDiagnosticsStatus');
  const mfaDiagnosticsFactors = document.getElementById('adminMfaDiagnosticsFactors');
  const sessionMeta = document.getElementById('adminUserSessionMeta');
  const sessionEmail = document.getElementById('adminSessionEmail');
  const logoutBtn = document.getElementById('adminLogoutTopBtn');
  const loginForm = document.getElementById('superadminLoginForm');
  const passwordToggle = document.getElementById('adminPasswordToggle');
  const enrollmentForm = document.getElementById('adminTotpEnrollmentForm');
  const challengeForm = document.getElementById('adminTotpChallengeForm');
  const restartEnrollmentButton = document.getElementById('adminTotpRestart');

  if (!loginSection || !consoleSection) return;

  passwordToggle?.addEventListener('click', () => {
    const passwordInput = document.getElementById('adminPassword');
    if (!passwordInput) return;
    const passwordIsVisible = passwordInput.type === 'text';
    passwordInput.type = passwordIsVisible ? 'password' : 'text';
    passwordToggle.textContent = passwordIsVisible ? 'Show' : 'Hide';
    passwordToggle.setAttribute('aria-label', passwordIsVisible ? 'Show password' : 'Hide password');
    passwordToggle.setAttribute('aria-pressed', String(!passwordIsVisible));
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginInProgress) return;
    const email = document.getElementById('adminEmail')?.value?.trim();
    const password = document.getElementById('adminPassword')?.value;
    const submitBtn = document.getElementById('adminLoginSubmitBtn');

    loginInProgress = true;
    if (submitBtn) submitBtn.disabled = true;
    clearLoginAlert();

    try {
      let user = await getCurrentUser();
      if (user && user.id !== DESIGNATED_SUPERADMIN_ID) {
        if (!email || !password) {
          showLoginAlert('Please enter both administrator email and password to switch accounts.', 'error');
          return;
        }
        await signOutUser();
        user = null;
      }

      if (!user) {
        if (!email || !password) {
          showLoginAlert('Please enter both administrator email and password.', 'error');
          return;
        }
        const { data, error } = await signInUser(email, password, 'admin.html login form');
        if (error) throw error;
        if (!data?.user || !data.session?.user?.id) {
          resetToPasswordLogin('Supabase accepted the request but did not establish a session. Please sign in again.');
          return;
        }
        if (data.session.user.id !== data.user.id) {
          resetToPasswordLogin('The user returned by Supabase does not match the signed-in session. Please sign in again.');
          return;
        }
        let signedInUser;
        try {
          signedInUser = await getCurrentUser();
        } catch (sessionError) {
          resetToPasswordLogin(`Supabase could not confirm the new session: ${describeAuthError(sessionError)}`);
          return;
        }
        if (!signedInUser || signedInUser.id !== data.session.user.id) {
          resetToPasswordLogin('Supabase has no confirmed session for the signed-in account. Please sign in again.');
          return;
        }
        user = signedInUser;
      }

      await completeSuperadminLogin(user);
    } catch (err) {
      console.warn('[AdminAuth] Login flow failed:', {
        handler: 'admin.html login form',
        ...getSafeAuthErrorDetails(err)
      });
      if (isMissingAuthSession(err)) {
        resetToPasswordLogin('No active Supabase session is available. Enter your email and password to sign in.');
        return;
      }
      const message = err?.code === 'invalid_credentials' ||
        err?.message === 'Invalid login credentials'
        ? 'Invalid email or password.'
        : (typeof err?.message === 'string' && err.message) ||
          'Authentication failed. Please try again.';
      showLoginAlert(message, 'error');
    } finally {
      loginInProgress = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  enrollmentForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (enrollmentVerificationInProgress || !pendingTotpFactorId) return;
    const code = document.getElementById('adminTotpEnrollmentCode')?.value?.trim() || '';
    const submitButton = document.getElementById('adminTotpEnrollmentSubmit');
    enrollmentVerificationInProgress = true;
    if (submitButton) submitButton.disabled = true;
    clearLoginAlert();

    try {
      await verifyTotpEnrollment(pendingTotpFactorId, code);
      pendingTotpFactorId = null;
      await completeSuperadminLogin(await requireCurrentSuperadminUser());
    } catch (error) {
      console.warn('[AdminAuth] Authenticator enrollment verification failed:', getSafeAuthErrorDetails(error));
      showLoginAlert(error.message || 'Authenticator verification failed. Check the code and try again.', 'error');
    } finally {
      enrollmentVerificationInProgress = false;
      if (submitButton) submitButton.disabled = false;
    }
  });

  challengeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (mfaVerificationInProgress) return;
    const code = document.getElementById('adminTotpCode')?.value?.trim() || '';
    const submitButton = document.getElementById('adminTotpChallengeSubmit');
    mfaVerificationInProgress = true;
    if (submitButton) submitButton.disabled = true;
    clearLoginAlert();

    try {
      await verifySuperadminMfa(code);
      await completeSuperadminLogin(await requireCurrentSuperadminUser());
    } catch (error) {
      console.warn('[AdminAuth] Authenticator challenge failed:', getSafeAuthErrorDetails(error));
      showLoginAlert(error.message || 'Authenticator verification failed. Check the code and try again.', 'error');
    } finally {
      mfaVerificationInProgress = false;
      if (submitButton) submitButton.disabled = false;
    }
  });

  restartEnrollmentButton?.addEventListener('click', async () => {
    if (!pendingTotpFactorId || enrollmentStartInProgress) return;
    restartEnrollmentButton.disabled = true;
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.id !== DESIGNATED_SUPERADMIN_ID) {
        throw new Error('The signed-in Superadmin account could not be confirmed. Sign in again before restarting authenticator setup.');
      }
      const accountLabel = currentUser.email
        ? `${currentUser.email} (UID: ${currentUser.id})`
        : `UID: ${currentUser.id}`;
      const confirmed = window.confirm(
        `Signed-in account: ${accountLabel}\n\nRemove only this unfinished authenticator (factor ${pendingTotpFactorId}) and create a new setup key? This cannot be undone.`
      );
      if (!confirmed) return;

      const setupPanel = document.getElementById('adminTotpEnrollment');
      const qrCode = document.getElementById('adminTotpQrCode');
      const manualSecret = document.getElementById('adminTotpSecret');
      if (!setupPanel || !qrCode || !manualSecret) {
        throw new Error('Authenticator setup interface is unavailable.');
      }
      setupPanel.hidden = true;
      qrCode.removeAttribute('src');
      qrCode.hidden = true;
      manualSecret.textContent = '';
      await startTotpEnrollment(pendingTotpFactorId);
    } catch (error) {
      console.warn('[AdminAuth] Authenticator setup restart failed:', getSafeAuthErrorDetails(error));
      showLoginAlert(error.message || 'Authenticator setup could not be restarted.', 'error');
    } finally {
      restartEnrollmentButton.disabled = false;
    }
  });

  // Logout Handler
  logoutBtn?.addEventListener('click', async () => {
    await logAuditAction('SUPERADMIN_LOGOUT', 'auth_session', 'self', 'User signed out');
    await signOutUser();
    window.location.reload();
  });

  await loadSupabaseConfig();

  try {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      await completeSuperadminLogin(currentUser);
    }
  } catch (error) {
    if (isMissingAuthSession(error)) {
      resetToPasswordLogin('The Supabase session is missing or expired. Enter your email and password to sign in again.');
    } else {
      showLoginAlert(error.message || 'This account cannot access the Superadmin console.', 'error');
    }
  }

  if (!isSupabaseConfigured()) {
    showLoginAlert(SUPABASE_UNAVAILABLE_MESSAGE, 'error');
  }

  async function completeSuperadminLogin(user) {
    let signedInUser;
    try {
      signedInUser = await getCurrentUser();
    } catch (error) {
      if (isMissingAuthSession(error)) {
        resetToPasswordLogin('The Supabase session is missing or expired. Enter your email and password to sign in again.');
        return;
      }
      showMfaDiagnosticsError('Supabase session lookup failed', error);
      throw error;
    }
    if (!signedInUser) {
      resetToPasswordLogin('No active Supabase session is available. Enter your email and password to sign in.');
      return;
    }
    if (user.id !== DESIGNATED_SUPERADMIN_ID ||
        signedInUser.id !== user.id) {
      await signOutUser();
      throw new Error('The active Supabase session does not match the designated Superadmin account. Sign in again before continuing.');
    }

    if (isLocalDevelopmentHost()) {
      let assuranceLevel;
      try {
        assuranceLevel = await getCurrentMfaAssuranceLevel();
      } catch (error) {
        showMfaDiagnosticsError('Supabase MFA/session check failed', error);
        throw error;
      }
      if (assuranceLevel !== 'aal2') {
        hideMfaForms();
        revealDashboard(signedInUser.email, true);
        return;
      }
    }

    const diagnostics = await refreshMfaDiagnostics(signedInUser);
    if (diagnostics.error) throw diagnostics.error;

    const { factors, assuranceLevel } = diagnostics;
    if (assuranceLevel !== 'aal2') {
      const verifiedFactor = factors.find((factor) => factor.status === 'verified');
      if (verifiedFactor) {
        showTotpChallenge();
        return;
      }
      await startTotpEnrollment();
      return;
    }

    hideMfaForms();
    if (!(await isSuperadmin())) {
      await signOutUser();
      throw new Error('Access denied: this account does not have the server-assigned Superadmin role.');
    }

    const refreshedUser = await getCurrentUser();
    if (!refreshedUser || refreshedUser.id !== user.id) {
      throw new Error('The authenticated account changed during authorization. Sign in again before continuing.');
    }
    await logAuditAction(
      'SUPERADMIN_LOGIN',
      'auth_session',
      refreshedUser.id,
      `Session authenticated from ${navigator.userAgent.slice(0, 40)}`
    );
    revealDashboard(refreshedUser.email);
  }

  function isLocalDevelopmentHost() {
    return ['localhost', '127.0.0.1', '::1'].includes(
      window.location.hostname.toLowerCase()
    );
  }

  async function refreshMfaDiagnostics(user) {
    if (!mfaDiagnostics || !mfaDiagnosticsAccount ||
        !mfaDiagnosticsStatus || !mfaDiagnosticsFactors) {
      return { factors: [], assuranceLevel: null, error: new Error('MFA diagnostics interface is unavailable.') };
    }

    mfaDiagnostics.hidden = false;
    mfaDiagnosticsAccount.textContent =
      `Signed-in account: ${user.email || '(email unavailable)'} | UID: ${user.id} | Configured Superadmin UID: ${DESIGNATED_SUPERADMIN_ID}`;
    mfaDiagnosticsFactors.replaceChildren();
    mfaDiagnosticsStatus.textContent = 'Retrieving TOTP factors and MFA assurance from Supabase...';

    let factors;
    try {
      factors = await getCurrentTotpFactors(user.id);
    } catch (error) {
      mfaDiagnosticsStatus.textContent = `Factor listing failed: ${describeAuthError(error)}`;
      return { factors: [], assuranceLevel: null, error };
    }

    if (factors.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = 'No TOTP factors returned for this signed-in account.';
      mfaDiagnosticsFactors.append(emptyItem);
    } else {
      factors.forEach((factor) => {
        const item = document.createElement('li');
        item.textContent = `${factor.friendly_name || '(no friendly name)'} | ${factor.status || 'unknown status'} | ID: ${factor.id}`;
        mfaDiagnosticsFactors.append(item);
      });
    }

    try {
      const assuranceLevel = await getCurrentMfaAssuranceLevel();
      mfaDiagnosticsStatus.textContent = `Factor list retrieved successfully. Current MFA assurance: ${assuranceLevel}.`;
      return { factors, assuranceLevel, error: null };
    } catch (error) {
      mfaDiagnosticsStatus.textContent = `MFA/session check failed: ${describeAuthError(error)}`;
      return { factors, assuranceLevel: null, error };
    }
  }

  function showMfaDiagnosticsError(context, error) {
    if (!mfaDiagnostics || !mfaDiagnosticsAccount ||
        !mfaDiagnosticsStatus || !mfaDiagnosticsFactors) return;
    mfaDiagnostics.hidden = false;
    mfaDiagnosticsAccount.textContent = 'Signed-in account identity could not be confirmed.';
    mfaDiagnosticsStatus.textContent = `${context}: ${describeAuthError(error)}`;
    mfaDiagnosticsFactors.replaceChildren();
  }

  function resetToPasswordLogin(message) {
    loginSection.hidden = false;
    loginForm.hidden = false;
    document.getElementById('adminTotpEnrollment').hidden = true;
    document.getElementById('adminTotpChallengeSection').hidden = true;
    if (mfaDiagnostics) mfaDiagnostics.hidden = true;
    clearTotpSetupDisplay();
    showLoginAlert(message, 'error');
    document.getElementById('adminEmail')?.focus();
  }

  function isMissingAuthSession(error) {
    const details = getSafeAuthErrorDetails(error);
    return details.name === 'AuthSessionMissingError' ||
      details.code === 'session_not_found' ||
      /auth session missing|session missing|no active session/i.test(details.message);
  }

  function describeAuthError(error) {
    const details = getSafeAuthErrorDetails(error);
    const status = details.status ? ` (HTTP ${details.status})` : '';
    const code = details.code ? ` [${details.code}]` : '';
    return `${details.message}${status}${code}`;
  }

  async function startTotpEnrollment(restartFactorId = null) {
    if (enrollmentStartInProgress) return;
    enrollmentStartInProgress = true;
    loginSection.hidden = false;
    const restartButton = document.getElementById('adminTotpRestart');
    if (restartButton) restartButton.disabled = true;

    try {
      const setup = restartFactorId
        ? await restartTotpEnrollment(restartFactorId)
        : await beginTotpEnrollment();
      if (setup.alreadyVerified) {
        pendingTotpFactorId = null;
        showTotpChallenge();
        return;
      }

      pendingTotpFactorId = setup.factorId;
      const setupPanel = document.getElementById('adminTotpEnrollment');
      const qrCode = document.getElementById('adminTotpQrCode');
      const manualSecret = document.getElementById('adminTotpSecret');
      if (!setupPanel || !qrCode || !manualSecret) {
        throw new Error('Authenticator setup interface is unavailable.');
      }

      const isRecovery = Boolean(setup.needsRecovery);
      qrCode.removeAttribute('src');
      qrCode.hidden = true;
      if (!isRecovery && setup.qrCode) {
        qrCode.src = setup.qrCode;
        qrCode.hidden = false;
      }
      const codeInput = document.getElementById('adminTotpEnrollmentCode');
      if (codeInput) codeInput.value = '';
      manualSecret.textContent = isRecovery
        ? 'A pending authenticator already exists. Its secret cannot be retrieved again. Use the authenticator app you originally scanned, or restart this unfinished setup to generate a new QR code and key.'
        : setup.secret;
      const restart = document.getElementById('adminTotpRestart');
      if (restart) restart.hidden = !isRecovery;
      const setupDescription = document.getElementById('adminTotpEnrollmentDescription');
      if (setupDescription) {
        setupDescription.textContent = isRecovery
          ? 'Enter the current six-digit code from the authenticator app used for the existing setup.'
          : 'Scan the QR code or enter the setup key in your authenticator app, then enter its current six-digit code.';
      }
      loginForm.hidden = true;
      document.getElementById('adminTotpChallengeSection').hidden = true;
      setupPanel.hidden = false;
      document.getElementById('adminTotpEnrollmentCode')?.focus();
      clearLoginAlert();
    } finally {
      enrollmentStartInProgress = false;
      if (restartButton) restartButton.disabled = false;
    }
  }

  function showTotpChallenge() {
    loginSection.hidden = false;
    loginForm.hidden = true;
    document.getElementById('adminTotpEnrollment').hidden = true;
    clearTotpSetupDisplay();
    document.getElementById('adminTotpChallengeSection').hidden = false;
    document.getElementById('adminTotpCode')?.focus();
    showLoginAlert('This account already has a verified authenticator. Enter its current code to continue.', 'success');
  }

  function hideMfaForms() {
    document.getElementById('adminTotpEnrollment').hidden = true;
    document.getElementById('adminTotpChallengeSection').hidden = true;
    clearTotpSetupDisplay();
  }

  function clearTotpSetupDisplay() {
    const qrCode = document.getElementById('adminTotpQrCode');
    qrCode?.removeAttribute('src');
    if (qrCode) qrCode.hidden = true;
    const manualSecret = document.getElementById('adminTotpSecret');
    if (manualSecret) manualSecret.textContent = '';
  }

  async function requireCurrentSuperadminUser() {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.id !== DESIGNATED_SUPERADMIN_ID) {
      throw new Error('The authenticated Superadmin session could not be verified.');
    }
    return currentUser;
  }

  function revealDashboard(email, previewOnly = false) {
    loginSection.hidden = true;
    consoleSection.style.display = 'block';
    if (sessionMeta) sessionMeta.style.display = 'inline-block';
    if (sessionEmail) sessionEmail.textContent = email;

    if (previewOnly) {
      const previewNotice = document.getElementById('adminLocalPreviewNotice');
      const tabs = consoleSection.querySelector('.admin-tabs-nav');
      if (!previewNotice || !tabs) {
        throw new Error('The local dashboard preview interface is unavailable.');
      }
      previewNotice.hidden = false;
      tabs.hidden = true;
      consoleSection.querySelectorAll('.admin-panel').forEach((panel) => {
        panel.hidden = true;
      });
      return;
    }

    initAdminTabs();
    loadAllAdminData();
  }

  function clearLoginAlert() {
    const alertBox = document.getElementById('adminAuthAlert');
    if (alertBox) {
      alertBox.textContent = '';
      alertBox.hidden = true;
      alertBox.style.display = 'none';
    }
  }

  function showLoginAlert(msg, type = 'error') {
    const alertBox = document.getElementById('adminAuthAlert');
    if (alertBox) {
      alertBox.className = `alert-box alert-${type} mb-4`;
      alertBox.textContent = msg;
      alertBox.hidden = false;
      alertBox.style.display = 'block';
    }
  }
}

/**
 * Initializes navigation tabs across admin panels.
 */
function initAdminTabs() {
  const tabs = [
    { btn: 'tabProjectsBtn', panel: 'adminProjectsPanel' },
    { btn: 'tabReportsBtn', panel: 'adminReportsPanel' },
    { btn: 'tabSafeguardingBtn', panel: 'adminSafeguardingPanel' },
    { btn: 'tabSportsAdminBtn', panel: 'adminSportsPanel' },
    { btn: 'tabBulletinsBtn', panel: 'adminBulletinsPanel' },
    { btn: 'tabAuditLogsBtn', panel: 'adminAuditPanel' }
  ];

  tabs.forEach(({ btn, panel }) => {
    const btnEl = document.getElementById(btn);
    const panelEl = document.getElementById(panel);

    btnEl?.addEventListener('click', () => {
      tabs.forEach((t) => {
        document.getElementById(t.btn)?.classList.remove('active');
        document.getElementById(t.btn)?.setAttribute('aria-selected', 'false');
        document.getElementById(t.panel)?.setAttribute('hidden', '');
      });

      btnEl.classList.add('active');
      btnEl.setAttribute('aria-selected', 'true');
      panelEl?.removeAttribute('hidden');
    });
  });
}

/**
 * Loads and renders all administrative data sets.
 */
async function loadAllAdminData() {
  await Promise.all([
    fetchAdminProjects(),
    fetchAdminReports(),
    fetchAdminSafeguards(),
    fetchAdminMatches(),
    fetchAdminAuditLogs()
  ]);

  initProjectManagement();
  initMatchdeskControls();
}

/**
 * Audit Logging Helper
 */
async function logAuditAction(actionType, entity, entityId, details) {
  try {
    const sb = await getSupabase();
    const currentUser = await getCurrentUser();
    await sb.from('admin_audit_logs').insert([{
      actor_email: currentUser?.email || 'admin',
      action_type: actionType,
      entity_type: entity,
      entity_id: String(entityId),
      details: details,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    console.warn('[Audit] Logging error:', err);
  }
}

/* ==========================================================================
   1. PROJECTS MANAGEMENT
   ========================================================================== */
async function fetchAdminProjects() {
  const tbody = document.getElementById('adminProjectsTbody');
  if (!tbody) return;

  try {
    const sb = await getSupabase();
    const { data } = await sb.from('development_projects').select('*').order('created_at', { ascending: false });
    adminProjects = data || [];

    tbody.innerHTML = adminProjects.map((p) => `
      <tr>
        <td class="font-mono font-bold">${p.project_id || 'PROJ'}</td>
        <td class="font-bold">${p.name}</td>
        <td>${p.location}</td>
        <td><span class="badge text-2xs">${p.category}</span></td>
        <td><span class="badge text-2xs">${p.status}</span></td>
        <td><span class="badge text-2xs">${p.verification_status}</span></td>
        <td class="font-mono">${p.budget ? `MWK ${Number(p.budget).toLocaleString()}` : '&mdash;'}</td>
        <td class="text-right">
          <button type="button" class="btn-admin-action btn-edit-p" data-id="${p.id}">Edit</button>
          <button type="button" class="btn-admin-action btn-admin-danger btn-del-p" data-id="${p.id}">Del</button>
        </td>
      </tr>
    `).join('');

    // Attach actions
    document.querySelectorAll('.btn-del-p').forEach((btn) => {
      btn.addEventListener('click', () => deleteProject(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.btn-edit-p').forEach((btn) => {
      btn.addEventListener('click', () => editProject(btn.getAttribute('data-id')));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Error loading projects.</td></tr>`;
  }
}

function initProjectManagement() {
  const toggleBtn = document.getElementById('btnAddNewProject');
  const closeBtn = document.getElementById('closeProjectFormBtn');
  const formBox = document.getElementById('projectFormContainer');
  const form = document.getElementById('adminProjectForm');

  toggleBtn?.addEventListener('click', () => {
    form?.reset();
    document.getElementById('editProjectId').value = '';
    document.getElementById('projectFormTitle').textContent = 'Record New Constituency Project';
    formBox.style.display = 'block';
  });

  closeBtn?.addEventListener('click', () => {
    formBox.style.display = 'none';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('editProjectId')?.value;
    const name = document.getElementById('pName')?.value?.trim();
    const category = document.getElementById('pCategory')?.value;
    const location = document.getElementById('pLocation')?.value?.trim();
    const funding = document.getElementById('pFunding')?.value?.trim();
    const budget = document.getElementById('pBudget')?.value || null;
    const expenditure = document.getElementById('pExpenditure')?.value || null;
    const implementer = document.getElementById('pImplementer')?.value?.trim() || null;
    const status = document.getElementById('pStatus')?.value;
    const verif = document.getElementById('pVerificationStatus')?.value;
    const desc = document.getElementById('pDescription')?.value?.trim() || null;

    if (!name || !category || !location || !funding) {
      alert('Please fill all mandatory project attributes.');
      return;
    }

    try {
      const sb = await getSupabase();
      const payload = {
        name,
        category,
        location,
        funding_source: funding,
        budget: budget ? Number(budget) : null,
        expenditure: expenditure ? Number(expenditure) : null,
        implementing_agency: implementer,
        status,
        verification_status: verif,
        description: desc
      };

      if (editId) {
        await sb.from('development_projects').update(payload).eq('id', editId);
        await logAuditAction('UPDATE_PROJECT', 'development_projects', editId, `Updated ${name}`);
      } else {
        payload.project_id = `LUW-PRJ-${Math.floor(100 + Math.random() * 900)}`;
        await sb.from('development_projects').insert([payload]);
        await logAuditAction('CREATE_PROJECT', 'development_projects', payload.project_id, `Created ${name}`);
      }

      formBox.style.display = 'none';
      fetchAdminProjects();
    } catch (err) {
      alert('Error saving project: ' + err.message);
    }
  });
}

function editProject(id) {
  const p = adminProjects.find((x) => String(x.id) === String(id));
  if (!p) return;

  document.getElementById('editProjectId').value = p.id;
  document.getElementById('pName').value = p.name || '';
  document.getElementById('pCategory').value = p.category || 'water';
  document.getElementById('pLocation').value = p.location || '';
  document.getElementById('pFunding').value = p.funding_source || '';
  document.getElementById('pBudget').value = p.budget || '';
  document.getElementById('pExpenditure').value = p.expenditure || '';
  document.getElementById('pImplementer').value = p.implementing_agency || '';
  document.getElementById('pStatus').value = p.status || 'In Progress';
  document.getElementById('pVerificationStatus').value = p.verification_status || 'unverified';
  document.getElementById('pDescription').value = p.description || '';

  document.getElementById('projectFormTitle').textContent = `Edit Project: ${p.project_id}`;
  document.getElementById('projectFormContainer').style.display = 'block';
}

async function deleteProject(id) {
  if (!confirm('Are you sure you want to permanently delete this project record? This action is logged.')) return;
  try {
    const sb = await getSupabase();
    await sb.from('development_projects').delete().eq('id', id);
    await logAuditAction('DELETE_PROJECT', 'development_projects', id, 'Deleted project record');
    fetchAdminProjects();
  } catch (err) {
    alert('Failed to delete project: ' + err.message);
  }
}

/* ==========================================================================
   2. COMMUNITY REPORTS CASE MANAGEMENT
   ========================================================================== */
async function fetchAdminReports() {
  const tbody = document.getElementById('adminReportsTbody');
  if (!tbody) return;

  try {
    const sb = await getSupabase();
    const { data } = await sb.from('community_reports').select('*').order('created_at', { ascending: false });
    adminReports = data || [];

    tbody.innerHTML = adminReports.map((r) => `
      <tr>
        <td class="font-mono font-bold">${r.reference_number}</td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</td>
        <td>${r.category}</td>
        <td>${r.village}, ${r.ward}</td>
        <td class="font-bold">${r.title}</td>
        <td><span class="badge text-2xs">${r.status}</span></td>
        <td class="text-right">
          <button type="button" class="btn-admin-action btn-triage-report" data-ref="${r.reference_number}">Triage</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-triage-report').forEach((btn) => {
      btn.addEventListener('click', () => triageReport(btn.getAttribute('data-ref')));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Error loading cases.</td></tr>`;
  }
}

async function triageReport(ref) {
  const report = adminReports.find((r) => r.reference_number === ref);
  if (!report) return;

  const nextStatus = prompt(`Update status for ${ref}:\n(Submitted, Under Review, Assigned, In Progress, Resolved)`, report.status);
  if (!nextStatus || nextStatus === report.status) return;

  const notes = prompt('Enter resolution or assignment notes for case history log:', 'Status updated by superadmin');

  try {
    const sb = await getSupabase();
    const updatedHistory = Array.isArray(report.status_history) ? [...report.status_history] : [];
    updatedHistory.push({
      status: nextStatus,
      timestamp: new Date().toISOString(),
      notes: notes || 'Administrative update.'
    });

    await sb.from('community_reports').update({
      status: nextStatus,
      status_history: updatedHistory
    }).eq('reference_number', ref);

    await logAuditAction('TRIAGE_REPORT', 'community_reports', ref, `Status updated to ${nextStatus}`);
    fetchAdminReports();
  } catch (err) {
    alert('Error updating case: ' + err.message);
  }
}

/* ==========================================================================
   3. SAFEGUARDING RESTRICTED INTAKE
   ========================================================================== */
async function fetchAdminSafeguards() {
  const tbody = document.getElementById('adminSafeguardTbody');
  if (!tbody) return;

  try {
    const sb = await getSupabase();
    const { data } = await sb.from('safeguarding_reports').select('*').order('created_at', { ascending: false });
    adminSafeguards = data || [];

    tbody.innerHTML = adminSafeguards.map((s) => `
      <tr>
        <td class="font-mono font-bold">${s.intake_key}</td>
        <td>${s.created_at ? new Date(s.created_at).toLocaleString() : ''}</td>
        <td><span class="safeguard-badge-priority">${s.concern_type}</span></td>
        <td>${s.location_approx}</td>
        <td><span class="badge text-2xs">${s.status}</span></td>
        <td class="text-right">
          <button type="button" class="btn-admin-action btn-inspect-safe" data-key="${s.intake_key}">Review Intake</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-inspect-safe').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        const item = adminSafeguards.find((x) => x.intake_key === key);
        if (item) {
          alert(`CONFIDENTIAL SAFEGUARDING INTAKE: ${item.intake_key}\n\nNature: ${item.concern_type}\nLocation: ${item.location_approx}\nCallback: ${item.safe_contact_method || 'None provided'}\n\nNarrative:\n${item.narrative}`);
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Error loading confidential intake records.</td></tr>`;
  }
}

/* ==========================================================================
   4. SPORTS MATCHDESK CONTROLS
   ========================================================================== */
async function fetchAdminMatches() {
  const tbody = document.getElementById('adminMatchesTbody');
  const selectLive = document.getElementById('selectActiveMatchForLive');
  if (!tbody) return;

  try {
    const sb = await getSupabase();
    const [matchesRes, teamsRes, areasRes] = await Promise.all([
      sb.from('sports_matches').select('*').order('match_date', { ascending: false }),
      sb.from('sports_teams').select('*'),
      sb.from('sports_areas').select('*')
    ]);

    adminMatches = matchesRes.data || [];
    const teams = teamsRes.data || [];
    const areas = areasRes.data || [];

    tbody.innerHTML = adminMatches.map((m) => {
      const home = teams.find((t) => t.id === m.home_team_id)?.name || 'Home';
      const away = teams.find((t) => t.id === m.away_team_id)?.name || 'Away';
      const area = areas.find((a) => a.id === m.area_id)?.name || 'Zone';

      return `
        <tr>
          <td>${m.match_date ? new Date(m.match_date).toLocaleDateString() : ''} ${m.kickoff_time || ''}</td>
          <td>${area}</td>
          <td class="font-bold">${home}</td>
          <td class="font-mono text-center">${m.home_score ?? '-'}&nbsp;:&nbsp;${m.away_score ?? '-'}</td>
          <td class="font-bold">${away}</td>
          <td>${m.venue || ''}</td>
          <td><span class="badge ${m.status === 'In Progress' ? 'badge-live' : 'badge-outline'} text-2xs">${m.status}</span></td>
          <td class="text-right">
            <button type="button" class="btn-admin-action btn-manage-match" data-id="${m.id}">Score</button>
          </td>
        </tr>
      `;
    }).join('');

    // Populate live selector
    if (selectLive) {
      selectLive.innerHTML = `
        <option value="">-- Select Active Match --</option>
        ${adminMatches.map((m) => {
          const home = teams.find((t) => t.id === m.home_team_id)?.name || 'Home';
          const away = teams.find((t) => t.id === m.away_team_id)?.name || 'Away';
          return `<option value="${m.id}">${home} vs ${away} (${m.status})</option>`;
        }).join('')}
      `;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Error loading matches.</td></tr>`;
  }
}

function initMatchdeskControls() {
  const btnPush = document.getElementById('btnPushLiveScore');
  const btnEnd = document.getElementById('btnEndMatchFinal');
  const selectMatch = document.getElementById('selectActiveMatchForLive');
  const homeInput = document.getElementById('liveHomeScoreInput');
  const awayInput = document.getElementById('liveAwayScoreInput');

  btnPush?.addEventListener('click', async () => {
    const matchId = selectMatch?.value;
    const hScore = Number(homeInput?.value || 0);
    const aScore = Number(awayInput?.value || 0);

    if (!matchId) {
      alert('Select an active match first.');
      return;
    }

    try {
      const sb = await getSupabase();
      await sb.from('sports_matches').update({
        status: 'In Progress',
        is_live: true,
        home_score: hScore,
        away_score: aScore,
        current_period: 'LIVE'
      }).eq('id', matchId);

      await logAuditAction('BROADCAST_LIVE_SCORE', 'sports_matches', matchId, `Score updated to ${hScore} - ${aScore}`);
      alert('Live score broadcasted successfully!');
      fetchAdminMatches();
    } catch (err) {
      alert('Error updating live score: ' + err.message);
    }
  });

  btnEnd?.addEventListener('click', async () => {
    const matchId = selectMatch?.value;
    const hScore = Number(homeInput?.value || 0);
    const aScore = Number(awayInput?.value || 0);

    if (!matchId) return;

    if (!confirm(`Finalize match score as ${hScore} - ${aScore}? This updates standings.`)) return;

    try {
      const sb = await getSupabase();
      await sb.from('sports_matches').update({
        status: 'Completed',
        is_live: false,
        home_score: hScore,
        away_score: aScore,
        current_period: 'Full Time'
      }).eq('id', matchId);

      await logAuditAction('FINALIZE_MATCH', 'sports_matches', matchId, `Final score confirmed: ${hScore} - ${aScore}`);
      alert('Match confirmed and finalized.');
      fetchAdminMatches();
    } catch (err) {
      alert('Error finalizing match: ' + err.message);
    }
  });
}

/* ==========================================================================
   5. IMMUTABLE AUDIT LOG TRAIL
   ========================================================================== */
async function fetchAdminAuditLogs() {
  const tbody = document.getElementById('adminAuditTbody');
  if (!tbody) return;

  try {
    const sb = await getSupabase();
    const { data } = await sb.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(50);
    adminAuditLogs = data || [];

    tbody.innerHTML = adminAuditLogs.map((log) => `
      <tr>
        <td class="text-muted">${log.created_at ? new Date(log.created_at).toLocaleString() : ''}</td>
        <td><strong>${log.actor_email}</strong></td>
        <td><span class="audit-action-badge">${log.action_type}</span></td>
        <td>${log.entity_type}</td>
        <td>${log.entity_id}</td>
        <td class="text-xs">${log.details || ''}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Error loading audit log records.</td></tr>`;
  }
}