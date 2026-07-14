/*
  # Fix Security Issues

  1. Drop unused index
    - Removes `idx_workout_logs_created_at` on `workout_logs` which has never been used

  2. Fix mutable search_path on `get_device_id`
    - Recreates the function with `SET search_path = ''` to prevent search_path injection attacks
    - Uses fully-qualified type references
*/

-- 1. Drop unused index
DROP INDEX IF EXISTS public.idx_workout_logs_created_at;

-- 2. Fix mutable search_path on get_device_id by recreating with fixed search_path
CREATE OR REPLACE FUNCTION public.get_device_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN coalesce(
    current_setting('request.headers', true)::json->>'x-device-id',
    ''
  );
END;
$$;
