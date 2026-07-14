/*
  # Revoke public execute on get_device_id()

  The get_device_id() function is a SECURITY DEFINER function no longer needed
  for RLS (we migrated to auth.uid()). Revoke EXECUTE from anon and authenticated
  roles to close the security advisory.
*/

REVOKE EXECUTE ON FUNCTION public.get_device_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_device_id() FROM authenticated;
