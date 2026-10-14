-- Remove any earlier broad anonymous SELECT grant and expose only the fields
-- required by exact-reference tracking. Personal details, narrative, attachment
-- URL, and free-text administrative notes remain inaccessible to anon.

DROP POLICY IF EXISTS "Public can lookup single case status by exact reference"
  ON public.community_reports;

DROP FUNCTION IF EXISTS public.track_community_report(TEXT);

CREATE FUNCTION public.track_community_report(lookup_reference TEXT)
RETURNS TABLE (
  reference_number TEXT,
  status TEXT,
  status_history JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    report.reference_number,
    report.status,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'status', history_item ->> 'status',
            'timestamp', history_item ->> 'timestamp'
          )
          ORDER BY history_item ->> 'timestamp'
        )
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(report.status_history) = 'array'
              THEN report.status_history
            ELSE '[]'::JSONB
          END
        ) AS history(history_item)
        WHERE history_item ->> 'status' IN (
          'Submitted',
          'Under Review',
          'Assigned',
          'In Progress',
          'Referred',
          'Resolved'
        )
      ),
      '[]'::JSONB
    ),
    report.created_at
  FROM public.community_reports AS report
  WHERE report.reference_number = lookup_reference
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.track_community_report(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_community_report(TEXT) TO anon, authenticated;
