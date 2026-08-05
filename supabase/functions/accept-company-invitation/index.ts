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

type JsonBody = Record<string, unknown>

type CompanyInvitation = {
  id: string
  company_id: string
  email: string | null
  full_name: string | null
  role: string | null
  status: string | null
  auth_user_id: string | null
  expires_at: string | null
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
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function normaliseRole(value?: string | null) {
  const role = String(value ?? '')
    .trim()
    .toLowerCase()

  return allowedRoles.has(role) ? role : 'staff'
}

function invitationHasExpired(
  expiresAt?: string | null,
) {
  if (!expiresAt) {
    return false
  }

  const expiryDate = new Date(expiresAt)

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

    const email = normaliseEmail(user.email)

    if (!email) {
      return jsonResponse(
        request,
        {
          error:
            'The authenticated account does not have an email address.',
        },
        400,
      )
    }

    /*
     * Prefer the invitation explicitly linked to this Auth user.
     */
    const {
      data: linkedInvitationRows,
      error: linkedInvitationError,
    } = await adminClient
      .from('company_invitations')
      .select(`
        id,
        company_id,
        email,
        full_name,
        role,
        status,
        auth_user_id,
        expires_at
      `)
      .eq('auth_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', {
        ascending: false,
      })
      .limit(1)

    if (linkedInvitationError) {
      throw linkedInvitationError
    }

    let invitation =
      (linkedInvitationRows?.[0] ??
        null) as CompanyInvitation | null

    /*
     * Legacy fallback:
     * Older invitations may not have auth_user_id populated.
     *
     * Only use an email-matched invitation where auth_user_id
     * is still null. This prevents accepting an invitation
     * already linked to another Auth account.
     */
    if (!invitation) {
      const {
        data: emailInvitationRows,
        error: emailInvitationError,
      } = await adminClient
        .from('company_invitations')
        .select(`
          id,
          company_id,
          email,
          full_name,
          role,
          status,
          auth_user_id,
          expires_at
        `)
        .ilike('email', email)
        .eq('status', 'pending')
        .is('auth_user_id', null)
        .order('created_at', {
          ascending: false,
        })
        .limit(1)

      if (emailInvitationError) {
        throw emailInvitationError
      }

      invitation =
        (emailInvitationRows?.[0] ??
          null) as CompanyInvitation | null
    }

    /*
     * Idempotent behaviour:
     * this function can run after every successful login.
     */
    if (!invitation) {
      const {
        data: existingProfile,
        error: existingProfileError,
      } = await adminClient
        .from('profiles')
        .select(
          'id, company_id, email, full_name, role',
        )
        .eq('id', user.id)
        .maybeSingle()

      if (existingProfileError) {
        throw existingProfileError
      }

      return jsonResponse(request, {
        success: true,
        accepted: false,
        alreadyConfigured: Boolean(existingProfile),
        message: existingProfile
          ? 'This account is already configured.'
          : 'No pending invitation exists for this account.',
        profile: existingProfile ?? null,
      })
    }

    const invitationEmail = normaliseEmail(
      invitation.email,
    )

    if (!invitationEmail || invitationEmail !== email) {
      return jsonResponse(
        request,
        {
          error:
            'This invitation does not belong to the authenticated account.',
        },
        403,
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
            'This invitation is linked to a different authenticated account.',
        },
        403,
      )
    }

    if (!invitation.company_id) {
      return jsonResponse(
        request,
        {
          error:
            'The invitation is not assigned to a company.',
        },
        400,
      )
    }

    if (invitationHasExpired(invitation.expires_at)) {
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
        throw expiryUpdateError
      }

      return jsonResponse(
        request,
        {
          error:
            'This invitation has expired. Ask an administrator to send a new invitation.',
          expired: true,
        },
        410,
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
            'The company associated with this invitation no longer exists.',
        },
        404,
      )
    }

    const companyStatus = String(
      company.status ?? '',
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
            'This company cannot accept new users in its current status.',
        },
        400,
      )
    }

    const invitedRole = normaliseRole(
      invitation.role,
    )

    /*
     * Check whether this Auth user already has a profile.
     *
     * Never silently move an existing profile from one
     * company to another.
     */
    const {
      data: existingProfile,
      error: existingProfileError,
    } = await adminClient
      .from('profiles')
      .select(
        'id, company_id, email, full_name, role',
      )
      .eq('id', user.id)
      .maybeSingle()

    if (existingProfileError) {
      throw existingProfileError
    }

    if (
      existingProfile?.company_id &&
      existingProfile.company_id !==
        invitation.company_id
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This account already belongs to another company.',
        },
        409,
      )
    }

    /*
     * Also prevent duplicate profiles for the same email
     * under a different Auth user ID.
     */
    const {
      data: matchingEmailProfiles,
      error: matchingEmailProfileError,
    } = await adminClient
      .from('profiles')
      .select('id, company_id, email')
      .ilike('email', email)
      .neq('id', user.id)
      .limit(1)

    if (matchingEmailProfileError) {
      throw matchingEmailProfileError
    }

    const duplicateEmailProfile =
      matchingEmailProfiles?.[0] ?? null

    if (duplicateEmailProfile) {
      return jsonResponse(
        request,
        {
          error:
            'A different Trustera account already uses this email address.',
        },
        409,
      )
    }

    const acceptedAt = new Date().toISOString()

    const profilePayload = {
      id: user.id,
      company_id: invitation.company_id,
      email,
      full_name:
        String(invitation.full_name ?? '').trim() ||
        String(
          user.user_metadata?.full_name ?? '',
        ).trim() ||
        null,
      role: invitedRole,
    }

    /*
     * The profiles table currently does not require or expose
     * an updated_at column, so it is intentionally omitted.
     */
    const {
      data: acceptedProfile,
      error: profileUpsertError,
    } = await adminClient
      .from('profiles')
      .upsert(profilePayload, {
        onConflict: 'id',
      })
      .select(
        'id, company_id, email, full_name, role',
      )
      .single()

    if (profileUpsertError) {
      throw profileUpsertError
    }

    /*
     * Mark the invitation accepted only if it remains pending.
     * maybeSingle() lets us handle a concurrent acceptance
     * without turning a harmless repeat into a server error.
     */
    const {
      data: acceptedInvitation,
      error: invitationUpdateError,
    } = await adminClient
      .from('company_invitations')
      .update({
        status: 'accepted',
        auth_user_id: user.id,
        accepted_at: acceptedAt,
        updated_at: acceptedAt,
      })
      .eq('id', invitation.id)
      .eq('status', 'pending')
      .select(`
        id,
        company_id,
        email,
        full_name,
        role,
        status,
        auth_user_id,
        accepted_at
      `)
      .maybeSingle()

    if (invitationUpdateError) {
      /*
       * Do not remove an existing profile that pre-dated this
       * function call. Only remove the profile if this call
       * created it and the invitation could not be accepted.
       */
      if (!existingProfile) {
        const { error: rollbackProfileError } =
          await adminClient
            .from('profiles')
            .delete()
            .eq('id', user.id)
            .eq(
              'company_id',
              invitation.company_id,
            )

        if (rollbackProfileError) {
          console.error(
            'Profile rollback failed after invitation update error:',
            rollbackProfileError,
          )
        }
      }

      throw invitationUpdateError
    }

    /*
     * If another request accepted it first, confirm its final
     * state rather than reporting a false failure.
     */
    let finalInvitation = acceptedInvitation

    if (!finalInvitation) {
      const {
        data: currentInvitation,
        error: currentInvitationError,
      } = await adminClient
        .from('company_invitations')
        .select(`
          id,
          company_id,
          email,
          full_name,
          role,
          status,
          auth_user_id,
          accepted_at
        `)
        .eq('id', invitation.id)
        .maybeSingle()

      if (currentInvitationError) {
        throw currentInvitationError
      }

      if (
        currentInvitation?.status !== 'accepted' ||
        currentInvitation.auth_user_id !== user.id
      ) {
        if (!existingProfile) {
          const { error: rollbackProfileError } =
            await adminClient
              .from('profiles')
              .delete()
              .eq('id', user.id)
              .eq(
                'company_id',
                invitation.company_id,
              )

          if (rollbackProfileError) {
            console.error(
              'Profile rollback failed after invitation state conflict:',
              rollbackProfileError,
            )
          }
        }

        return jsonResponse(
          request,
          {
            error:
              'The invitation could not be accepted because its status changed.',
          },
          409,
        )
      }

      finalInvitation = currentInvitation
    }

    const { error: auditError } =
      await adminClient
        .from('audit_logs')
        .insert({
          company_id: invitation.company_id,
          user_id: user.id,
          user_email: email,
          action: 'team_invitation_accepted',
          entity_type: 'company_invitation',
          entity_id: invitation.id,
          entity_name:
            profilePayload.full_name || email,
          details: {
            invitation_id: invitation.id,
            company_id: invitation.company_id,
            email,
            full_name: profilePayload.full_name,
            role: invitedRole,
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
      message: 'Invitation accepted successfully.',
      profile: acceptedProfile,
      invitation: finalInvitation,
    })
  } catch (error) {
    console.error(
      'Invitation acceptance function failed:',
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