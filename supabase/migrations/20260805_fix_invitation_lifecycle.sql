/*
  ============================================================================
  Trustera - Fix Invitation Lifecycle
  ============================================================================

  This migration:

  1. Adds lifecycle timestamps
  2. Normalises invitation statuses
  3. Prevents duplicate pending invitations
  4. Synchronises auth_user_id with profiles
  5. Automatically accepts invitations when a profile is created
  6. Automatically removes duplicate pending invitations
  7. Adds indexes for performance

  Safe to run once.
*/

BEGIN;

-- ============================================================================
-- Required columns
-- ============================================================================

ALTER TABLE public.company_invitations
ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE public.company_invitations
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.company_invitations
ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE public.company_invitations
ADD COLUMN IF NOT EXISTS updated_at timestamptz
DEFAULT now();

UPDATE public.company_invitations
SET updated_at = COALESCE(updated_at, now());

-- ============================================================================
-- Normalise email addresses
-- ============================================================================

UPDATE public.company_invitations
SET email = lower(trim(email))
WHERE email IS NOT NULL;

-- ============================================================================
-- Mark existing invitations as accepted if profile already exists
-- ============================================================================

UPDATE public.company_invitations AS invitation
SET
    status = 'accepted',
    accepted_at = COALESCE(invitation.accepted_at, now()),
    updated_at = now()
FROM public.profiles AS profile
WHERE
    invitation.company_id = profile.company_id
    AND lower(trim(invitation.email)) = lower(trim(profile.email))
    AND lower(trim(invitation.status)) = 'pending';

-- ============================================================================
-- Synchronise auth_user_id
-- ============================================================================

UPDATE public.company_invitations AS invitation
SET
    auth_user_id = profile.id,
    updated_at = now()
FROM public.profiles AS profile
WHERE
    invitation.company_id = profile.company_id
    AND lower(trim(invitation.email)) = lower(trim(profile.email))
    AND (
        invitation.auth_user_id IS NULL
        OR invitation.auth_user_id <> profile.id
    );

-- ============================================================================
-- Cancel duplicate pending invitations
-- Keep the newest pending invitation.
-- ============================================================================

WITH ranked_pending_invitations AS
(
    SELECT
        id,
        row_number() OVER
        (
            PARTITION BY
                company_id,
                lower(trim(email))
            ORDER BY
                invited_at DESC NULLS LAST,
                created_at DESC NULLS LAST,
                id DESC
        ) AS row_number
    FROM public.company_invitations
    WHERE lower(trim(status))='pending'
)

UPDATE public.company_invitations AS invitation
SET
    status='cancelled',
    cancelled_at=COALESCE(
        invitation.cancelled_at,
        now()
    ),
    updated_at=now()
FROM ranked_pending_invitations AS ranked
WHERE
    invitation.id = ranked.id
    AND ranked.row_number > 1;

-- ============================================================================
-- Pending invitation uniqueness
-- ============================================================================

DROP INDEX IF EXISTS public.company_invitation_pending_unique;

CREATE UNIQUE INDEX company_invitation_pending_unique
ON public.company_invitations
(
    company_id,
    lower(trim(email))
)
WHERE lower(trim(status))='pending';

-- ============================================================================
-- auth_user_id lookup index
--
-- NOT UNIQUE.
-- Users may legitimately have historical invitation records.
-- ============================================================================

DROP INDEX IF EXISTS public.company_invitation_auth_user_unique;

CREATE INDEX IF NOT EXISTS company_invitation_auth_user_idx
ON public.company_invitations(auth_user_id)
WHERE auth_user_id IS NOT NULL;

-- ============================================================================
-- Helpful indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS company_invitation_company_idx
ON public.company_invitations(company_id);

CREATE INDEX IF NOT EXISTS company_invitation_status_idx
ON public.company_invitations(status);

CREATE INDEX IF NOT EXISTS company_invitation_email_idx
ON public.company_invitations(lower(trim(email)));

-- ============================================================================
-- Trigger function
-- Automatically accepts pending invitations when a profile is created.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_company_invitation_after_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN

    UPDATE public.company_invitations
    SET
        status = 'accepted',
        auth_user_id = NEW.id,
        accepted_at = COALESCE(accepted_at, now()),
        updated_at = now()
    WHERE
        company_id = NEW.company_id
        AND lower(trim(email)) = lower(trim(NEW.email))
        AND lower(trim(status)) = 'pending';

    RETURN NEW;

END;
$$;

-- ============================================================================
-- Trigger
-- ============================================================================

DROP TRIGGER IF EXISTS trg_sync_company_invitation_after_profile
ON public.profiles;

CREATE TRIGGER trg_sync_company_invitation_after_profile
AFTER INSERT
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_company_invitation_after_profile();

COMMIT;