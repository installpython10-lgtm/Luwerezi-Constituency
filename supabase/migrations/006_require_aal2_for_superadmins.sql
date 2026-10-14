-- Require a verified Supabase MFA session (AAL2) for every policy that calls
-- public.is_superadmin(). Admin changes therefore remain protected by RLS,
-- independently of frontend visibility checks.

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(auth.jwt() ->> 'aal' = 'aal2', FALSE)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'superadmin'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO anon, authenticated;

-- The legacy profile role is not an authorization source. Prevent residents
-- from changing even this informational role through the self-service profile
-- UPDATE grant; privileged access is assigned only through user_roles.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone) ON TABLE public.profiles TO authenticated;

-- Signup metadata is user-controlled; never copy a submitted role into profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'Resident User'),
    NEW.raw_user_meta_data ->> 'phone',
    'resident'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
