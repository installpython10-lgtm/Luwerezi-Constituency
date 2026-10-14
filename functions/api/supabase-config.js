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

function isSupabaseUrl(url) {
  try {
    const parsedUrl = new URL(url);
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

export async function onRequestGet({ env }) {
  const supabaseUrl = typeof env.SUPABASE_URL === 'string'
    ? env.SUPABASE_URL.trim()
    : '';
  const configuredKey = typeof env.SUPABASE_PUBLISHABLE_KEY === 'string'
    ? env.SUPABASE_PUBLISHABLE_KEY.trim()
    : '';
  const legacyAnonKey = typeof env.SUPABASE_ANON_KEY === 'string'
    ? env.SUPABASE_ANON_KEY.trim()
    : '';
  const publishableKey = configuredKey || legacyAnonKey;

  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  };

  if (!isSupabaseUrl(supabaseUrl) || !isPublicSupabaseKey(publishableKey)) {
    return Response.json({ configured: false }, { status: 503, headers });
  }

  let authResponse;
  try {
    authResponse = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publishableKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return Response.json(
      { configured: false, reason: 'project_unreachable' },
      { status: 503, headers }
    );
  }

  if (!authResponse.ok) {
    return Response.json(
      {
        configured: false,
        reason: authResponse.status === 401 || authResponse.status === 403
          ? 'invalid_public_key'
          : 'auth_service_unavailable'
      },
      { status: 503, headers }
    );
  }

  return Response.json(
    { configured: true, supabaseUrl, publishableKey },
    { headers }
  );
}
