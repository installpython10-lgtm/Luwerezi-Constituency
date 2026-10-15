# Mzimba Luwerezi Constituency Portal

Static HTML/CSS/JavaScript website served from `public/`. Supabase is optional:
without valid public configuration, the public pages remain available and
database-backed features report that the backend is unavailable.

## Supabase browser configuration

The app creates one shared Supabase client in
[`public/js/modules/supabase-client.js`](./public/js/modules/supabase-client.js).
It obtains public browser settings from the same-origin Cloudflare Pages
Function [`functions/api/supabase-config.js`](./functions/api/supabase-config.js),
available at `/api/supabase-config`.

Supply these values from **Supabase Dashboard → Project Settings → API**:

- `SUPABASE_URL`: Project URL, normally `https://<project-ref>.supabase.co`.
- `SUPABASE_PUBLISHABLE_KEY`: the publishable key (normally starts
  `sb_publishable_`). For older projects, use the legacy public `anon` JWT as
  `SUPABASE_ANON_KEY` instead. Set one public key variable.

The Project URL and publishable/anon key are expected to be visible in the
browser. They are **not authorization secrets**: RLS and appropriate Auth
settings remain essential. Never put a `service_role` key, `sb_secret_` key,
database password, JWT signing secret, SMTP credential, or any privileged
secret in browser JavaScript, a public file, or the publishable/anon variable.
The Pages Function refuses non-publishable keys and legacy JWTs whose role is
not `anon`; it also checks the key against Supabase Auth before telling the
browser the project is configured. A configured response confirms that the
Auth API accepted the key, not that database tables, RLS, or administrator
authorization are ready. The function response uses `Cache-Control: no-store`.

Do not put real values in `public/` files or commit local credential files.

### Local VS Code development

1. From the project root, copy the example environment file:

   ```powershell
   Copy-Item .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` and replace the sample values with the real Project URL
   and publishable key (or legacy anon key). `.dev.vars` is excluded from Git.
3. Run the static site and Pages Function using Wrangler:

   ```powershell
   npx wrangler pages dev public
   ```

   Use the local URL printed by Wrangler. A plain static server serves the
   `configured:false` fallback at `public/api/supabase-config` but does not run
   the Pages Function; the app stays unconfigured rather than trying
   placeholder credentials.

### Cloudflare Pages

1. Connect this repository to a Cloudflare Pages project. Use `public` as the
   build output directory; no build command is needed for the static assets.
   Keep the `functions/` directory at the repository root so Pages deploys the
   configuration Function. Cloudflare's `public/_headers` file provides the
   intended security and caching headers.
2. In **Workers & Pages → your Pages project → Settings → Variables and
   Secrets**, add `SUPABASE_URL` and either `SUPABASE_PUBLISHABLE_KEY` or
   `SUPABASE_ANON_KEY` for the relevant Production and Preview environments.
   These are public client settings; do not configure service-role credentials
   here.
3. Redeploy and verify `https://<your-site>/api/supabase-config` returns
   `{"configured":true,...}`. That response contains the Project URL and public
   key by design. Do not publish or log actual values needlessly.

Cloudflare build-time variables are not automatically available to browser
JavaScript; this project uses runtime Pages Function bindings. Pages invokes
the Function for this route instead of the static unconfigured fallback.

## Supabase project setup

1. Create or select the real Supabase project and configure its Project URL and
   publishable/anon key using the runtime configuration steps above. Do not
   commit those values to repository files.
2. Review migrations `001` through `009` in `supabase/migrations/` before
   applying them. They define profiles/roles, projects, reports, sports,
   safeguarding, audit logs, MFA-gated administrator policies, restricted
   public report tracking, and the guarded designated-role assignment. Apply
   in numeric order using the Supabase SQL Editor and review the SQL against
   operational and privacy requirements first.
3. In **Authentication → URL Configuration**, configure the deployed Site URL
   and add the Cloudflare Pages origin and local Wrangler origin to allowed
   redirect URLs. Configure password sign-in, resident registration, email
   confirmation, and password reset behavior to match your account policy.
   The site uses email/password sign-in, resident sign-up, and email reset.
