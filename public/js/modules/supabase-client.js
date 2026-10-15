/**
 * Mzimba Luwerezi Constituency - Supabase client and auth module.
 * Browser configuration contains only the public Project URL and publishable key.
 */

export let SUPABASE_UNAVAILABLE_MESSAGE =
  'Authentication and live records are unavailable because Supabase has not been configured for this website.';

export const DESIGNATED_SUPERADMIN_ID = '696a44db-fd7d-4131-8175-e00a23a19e67';

let configPromise = null;
let supabasePromise = null;
let supabaseConfig = null;

/**
 * Loads the public browser configuration from the same-origin Pages Function.
 * @returns {Promise<boolean>}
 */
export function loadSupabaseConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      const configUrl = new URL('../../api/supabase-config', import.meta.url);
      let response;

      try {
        response = await fetch(configUrl, {
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });
      } catch {
        window.clearTimeout(timeoutId);
        SUPABASE_UNAVAILABLE_MESSAGE =
          'Could not reach the Supabase configuration service. Check your connection and try again.';
        supabaseConfig = null;
        return false;
      }

      try {
        const result = await response.json();
        if (!response.ok || result?.configured !== true) {
          SUPABASE_UNAVAILABLE_MESSAGE = getSupabaseConfigError(response.status, result?.reason);
          supabaseConfig = null;
          return false;
        }

        const config = {
          url: result.supabaseUrl,
          publishableKey: result.publishableKey
        };
        if (!isValidSupabaseConfig(config)) {
          SUPABASE_UNAVAILABLE_MESSAGE =
            'The Supabase configuration service returned an invalid public URL or publishable key.';
          supabaseConfig = null;
          return false;
        }

        supabaseConfig = config;
        return true;
      } catch {
        SUPABASE_UNAVAILABLE_MESSAGE =
          'The Supabase configuration service returned an unreadable response. Check the Pages Function deployment.';
        supabaseConfig = null;
        return false;
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();
  }

  return configPromise;
}

function getSupabaseConfigError(status, reason) {
  if (reason === 'invalid_public_key') {
    return 'Supabase rejected the configured public key. Check the publishable or anon key in the site configuration.';
  }
  if (reason === 'project_unreachable') {
    return 'The Supabase project could not be reached. Check the project status and try again.';
  }
  if (reason === 'auth_service_unavailable') {
    return 'The Supabase Auth service is unavailable. Check the project status and try again.';
  }
  if (status === 404) {
    return 'The Supabase configuration endpoint is unavailable. Deploy the Pages Function and configure its public settings.';
  }
  return 'Supabase is not configured for this website. Configure SUPABASE_URL and a public publishable or anon key.';
}

function isPublicSupabaseKey(key) {
  if (key.startsWith('sb_publishable_')) {
    const suffix = key.slice('sb_publishable_'.length);
    return suffix.length >= 20 && !/(placeholder|replace|example|your[_-]?key)/i.test(suffix);
  }

  const payload = key.split('.')[1];
  if (!payload) return false;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(atob(base64)).role === 'anon';
  } catch {
    return false;
  }
}

function isValidSupabaseConfig(config) {
  if (!config?.url || !config.publishableKey || !isPublicSupabaseKey(config.publishableKey)) {
    return false;
  }

  try {
    const parsedUrl = new URL(config.url);
    const hostedUrl = parsedUrl.protocol === 'https:' &&
      parsedUrl.hostname.endsWith('.supabase.co') &&
      !/^(your|example|placeholder|replace)/i.test(parsedUrl.hostname);
    const localUrl = parsedUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(parsedUrl.hostname);
    return (hostedUrl || localUrl) &&
      parsedUrl.pathname === '/' &&
      !parsedUrl.search &&
      !parsedUrl.hash;
  } catch {
    return false;
  }
}

export function isSupabaseConfigured() {
  return isValidSupabaseConfig(supabaseConfig);
}

