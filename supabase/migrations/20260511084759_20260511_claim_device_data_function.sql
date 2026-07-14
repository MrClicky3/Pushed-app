/*
  # Add claim_device_data function

  Allows a newly authenticated user to adopt rows previously written under
  an anonymous device_id (where user_id IS NULL). Called once after first
  sign-in from the client, passing the device_id stored in localStorage.

  Security:
  - SECURITY DEFINER so it can bypass RLS to update orphaned rows.
  - Only updates rows where user_id IS NULL AND device_id matches the input.
  - EXECUTE is granted only to the `authenticated` role.
  - anon is explicitly denied.
*/

CREATE OR REPLACE FUNCTION public.claim_device_data(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_exercises_updated integer;
  v_logs_updated integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RETURN jsonb_build_object('exercises', 0, 'logs', 0);
  END IF;

  UPDATE public.exercises
    SET user_id = v_user_id
    WHERE device_id = p_device_id
      AND user_id IS NULL;
  GET DIAGNOSTICS v_exercises_updated = ROW_COUNT;

  UPDATE public.workout_logs
    SET user_id = v_user_id
    WHERE device_id = p_device_id
      AND user_id IS NULL;
  GET DIAGNOSTICS v_logs_updated = ROW_COUNT;

  RETURN jsonb_build_object('exercises', v_exercises_updated, 'logs', v_logs_updated);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_device_data(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_device_data(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_device_data(text) TO authenticated;