4. Before migration `008` or `009`, confirm the new Auth account in the SQL Editor:

   ```sql
   SELECT id, email, email_confirmed_at
   FROM auth.users
   WHERE id = '696a44db-fd7d-4131-8175-e00a23a19e67';
   ```

   Verify the returned UID against the intended user in **Authentication →
   Users**, and confirm `email_confirmed_at` is populated. The role assignment
   is keyed by this exact UID, not by email. Do not create a replacement Auth
   user or change the UID if it does not match.
5. Migration `006` makes every
   `public.is_superadmin()` RLS check require an AAL2 (verified MFA) session,
   forces new profile rows to the resident role, and prevents self-service
   profile updates from changing the legacy role column. Migration `007`
   replaces broad anonymous report-table reads with a tracking RPC returning
   only approved status fields. Migrations `008` and `009` validate the exact
   Auth UID and confirmed-email status, require the MFA-gated authorization
   function, and write an immutable audit entry when assigning or confirming
   `superadmin`. On mismatch, they raise an error and assign nothing. Apply
   migrations in numeric order from **Supabase SQL Editor** signed in as a
   database administrator. The public anon key cannot verify Auth users or
   write role rows. Never grant roles through browser-editable metadata.
   For an existing deployment that already applied the prior assignment,
   apply migration `009` after confirming its target UID. Verify the resulting
   assignment and audit entry with:

   ```sql
   SELECT roles.user_id, roles.role, users.email, logs.action_type
   FROM public.user_roles AS roles
   JOIN auth.users AS users ON users.id = roles.user_id
   LEFT JOIN public.admin_audit_logs AS logs
     ON logs.entity_type = 'user_roles'
    AND logs.entity_id = roles.user_id::text
    AND logs.action_type IN (
      'SUPERADMIN_ROLE_ASSIGNED',
      'SUPERADMIN_ROLE_ASSIGNMENT_CONFIRMED'
    )
   WHERE roles.user_id = '696a44db-fd7d-4131-8175-e00a23a19e67'
     AND roles.role = 'superadmin';
   ```
6. Before deployment, Superadmins must sign in with email/password and establish
   an AAL2 session using a verified TOTP authenticator. The deployed admin flow
   requires MFA before checking the server-assigned role; RLS and privileged
   server operations continue to require AAL2. Enable TOTP MFA in Supabase Auth
   settings before deployment.

   For local testing only, when the site is opened on `localhost`, `127.0.0.1`,
   or `::1`, a valid Supabase session for the designated Auth UID may
   open a labeled preview shell without AAL2. The preview does not load
   protected data, initialize admin controls, or authorize Superadmin
   operations. Once MFA establishes AAL2, the normal role check and dashboard
   flow applies. To require MFA on local hosts too, remove the `isLocalDevelopmentHost()`
   preview branch and `showLocalDashboardPreview()` path in
   `public/js/modules/admin.js`. Do not broaden the local-host check or treat
   the preview as authorization; verify the deployed MFA flow before release.
7. If report attachments are required, create the `report-evidence` Storage
   bucket and configure policies for your intended privacy model. The bucket
   is optional; uploads are attempted only when a report includes an attachment.
8. Notification Edge Functions are present in `supabase/functions/`. Their
   protected handlers require a valid AAL2 Superadmin token and an RLS-approved
   `user_roles` result. Deploy and configure them separately if needed.
   Notification provider keys belong only in Supabase Function secrets, never
   in public/browser settings.

### Feature-to-schema map

- Resident profiles and roles: `profiles`, `user_roles`.
- Project register and admin project editor: `development_projects`.
- Report submission, lookup and resident case history: `community_reports`.
- Sports: `sports_seasons`, `sports_areas`, `sports_teams`, `sports_players`,
  `sports_matches`, `sports_match_events`.
- Confidential intake and access log: `safeguarding_reports`,
  `safeguarding_access_log`.
- Admin audit trail: `admin_audit_logs`.

### Report tracking privacy

Migration `004` no longer grants anonymous direct `SELECT` on
`community_reports`. Migration `007` adds `track_community_report`, a
security-definer RPC restricted to exact-reference lookup and a field allowlist;
it omits personal contact details, report narrative, attachment URLs, and
free-text admin notes. Existing projects that previously applied the old
`004` policy must apply migration `007` before enabling public report tracking.

Until valid runtime configuration and a safely configured backend exist,
authentication, registration, reports, safeguarding submissions, project and
sports data, and admin database operations are unavailable. The hidden admin
shortcut only opens the login UI; it never grants access.