function sanitizeDiagnosticText(value) {
  const text = String(value);
  const publishableKey = supabaseConfig?.publishableKey;
  return text
    .replace(/otpauth:\/\/\S+/gi, '[REDACTED_TOTP_URI]')
    .replace(/(secret|totp_secret|qr_code)\s*[:=]\s*[^,\s;]+/gi, '$1=[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
    .replace(/\bsb_publishable_[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
    .replace(publishableKey || /$^/, '[REDACTED_KEY]');
}

export function getSafeAuthErrorDetails(error) {
  const details = {
    name: error?.name ?? null,
    message: sanitizeDiagnosticText(error?.message || 'Unknown Supabase authentication error.'),
    status: error?.status ?? error?.statusCode ?? null,
    code: error?.code ?? null
  };
  const cause = error?.cause;
  if (cause !== undefined) {
    details.cause = cause && typeof cause === 'object'
      ? {
          name: cause.name ?? null,
          message: cause.message
            ? sanitizeDiagnosticText(cause.message)
            : null,
          status: cause.status ?? cause.statusCode ?? null,
          code: cause.code ?? null
        }
      : sanitizeDiagnosticText(cause);
  }
  return details;
}

/**
 * Gets the single shared Supabase client. Concurrent callers share configuration
 * loading and client creation.
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getSupabase() {
  await loadSupabaseConfig();
  if (!isSupabaseConfigured()) throw new Error(SUPABASE_UNAVAILABLE_MESSAGE);

  if (!supabasePromise) {
    supabasePromise = initializeSupabase().catch((error) => {
      supabasePromise = null;
      throw error;
    });
  }
  return supabasePromise;
}

async function initializeSupabase() {
  let supabaseLibrary = window.supabase;
  if (!supabaseLibrary) {
    try {
      supabaseLibrary = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    } catch (error) {
      supabasePromise = null;
      console.error('[Supabase] Failed to load the Supabase client library:', error);
      throw new Error('The Supabase client library could not be loaded. Check your network connection and try again.');
    }
  }

  if (typeof supabaseLibrary?.createClient !== 'function') {
    supabasePromise = null;
    throw new Error('The Supabase client library loaded without a usable createClient function.');
  }

  return supabaseLibrary.createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'luwerezi_auth_token'
    }
  });
}

export async function signUpResident(email, password, fullName, phone = '') {
  const sb = await getSupabase();
  return sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } }
  });
}

export async function signInUser(email, password, handler) {
  const sb = await getSupabase();
  const normalizedEmail = email.trim();
  const diagnosticContext = {
    handler,
    projectUrl: supabaseConfig.url,
    email: normalizedEmail
  };
  console.info('[AdminAuth] Password sign-in request started:', diagnosticContext);

  try {
    const result = await sb.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });
    if (result.error) {
      console.warn('[AdminAuth] Password sign-in rejected:', {
        ...diagnosticContext,
        ...getSafeAuthErrorDetails(result.error)
      });
    }
    return result;
  } catch (error) {
    console.warn('[AdminAuth] Password sign-in request failed:', {
      ...diagnosticContext,
      ...getSafeAuthErrorDetails(error)
    });
    throw error;
  }
}

/**
 * Requires a verified TOTP challenge and an AAL2 session for administrator access.
 * @param {string} code
 */
export async function verifySuperadminMfa(code) {
  const sb = await getSupabase();
  const factors = await getAuthenticatedTotpFactors(sb);
  const { data: assurance, error: assuranceError } =
    await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.currentLevel === 'aal2') return true;

  const factor = factors.find((item) => item.status === 'verified');
  if (!factor) {
    const error = new Error('Superadmin access requires a verified authenticator. Enroll a TOTP factor for this account first.');
    error.code = 'mfa_enrollment_required';
    throw error;
  }

  const normalizedCode = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error('Enter the current six-digit code from your verified authenticator app.');
  }

  const { error: verificationError } = await sb.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: normalizedCode
  });
  if (verificationError) throw verificationError;

  await getAuthenticatedTotpFactors(sb);
  const { data: verifiedAssurance, error: verifiedAssuranceError } =
    await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (verifiedAssuranceError) throw verifiedAssuranceError;
  await requireDesignatedSuperadminAccount(sb);
  if (verifiedAssurance.currentLevel !== 'aal2') {
    throw new Error('The authenticator challenge did not establish the required AAL2 session.');
  }

  return true;
}

export async function getCurrentMfaAssuranceLevel() {
  const sb = await getSupabase();
  const signedInUser = await requireAuthenticatedUser(sb);
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  await confirmSameAuthenticatedUser(sb, signedInUser.id);
  return data.currentLevel;
}

