/*
  ============================================================================
  Trustera - Allow Worker Profile Role
  ============================================================================

  Ensures invited workers can be provisioned into public.profiles.
*/

BEGIN;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (
  role IN (
    'admin',
    'manager',
    'compliance_officer',
    'staff',
    'viewer',
    'worker'
  )
);

COMMIT;