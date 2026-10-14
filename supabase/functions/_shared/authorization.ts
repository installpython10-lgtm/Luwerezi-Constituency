type SuperadminAuthorization =
  | { authorized: true; userId: string }
  | { authorized: false; status: 401 | 403 | 503; message: string };

function getJwtClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/**
 * Validates the bearer token with Supabase Auth and requires a server-assigned
 * superadmin role on an AAL2 (verified MFA) session. Uses only the public anon
 * key; RLS remains the authority for the role lookup.
 */
export async function requireAal2Superadmin(
  request: Request
): Promise<SuperadminAuthorization> {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { authorized: false, status: 401, message: 'Authentication required.' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return { authorized: false, status: 503, message: 'Authorization service is not configured.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    return { authorized: false, status: 503, message: 'Authorization service is not configured.' };
  }
  if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.supabase.co')) {
    return { authorized: false, status: 503, message: 'Authorization service is not configured.' };
  }

  const claims = getJwtClaims(token);
  if (typeof claims?.sub !== 'string' || claims.aal !== 'aal2') {
    return { authorized: false, status: 403, message: 'A verified MFA session is required.' };
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!authResponse.ok) {
      return { authorized: false, status: 401, message: 'Authentication could not be verified.' };
    }

    const user = await authResponse.json() as { id?: string };
    if (user.id !== claims.sub) {
      return { authorized: false, status: 401, message: 'Authentication could not be verified.' };
    }

    const roleUrl = new URL(`${supabaseUrl}/rest/v1/user_roles`);
    roleUrl.searchParams.set('select', 'user_id');
    roleUrl.searchParams.set('user_id', `eq.${user.id}`);
    roleUrl.searchParams.set('role', 'eq.superadmin');
    const roleResponse = await fetch(roleUrl, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!roleResponse.ok) {
      return { authorized: false, status: 503, message: 'Role authorization could not be verified.' };
    }

    const roleRows = await roleResponse.json() as Array<{ user_id?: string }>;
    if (!Array.isArray(roleRows) || !roleRows.some((row) => row.user_id === user.id)) {
      return { authorized: false, status: 403, message: 'Superadmin authorization is required.' };
    }

    return { authorized: true, userId: user.id };
  } catch {
    return { authorized: false, status: 503, message: 'Authorization service is unavailable.' };
  }
}