export async function getCurrentTotpFactors(expectedUserId) {
  const sb = await getSupabase();
  const signedInUser = await requireAuthenticatedUser(sb);
  if (expectedUserId && signedInUser.id !== expectedUserId) {
    throw new Error('The signed-in account changed before its authenticator factors could be retrieved.');
  }
  return getTotpFactorsForUser(sb, signedInUser.id);
}

export async function beginTotpEnrollment() {
  const sb = await getSupabase();
  const totpFactors = await getAuthenticatedTotpFactors(sb);
  const verifiedFactor = totpFactors.find((factor) => factor.status === 'verified');
  if (verifiedFactor) {
    return { factorId: verifiedFactor.id, alreadyVerified: true };
  }

  const pendingFactors = totpFactors.filter((factor) => factor.status === 'unverified');
  if (pendingFactors.length === 1) {
    return {
      factorId: pendingFactors[0].id,
      needsRecovery: true
    };
  }
  if (pendingFactors.length > 1) {
    throw new Error('Multiple unfinished TOTP authenticators exist for this account. Review the factors for the signed-in Superadmin UID in Supabase Auth; remove only the specific unverified factor you confirm is stale.');
  }
  if (totpFactors.length > 0) {
    throw new Error('Supabase returned a TOTP factor with an unsupported status. Review this account’s factors in Supabase Auth; no new factor was created.');
  }

  let data;
  try {
    const result = await sb.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Luwerezi Superadmin'
    });
    if (result.error) throw result.error;
    data = result.data;
  } catch (error) {
    const isDuplicateFactor = error?.code === 'factor_name_conflict' ||
      (typeof error?.message === 'string' &&
        /factor with the friendly name "Luwerezi Superadmin".*already exists/i.test(error.message));
    if (!isDuplicateFactor) throw error;

    let refreshedFactors;
    try {
      refreshedFactors = await getAuthenticatedTotpFactors(sb);
    } catch (refreshError) {
      const recoveryError = new Error('Supabase rejected the new authenticator because its name already exists, but the current session could not retrieve this account’s factors. Sign in again, then review Authentication > Users for the designated Superadmin UID in Supabase Dashboard. Do not remove a verified factor; remove only an unverified factor you confirm is stale.');
      recoveryError.cause = refreshError;
      throw recoveryError;
    }
    const existingFactor = refreshedFactors.find((factor) => factor.status === 'verified');
    if (existingFactor?.status === 'verified') {
      return { factorId: existingFactor.id, alreadyVerified: true };
    }
    const pendingFactors = refreshedFactors.filter((factor) => factor.status === 'unverified');
    if (pendingFactors.length === 1) {
      return { factorId: pendingFactors[0].id, needsRecovery: true };
    }
    if (pendingFactors.length > 1) {
      throw new Error('Supabase reports an existing authenticator, but this account has multiple unfinished TOTP factors. No factor was removed. Review the factors for the signed-in Superadmin UID in Supabase Auth, then remove only the intended unverified factor.');
    }
    throw new Error('Supabase reports an existing authenticator, but the signed-in account’s factor list does not expose it. No new factor was created. In Supabase Dashboard, open Authentication > Users, select the designated Superadmin UID, and review its MFA factors. Do not remove a verified factor; remove an unverified factor only if you confirm it is the stale setup.');
  }

  const { id, totp } = data;
  if (!id || !totp?.qr_code || !totp.secret) {
    throw new Error('Supabase did not return the authenticator setup details.');
  }
  const enrolledFactors = await getAuthenticatedTotpFactors(sb);
  if (!enrolledFactors.some((factor) => factor.id === id && factor.status === 'unverified')) {
    throw new Error('The newly enrolled TOTP factor could not be confirmed for the current signed-in account. Its setup details were not displayed.');
  }
  return { factorId: id, qrCode: totp.qr_code, secret: totp.secret };
}

export async function restartTotpEnrollment(factorId) {
  const sb = await getSupabase();
  const factors = await getAuthenticatedTotpFactors(sb);
  const factor = factors.find((item) => item.id === factorId);
  if (!factor || factor.status !== 'unverified') {
    throw new Error('Only the matching unverified TOTP factor can be removed.');
  }

  const { error } = await sb.auth.mfa.unenroll({ factorId: factor.id });
  if (error) throw error;
  return beginTotpEnrollment();
}

