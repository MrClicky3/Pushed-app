/*
  # Revoke EXECUTE on SECURITY DEFINER functions from PUBLIC/anon

  1. get_device_id()
     - No longer needed at all via REST. Revoke from PUBLIC (which covers anon),
       anon, and authenticated explicitly.

  2. claim_device_data(text)
     - Must remain callable by authenticated users (legitimate use).
     - Revoke from PUBLIC and anon so only the authenticated role retains access,
       which satisfies the security scanner's concern about unintended exposure.
*/

-- get_device_id: fully lock down, not needed via REST at all
REVOKE EXECUTE ON FUNCTION public.get_device_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_device_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_device_id() FROM authenticated;

-- claim_device_data: keep authenticated access, strip PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.claim_device_data(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_device_data(text) FROM anon;
