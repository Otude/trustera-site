import { createClient } from '@supabase/supabase-js'

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

const companyAdminAssignableRoles = new Set([
  'manager',
  'compliance_officer',
  'staff',
  'viewer',
  'worker',
])

const INVITATION_EXPIRY_DAYS = 7

type InviteRequest = {
  companyId?: string
  email?: string
  fullName?: string
  role?: string
}

type JsonBody = Record<string, unknown>

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

function normaliseEmail(value?: string) {
  return value?.trim().toLowerCase() ?? ''
}

function normaliseRole(value?: string) {
  return value?.trim().toLowerCase() || 'staff'
}

function calculateExpiryDate() {
  return new Date(
    Date.now() +
      INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
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
          'The invitation service is not configured correctly.',
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

  let createdInvitationId: string | null = null
  let invitedAuthUserId: string | null = null

  async function revokeCreatedInvitation() {
    if (!createdInvitationId) return

    const { error } = await adminClient
      .from('company_invitations')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', createdInvitationId)

    if (error) {
      console.error(
        'Failed to revoke invitation during rollback:',
        error,
      )
    }
  }

  async function removeCreatedAuthUser() {
    if (!invitedAuthUserId) return

    const { error } =
      await adminClient.auth.admin.deleteUser(
        invitedAuthUserId,
      )

    if (error) {
      console.error(
        'Failed to remove invited auth user during rollback:',
        error,
      )
    }
  }

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

    const { data: callerProfile, error: profileError } =
      await adminClient
        .from('profiles')
        .select(
          'id, company_id, email, full_name, role',
        )
        .eq('id', user.id)
        .maybeSingle()

    if (profileError) {
      throw profileError
    }

    const {
      data: platformAdmin,
      error: platformAdminError,
    } = await adminClient
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (platformAdminError) {
      throw platformAdminError
    }

    const isPlatformAdmin = Boolean(platformAdmin)

    const callerRole =
      callerProfile?.role?.trim().toLowerCase() ?? ''

    const isCompanyAdmin = callerRole === 'admin'

    if (!isPlatformAdmin && !isCompanyAdmin) {
      return jsonResponse(
        request,
        {
          error:
            'You are not authorised to invite team members.',
        },
        403,
      )
    }

    let body: InviteRequest

    try {
      body = (await request.json()) as InviteRequest
    } catch {
      return jsonResponse(
        request,
        {
          error: 'The request body is not valid JSON.',
        },
        400,
      )
    }

    const email = normaliseEmail(body.email)
    const fullName = body.fullName?.trim() ?? ''
    const requestedRole = normaliseRole(body.role)

    if (!email) {
      return jsonResponse(
        request,
        {
          error: 'An email address is required.',
        },
        400,
      )
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(
        request,
        {
          error: 'Enter a valid email address.',
        },
        400,
      )
    }

    const callerEmail = normaliseEmail(
      user.email ?? callerProfile?.email ?? '',
    )

    if (callerEmail && email === callerEmail) {
      return jsonResponse(
        request,
        {
          error: 'You cannot invite yourself.',
        },
        400,
      )
    }

    if (!allowedRoles.has(requestedRole)) {
      return jsonResponse(
        request,
        {
          error: 'The selected role is not valid.',
        },
        400,
      )
    }

    if (
      !isPlatformAdmin &&
      !companyAdminAssignableRoles.has(requestedRole)
    ) {
      return jsonResponse(
        request,
        {
          error:
            'Only a Trustera platform administrator can assign the selected role.',
        },
        403,
      )
    }

    let companyId =
      callerProfile?.company_id ?? null

    if (isPlatformAdmin && body.companyId?.trim()) {
      companyId = body.companyId.trim()
    }

    if (!companyId) {
      return jsonResponse(
        request,
        {
          error:
            'The invitation is not assigned to a company.',
        },
        400,
      )
    }

    if (
      !isPlatformAdmin &&
      companyId !== callerProfile?.company_id
    ) {
      return jsonResponse(
        request,
        {
          error:
            'You cannot invite users to another organisation.',
        },
        403,
      )
    }

    const { data: company, error: companyError } =
      await adminClient
        .from('companies')
        .select('id, name, status')
        .eq('id', companyId)
        .maybeSingle()

    if (companyError) {
      throw companyError
    }

    if (!company) {
      return jsonResponse(
        request,
        {
          error: 'Company not found.',
        },
        404,
      )
    }

    const companyStatus = String(
      company.status ?? '',
    ).toLowerCase()

    if (
      !['onboarding', 'active'].includes(
        companyStatus,
      )
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This company cannot invite users in its current status.',
        },
        400,
      )
    }

    const {
      data: existingProfiles,
      error: existingProfileError,
    } = await adminClient
      .from('profiles')
      .select('id, email, company_id')
      .ilike('email', email)
      .limit(1)

    if (existingProfileError) {
      throw existingProfileError
    }

    const existingProfile =
      existingProfiles?.[0] ?? null

    if (existingProfile) {
      return jsonResponse(
        request,
        {
          error:
            'A Trustera profile already exists for this email address.',
        },
        409,
      )
    }

    const {
      data: pendingInvitations,
      error: pendingInvitationError,
    } = await adminClient
      .from('company_invitations')
      .select('id, status, expires_at')
      .eq('company_id', companyId)
      .ilike('email', email)
      .eq('status', 'pending')
      .limit(1)

    if (pendingInvitationError) {
      throw pendingInvitationError
    }

    const existingPendingInvitation =
      pendingInvitations?.[0] ?? null

    if (existingPendingInvitation) {
      const expiryDate =
        existingPendingInvitation.expires_at
          ? new Date(
              existingPendingInvitation.expires_at,
            )
          : null

      const isExpired =
        expiryDate !== null &&
        !Number.isNaN(expiryDate.getTime()) &&
        expiryDate.getTime() <= Date.now()

      if (!isExpired) {
        return jsonResponse(
          request,
          {
            error:
              'A pending invitation already exists for this email address.',
          },
          409,
        )
      }

      const {
        error: expireOldInvitationError,
      } = await adminClient
        .from('company_invitations')
        .update({
          status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPendingInvitation.id)

      if (expireOldInvitationError) {
        throw expireOldInvitationError
      }
    }

    const expiresAt = calculateExpiryDate()

    const {
      data: invitation,
      error: invitationError,
    } = await adminClient
      .from('company_invitations')
      .insert({
        company_id: companyId,
        email,
        full_name: fullName || null,
        role: requestedRole,
        invited_by: user.id,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (invitationError || !invitation) {
      throw (
        invitationError ??
        new Error(
          'The invitation record could not be created.',
        )
      )
    }

    createdInvitationId = invitation.id

    const {
      data: authInvite,
      error: inviteError,
    } =
      await adminClient.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo:
            'https://trust.jemadi.co.uk/login',
          data: {
            full_name: fullName,
            company_id: companyId,
            company_name: company.name,
            role: requestedRole,
            invitation_id: invitation.id,
            invited_by: user.id,
            invited_by_email: callerEmail || null,
          },
        },
      )

    if (inviteError || !authInvite.user) {
      await revokeCreatedInvitation()

      throw (
        inviteError ??
        new Error(
          'Supabase did not return an invited user.',
        )
      )
    }

    invitedAuthUserId = authInvite.user.id

    const {
      error: profileInsertError,
    } = await adminClient
      .from('profiles')
      .upsert(
        {
          id: invitedAuthUserId,
          company_id: companyId,
          email,
          full_name: fullName || null,
          role: requestedRole,
        },
        {
          onConflict: 'id',
        },
      )

    if (profileInsertError) {
      await removeCreatedAuthUser()
      await revokeCreatedInvitation()

      throw profileInsertError
    }

    const {
      error: invitationUpdateError,
    } = await adminClient
      .from('company_invitations')
      .update({
        auth_user_id: invitedAuthUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)

    if (invitationUpdateError) {
      const { error: profileDeleteError } =
        await adminClient
          .from('profiles')
          .delete()
          .eq('id', invitedAuthUserId)

      if (profileDeleteError) {
        console.error(
          'Failed to remove profile during rollback:',
          profileDeleteError,
        )
      }

      await removeCreatedAuthUser()
      await revokeCreatedInvitation()

      throw invitationUpdateError
    }

    const { error: auditError } =
      await adminClient.from('audit_logs').insert({
        company_id: companyId,
        user_id: user.id,
        action: 'team_member_invited',
        entity_type: 'profile',
        entity_id: invitedAuthUserId,
        details: {
          invitation_id: invitation.id,
          email,
          full_name: fullName || null,
          role: requestedRole,
          invited_by: user.id,
          invited_by_email: callerEmail || null,
        },
      })

    if (auditError) {
      console.error(
        'Invitation succeeded but audit logging failed:',
        auditError,
      )
    }

    return jsonResponse(request, {
      success: true,
      message: `Invitation sent to ${email}.`,
      invitationId: invitation.id,
      invitedUserId: invitedAuthUserId,
      expiresAt,
    })
  } catch (error) {
    console.error(
      'Invitation function failed:',
      error,
    )

    return jsonResponse(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : 'The invitation could not be sent.',
      },
      500,
    )
  }
})