async function requireDesignatedSuperadminAccount(sb) {
  const user = await requireAuthenticatedUser(sb);
  if (user.id !== DESIGNATED_SUPERADMIN_ID) {
    throw new Error('Authenticator enrollment is restricted to the designated Auth UID.');
  }
  return user;
}

async function requireAuthenticatedUser(sb) {
  const { data, error } = await sb.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error('Supabase returned no authenticated user. Sign in again before continuing.');
  return data.user;
}

async function getAuthenticatedTotpFactors(sb) {
  const signedInUser = await requireDesignatedSuperadminAccount(sb);
  return getTotpFactorsForUser(sb, signedInUser.id);
}

async function getTotpFactorsForUser(sb, userId) {
  await confirmSameAuthenticatedUser(sb, userId);
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) throw error;

  let totpFactors;
  if (Array.isArray(data?.totp)) {
    totpFactors = data.totp;
  } else if (Array.isArray(data?.all)) {
    totpFactors = data.all.filter(
      (factor) => factor.factor_type === 'totp' || factor.type === 'totp'
    );
  } else {
    throw new Error('Supabase did not return a readable MFA factor list for the signed-in account.');
  }

  if (totpFactors.some((factor) => typeof factor?.id !== 'string' || !factor.id)) {
    throw new Error('Supabase returned a TOTP factor without a usable factor ID. No enrollment or verification was attempted.');
  }

  await confirmSameAuthenticatedUser(sb, userId);
  return totpFactors;
}

async function confirmSameAuthenticatedUser(sb, userId) {
  const { data: refreshedUser, error: refreshedUserError } = await sb.auth.getUser();
  if (refreshedUserError) throw refreshedUserError;
  if (refreshedUser.user?.id !== userId) {
    throw new Error('The signed-in account changed while retrieving authenticator factors. Sign in again before continuing.');
  }
}

export async function verifyTotpEnrollment(factorId, code) {
  const sb = await getSupabase();
  const currentFactors = await getAuthenticatedTotpFactors(sb);
  const factor = currentFactors.find((item) => item.id === factorId);
  if (!factor || factor.status !== 'unverified') {
    throw new Error('The selected unverified TOTP factor is not available to the current signed-in Superadmin account. Sign in again and review this account’s factors in Supabase Auth.');
  }

  const normalizedCode = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error('Enter the current six-digit code from your authenticator app.');
  }

  const { error } = await sb.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: normalizedCode
  });
  if (error) throw error;

  const factors = await getAuthenticatedTotpFactors(sb);
  if (!factors.some((item) =>
    item.id === factorId &&
    item.status === 'verified'
  )) {
    throw new Error('Supabase did not report this authenticator factor as verified.');
  }

  const { data: assurance, error: assuranceError } =
    await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.currentLevel !== 'aal2') {
    throw new Error('The authenticator challenge did not establish the required AAL2 session.');
  }
}

export async function signOutUser() {
  const sb = await getSupabase();
  const { error } = await sb.auth.signOut();
  try {
    localStorage.removeItem('luwerezi_auth_token');
    sessionStorage.clear();
  } catch (error) {
    console.warn('[Auth] Could not clear browser session storage:', error);
  }
  return { error };
}

export async function getCurrentUser() {
  await loadSupabaseConfig();
  if (!isSupabaseConfigured()) return null;

  const sb = await getSupabase();
  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;

  const { data, error } = await sb.auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== sessionData.session.user.id) {
    throw new Error('The active Supabase session could not be confirmed for the current user. Sign in again.');
  }
  return data.user;
}

/**
 * Checks server-controlled app metadata or the protected user_roles table.
 * @returns {Promise<boolean>}
 */
export async function isSuperadmin() {
  await loadSupabaseConfig();
  if (!isSupabaseConfigured()) return false;

  const user = await getCurrentUser();
  if (!user) return false;

  try {
    const sb = await getSupabase();
    const { data: assurance, error: assuranceError } =
      await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== 'aal2') return false;

    const { data, error } = await sb
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'superadmin')
      .maybeSingle();
    return !error && Boolean(data);
  } catch (error) {
    console.warn('[Auth] Error querying user_roles:', error);
    return false;
  }
}
