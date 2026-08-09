import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins = new Set([
  'https://trust.jemadi.co.uk',
  'http://localhost:5173',
  'http://localhost:4173',
])

const allowedRoles = new Set([
  'admin',
  'manager',
  'compliance_officer',
  'staff',
  'viewer',
  'worker',
])

type AcceptInvitationRequest = {
  invitationId?: string
}

type JsonBody = Record<string, unknown>

type InvitationRecord = {
  id: string
  company_id: string
  email: string
  full_name: string | null
  role: string
  status: string
  auth_user_id: string | null
  expires_at: string | null
  accepted_at: string | null
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''

  const allowedOrigin = allowedOrigins.has(origin)
    ? origin
    : 'https://trust.jemadi.co.uk'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: JsonBody,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  })
}

function normaliseEmail(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normaliseRole(value?: string | null) {
  return String(value || 'staff')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
}

function invitationHasExpired(value: string | null) {
  if (!value) {
    return false
  }

  const expiryDate = new Date(value)

  return (
    !Number.isNaN(expiryDate.getTime()) &&
    expiryDate.getTime() <= Date.now()
  )
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: getCorsHeaders(request),
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      request,
      {
        error: 'Method not allowed.',
      },
      405,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get(
    'SUPABASE_SERVICE_ROLE_KEY',
  )

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error(
      'Required Supabase environment variables are missing.',
    )

    return jsonResponse(
      request,
      {
        error:
          'The invitation acceptance service is not configured correctly.',
      },
      500,
    )
  }

  const authorization =
    request.headers.get('Authorization') ?? ''

  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(
      request,
      {
        error: 'Authentication is required.',
      },
      401,
    )
  }

  const userClient = createClient(
    supabaseUrl,
    anonKey,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  const adminClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  try {
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse(
        request,
        {
          error: 'Your session is invalid or expired.',
        },
        401,
      )
    }

    let body: AcceptInvitationRequest = {}

    try {
      const rawBody = await request.text()

      if (rawBody.trim()) {
        body = JSON.parse(
          rawBody,
        ) as AcceptInvitationRequest
      }
    } catch {
      return jsonResponse(
        request,
        {
          error: 'The request body is not valid JSON.',
        },
        400,
      )
    }

    const requestedInvitationId = String(
      body.invitationId ||
        user.user_metadata?.invitation_id ||
        '',
    ).trim()

    const userEmail = normaliseEmail(user.email)

    if (!userEmail) {
      return jsonResponse(
        request,
        {
          error:
            'The authenticated user does not have an email address.',
        },
        400,
      )
    }

    let invitationQuery = adminClient
      .from('company_invitations')
      .select(`
        id,
        company_id,
        email,
        full_name,
        role,
        status,
        auth_user_id,
        expires_at,
        accepted_at
      `)

    if (requestedInvitationId) {
      invitationQuery = invitationQuery.eq(
        'id',
        requestedInvitationId,
      )
    } else {
      invitationQuery = invitationQuery
        .ilike('email', userEmail)
        .in('status', [
          'pending',
          'accepted',
        ])
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
    }

    const {
      data: invitationRows,
      error: invitationLookupError,
    } = await invitationQuery

    if (invitationLookupError) {
      throw invitationLookupError
    }

    const invitation =
      (invitationRows?.[0] ??
        null) as InvitationRecord | null

    if (!invitation) {
      return jsonResponse(
        request,
        {
          error:
            'No matching company invitation was found.',
        },
        404,
      )
    }

    const invitationEmail = normaliseEmail(
      invitation.email,
    )

    if (
      !invitationEmail ||
      invitationEmail !== userEmail
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This invitation does not belong to the authenticated user.',
        },
        403,
      )
    }

    const invitationRole = normaliseRole(
      invitation.role,
    )

    if (!allowedRoles.has(invitationRole)) {
      return jsonResponse(
        request,
        {
          error:
            'The invitation contains an unsupported role.',
        },
        400,
      )
    }

    const invitationWasAlreadyAccepted =
      invitation.status === 'accepted'

    if (
      invitationWasAlreadyAccepted &&
      invitation.auth_user_id &&
      invitation.auth_user_id !== user.id
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This invitation has already been accepted by another user.',
        },
        409,
      )
    }

    if (
      invitation.status !== 'pending' &&
      invitation.status !== 'accepted'
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This invitation can no longer be accepted.',
        },
        409,
      )
    }

    /*
     * Expiry only applies while the invitation is still
     * pending. An already-accepted invitation must remain
     * recoverable if its profile was not provisioned
     * correctly during an earlier attempt.
     */
    if (
      invitation.status === 'pending' &&
      invitationHasExpired(invitation.expires_at)
    ) {
      const expiredAt = new Date().toISOString()

      const { error: expiryUpdateError } =
        await adminClient
          .from('company_invitations')
          .update({
            status: 'expired',
            updated_at: expiredAt,
          })
          .eq('id', invitation.id)
          .eq('status', 'pending')

      if (expiryUpdateError) {
        console.error(
          'Unable to mark invitation as expired:',
          expiryUpdateError,
        )
      }

      return jsonResponse(
        request,
        {
          error:
            'This invitation has expired. Ask your organisation administrator to resend it.',
        },
        410,
      )
    }

    if (
      invitation.auth_user_id &&
      invitation.auth_user_id !== user.id
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This invitation is linked to another authenticated user.',
        },
        409,
      )
    }

    const {
      data: company,
      error: companyError,
    } = await adminClient
      .from('companies')
      .select('id, name, status')
      .eq('id', invitation.company_id)
      .maybeSingle()

    if (companyError) {
      throw companyError
    }

    if (!company) {
      return jsonResponse(
        request,
        {
          error:
            'The company attached to this invitation could not be found.',
        },
        404,
      )
    }

    const companyStatus = String(
      company.status || '',
    )
      .trim()
      .toLowerCase()

    if (
      !['onboarding', 'active'].includes(
        companyStatus,
      )
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This company cannot accept invitations in its current status.',
        },
        409,
      )
    }

    /*
     * Check the authenticated user's profile directly.
     * This lets an already-accepted invitation return
     * successfully when its profile is already present,
     * and lets us repair the profile when it is missing.
     */
    const {
      data: existingProfileById,
      error: existingProfileByIdError,
    } = await adminClient
      .from('profiles')
      .select(`
        id,
        company_id,
        email,
        full_name,
        role,
        account_status,
        created_at
      `)
      .eq('id', user.id)
      .maybeSingle()

    if (existingProfileByIdError) {
      throw existingProfileByIdError
    }

    if (
      existingProfileById?.company_id &&
      existingProfileById.company_id !==
        invitation.company_id
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This user already belongs to another company.',
        },
        409,
      )
    }

    const {
      data: profileWithSameEmail,
      error: profileEmailError,
    } = await adminClient
      .from('profiles')
      .select('id, company_id, email')
      .ilike('email', userEmail)
      .maybeSingle()

    if (profileEmailError) {
      throw profileEmailError
    }

    if (
      profileWithSameEmail &&
      profileWithSameEmail.id !== user.id
    ) {
      return jsonResponse(
        request,
        {
          error:
            'A different Trustera profile already uses this email address.',
        },
        409,
      )
    }

    if (
      profileWithSameEmail?.company_id &&
      profileWithSameEmail.company_id !==
        invitation.company_id
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This user already belongs to another company.',
        },
        409,
      )
    }

    const fullName =
      String(
        invitation.full_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          '',
      ).trim() || null

    /*
     * Always upsert the profile, including when the
     * invitation is already accepted.
     *
     * This is the recovery path for the exact state:
     *   company_invitations.status = accepted
     *   auth_user_id = current user
     *   profiles row = missing
     */
    const {
      data: acceptedProfile,
      error: profileUpsertError,
    } = await adminClient
      .from('profiles')
      .upsert(
        {
          id: user.id,
          company_id: invitation.company_id,
          email: userEmail,
          full_name: fullName,
          role: invitationRole,
          account_status: 'active',
        },
        {
          onConflict: 'id',
        },
      )
      .select(`
        id,
        company_id,
        email,
        full_name,
        role,
        account_status,
        created_at
      `)
      .single()

    if (profileUpsertError) {
      throw profileUpsertError
    }

    if (!acceptedProfile) {
      throw new Error(
        'The Trustera user profile could not be provisioned.',
      )
    }

    /*
     * Verify that the profile belongs to the expected
     * company and role before finalising the invitation.
     */
    if (
      acceptedProfile.company_id !==
        invitation.company_id ||
      normaliseRole(acceptedProfile.role) !==
        invitationRole
    ) {
      throw new Error(
        'The Trustera user profile could not be linked to the invitation correctly.',
      )
    }

    let acceptedAt =
      invitation.accepted_at ||
      new Date().toISOString()

    /*
     * Creating a profile may fire the database trigger
     * that accepts the invitation. Re-read the invitation
     * before trying to update it so the Edge Function and
     * trigger remain idempotent.
     */
    const {
      data: invitationAfterProfile,
      error: invitationAfterProfileError,
    } = await adminClient
      .from('company_invitations')
      .select(`
        id,
        company_id,
        email,
        role,
        status,
        auth_user_id,
        accepted_at
      `)
      .eq('id', invitation.id)
      .maybeSingle()

    if (invitationAfterProfileError) {
      throw invitationAfterProfileError
    }

    if (!invitationAfterProfile) {
      throw new Error(
        'The invitation could not be reloaded after profile provisioning.',
      )
    }

    if (
      invitationAfterProfile.status === 'accepted'
    ) {
      if (
        invitationAfterProfile.auth_user_id &&
        invitationAfterProfile.auth_user_id !==
          user.id
      ) {
        throw new Error(
          'The invitation was accepted by another user.',
        )
      }

      acceptedAt =
        invitationAfterProfile.accepted_at ||
        acceptedAt

      /*
       * Repair legacy accepted records whose
       * auth_user_id was not populated.
       */
      if (
        !invitationAfterProfile.auth_user_id
      ) {
        const {
          data: repairedInvitation,
          error: repairInvitationError,
        } = await adminClient
          .from('company_invitations')
          .update({
            auth_user_id: user.id,
            accepted_at: acceptedAt,
            updated_at: acceptedAt,
          })
          .eq('id', invitation.id)
          .eq('status', 'accepted')
          .is('auth_user_id', null)
          .select('id, auth_user_id')
          .maybeSingle()

        if (repairInvitationError) {
          throw repairInvitationError
        }

        if (
          !repairedInvitation ||
          repairedInvitation.auth_user_id !==
            user.id
        ) {
          const {
            data: verificationInvitation,
            error: verificationInvitationError,
          } = await adminClient
            .from('company_invitations')
            .select(
              'id, status, auth_user_id, accepted_at',
            )
            .eq('id', invitation.id)
            .maybeSingle()

          if (verificationInvitationError) {
            throw verificationInvitationError
          }

          if (
            !verificationInvitation ||
            verificationInvitation.status !==
              'accepted' ||
            verificationInvitation.auth_user_id !==
              user.id
          ) {
            throw new Error(
              'The accepted invitation could not be linked to the authenticated user.',
            )
          }

          acceptedAt =
            verificationInvitation.accepted_at ||
            acceptedAt
        }
      }
    } else if (
      invitationAfterProfile.status === 'pending'
    ) {
      const finalAcceptedAt =
        new Date().toISOString()

      const {
        data: acceptedInvitation,
        error: invitationUpdateError,
      } = await adminClient
        .from('company_invitations')
        .update({
          status: 'accepted',
          auth_user_id: user.id,
          accepted_at: finalAcceptedAt,
          updated_at: finalAcceptedAt,
        })
        .eq('id', invitation.id)
        .eq('company_id', invitation.company_id)
        .eq('status', 'pending')
        .select(`
          id,
          company_id,
          email,
          role,
          status,
          auth_user_id,
          accepted_at
        `)
        .maybeSingle()

      if (invitationUpdateError) {
        throw invitationUpdateError
      }

      /*
       * A concurrent trigger/request may have accepted
       * the invitation between our read and update.
       * If the UPDATE matched no row, verify final state
       * instead of deleting the valid profile.
       */
      if (!acceptedInvitation) {
        const {
          data: finalInvitation,
          error: finalInvitationError,
        } = await adminClient
          .from('company_invitations')
          .select(
            'id, status, auth_user_id, accepted_at',
          )
          .eq('id', invitation.id)
          .maybeSingle()

        if (finalInvitationError) {
          throw finalInvitationError
        }

        if (
          !finalInvitation ||
          finalInvitation.status !== 'accepted' ||
          finalInvitation.auth_user_id !== user.id
        ) {
          throw new Error(
            'The invitation could not be marked as accepted.',
          )
        }

        acceptedAt =
          finalInvitation.accepted_at ||
          finalAcceptedAt
      } else {
        if (
          acceptedInvitation.auth_user_id !==
          user.id
        ) {
          throw new Error(
            'The invitation was accepted by another user.',
          )
        }

        acceptedAt =
          acceptedInvitation.accepted_at ||
          finalAcceptedAt
      }
    } else {
      throw new Error(
        'The invitation changed to a state that cannot be accepted.',
      )
    }

    /*
     * Final consistency check. Do not report success
     * unless both the profile and invitation are valid.
     */
    const {
      data: finalInvitationState,
      error: finalInvitationStateError,
    } = await adminClient
      .from('company_invitations')
      .select(
        'id, status, auth_user_id, accepted_at',
      )
      .eq('id', invitation.id)
      .maybeSingle()

    if (finalInvitationStateError) {
      throw finalInvitationStateError
    }

    if (
      !finalInvitationState ||
      finalInvitationState.status !== 'accepted' ||
      finalInvitationState.auth_user_id !== user.id
    ) {
      throw new Error(
        'The invitation acceptance could not be verified.',
      )
    }

    acceptedAt =
      finalInvitationState.accepted_at ||
      acceptedAt

    const { error: metadataUpdateError } =
      await adminClient.auth.admin.updateUserById(
        user.id,
        {
          user_metadata: {
            ...user.user_metadata,
            full_name:
              fullName ||
              user.user_metadata?.full_name ||
              null,
            company_id: invitation.company_id,
            company_name: company.name,
            role: invitationRole,
            invitation_id: invitation.id,
            invitation_status: 'accepted',
          },
        },
      )

    if (metadataUpdateError) {
      console.error(
        'Invitation accepted but Auth metadata could not be updated:',
        metadataUpdateError,
      )
    }

    const { error: auditError } =
      await adminClient
        .from('audit_logs')
        .insert({
          company_id: invitation.company_id,
          user_id: user.id,
          user_email: userEmail,
          action: 'team_invitation_accepted',
          entity_type: 'company_invitation',
          entity_id: invitation.id,
          entity_name: fullName || userEmail,
          details: {
            invitation_id: invitation.id,
            email: userEmail,
            role: invitationRole,
            accepted_at: acceptedAt,
          },
        })

    if (auditError) {
      console.error(
        'Invitation accepted but audit logging failed:',
        auditError,
      )
    }

    return jsonResponse(request, {
      success: true,
      accepted: true,
      alreadyAccepted: invitationWasAlreadyAccepted,
      message: invitationWasAlreadyAccepted
        ? 'Your company invitation and profile have been restored.'
        : 'Your company invitation has been accepted.',
      invitationId: invitation.id,
      companyId: invitation.company_id,
      role: invitationRole,
      profile: acceptedProfile,
    })
  } catch (error) {
    console.error(
      'Invitation acceptance failed:',
      error,
    )

    return jsonResponse(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : 'The invitation could not be accepted.',
      },
      500,
    )
  }
})