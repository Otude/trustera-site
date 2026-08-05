import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins = new Set([
  'https://trust.jemadi.co.uk',
  'http://localhost:5173',
  'http://localhost:4173',
])

const allowedInvitationActions = new Set([
  'cancel',
  'resend',
])

const allowedRoles = new Set([
  'admin',
  'manager',
  'compliance_officer',
  'staff',
  'viewer',
  'worker',
])

const INVITATION_EXPIRY_DAYS = 7
const PRODUCTION_REDIRECT_URL =
  'https://trust.jemadi.co.uk/login'

type ManageInvitationRequest = {
  invitationId?: string
  companyId?: string
  action?: 'cancel' | 'resend'
}

type JsonBody = Record<string, unknown>

type InvitationRecord = {
  id: string
  company_id: string
  email: string
  full_name: string | null
  role: string
  status: string
  invited_by: string | null
  auth_user_id: string | null
  invited_at: string | null
  expires_at: string | null
  accepted_at: string | null
  cancelled_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string | null
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
          'The invitation management service is not configured correctly.',
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

  async function getProfileById(userId: string) {
    const {
      data,
      error,
    } = await adminClient
      .from('profiles')
      .select(
        'id, company_id, email, full_name, role',
      )
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      throw error
    }

    return data
  }

  async function getPlatformAdmin(userId: string) {
    const {
      data,
      error,
    } = await adminClient
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      throw error
    }

    return data
  }

  async function deleteInvitationAuthUser(
    invitation: InvitationRecord,
  ) {
    if (!invitation.auth_user_id) {
      return {
        deleted: false,
        reason: 'no_auth_user',
      }
    }

    const {
      data: existingProfile,
      error: profileError,
    } = await adminClient
      .from('profiles')
      .select('id, company_id, email')
      .eq('id', invitation.auth_user_id)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    if (existingProfile) {
      return {
        deleted: false,
        reason: 'active_profile_exists',
      }
    }

    const { error } =
      await adminClient.auth.admin.deleteUser(
        invitation.auth_user_id,
      )

    if (!error) {
      return {
        deleted: true,
        reason: null,
      }
    }

    const message = String(
      error.message || '',
    ).toLowerCase()

    if (
      message.includes('user not found') ||
      message.includes('not found')
    ) {
      return {
        deleted: false,
        reason: 'already_missing',
      }
    }

    throw error
  }

  async function recordAuditLog({
    companyId,
    userId,
    userEmail,
    action,
    invitation,
    details = {},
  }: {
    companyId: string
    userId: string
    userEmail: string | null
    action: string
    invitation: InvitationRecord
    details?: Record<string, unknown>
  }) {
    const { error } = await adminClient
      .from('audit_logs')
      .insert({
        company_id: companyId,
        user_id: userId,
        user_email: userEmail,
        action,
        entity_type: 'company_invitation',
        entity_id: invitation.id,
        entity_name:
          invitation.full_name ||
          invitation.email,
        details: {
          invitation_id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          ...details,
        },
      })

    if (error) {
      console.error(
        'Invitation action succeeded but audit logging failed:',
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

    let body: ManageInvitationRequest

    try {
      body =
        (await request.json()) as ManageInvitationRequest
    } catch {
      return jsonResponse(
        request,
        {
          error: 'The request body is not valid JSON.',
        },
        400,
      )
    }

    const invitationId = String(
      body.invitationId || '',
    ).trim()

    const requestedCompanyId = String(
      body.companyId || '',
    ).trim()

    const action = String(
      body.action || '',
    )
      .trim()
      .toLowerCase()

    if (!invitationId) {
      return jsonResponse(
        request,
        {
          error: 'An invitation ID is required.',
        },
        400,
      )
    }

    if (
      !allowedInvitationActions.has(action)
    ) {
      return jsonResponse(
        request,
        {
          error:
            'The selected invitation action is not supported.',
        },
        400,
      )
    }

    const [
      callerProfile,
      platformAdmin,
    ] = await Promise.all([
      getProfileById(user.id),
      getPlatformAdmin(user.id),
    ])

    const isPlatformAdmin = Boolean(
      platformAdmin?.user_id,
    )

    const callerRole = normaliseRole(
      callerProfile?.role,
    )

    const isCompanyAdmin =
      callerRole === 'admin'

    if (!isPlatformAdmin && !isCompanyAdmin) {
      return jsonResponse(
        request,
        {
          error:
            'You are not authorised to manage company invitations.',
        },
        403,
      )
    }

    const {
      data: invitation,
      error: invitationError,
    } = await adminClient
      .from('company_invitations')
      .select(`
        id,
        company_id,
        email,
        full_name,
        role,
        status,
        invited_by,
        auth_user_id,
        invited_at,
        expires_at,
        accepted_at,
        cancelled_at,
        revoked_at,
        created_at,
        updated_at
      `)
      .eq('id', invitationId)
      .maybeSingle()

    if (invitationError) {
      throw invitationError
    }

    if (!invitation) {
      return jsonResponse(
        request,
        {
          error: 'Invitation not found.',
        },
        404,
      )
    }

    const invitationRecord =
      invitation as InvitationRecord

    if (
      requestedCompanyId &&
      invitationRecord.company_id !==
        requestedCompanyId
    ) {
      return jsonResponse(
        request,
        {
          error:
            'The invitation does not belong to the selected company.',
        },
        403,
      )
    }

    if (
      !isPlatformAdmin &&
      (
        !callerProfile?.company_id ||
        callerProfile.company_id !==
          invitationRecord.company_id
      )
    ) {
      return jsonResponse(
        request,
        {
          error:
            'You cannot manage invitations for another organisation.',
        },
        403,
      )
    }

    const callerEmail = normaliseEmail(
      user.email ||
        callerProfile?.email ||
        '',
    )

    if (action === 'cancel') {
      if (
        invitationRecord.status !== 'pending'
      ) {
        return jsonResponse(
          request,
          {
            error:
              'Only a pending invitation can be cancelled.',
          },
          409,
        )
      }

      const cancelledAt =
        new Date().toISOString()

      const {
        data: cancelledInvitation,
        error: cancellationError,
      } = await adminClient
        .from('company_invitations')
        .update({
          status: 'cancelled',
          cancelled_at: cancelledAt,
          updated_at: cancelledAt,
        })
        .eq('id', invitationRecord.id)
        .eq(
          'company_id',
          invitationRecord.company_id,
        )
        .eq('status', 'pending')
        .select(`
          id,
          company_id,
          email,
          role,
          status,
          auth_user_id,
          cancelled_at
        `)
        .maybeSingle()

      if (cancellationError) {
        throw cancellationError
      }

      if (!cancelledInvitation) {
        return jsonResponse(
          request,
          {
            error:
              'The invitation is no longer pending.',
          },
          409,
        )
      }

      let authUserDeletion = {
        deleted: false,
        reason: 'not_attempted',
      }

      try {
        authUserDeletion =
          await deleteInvitationAuthUser(
            invitationRecord,
          )
      } catch (error) {
        console.error(
          'Invitation was cancelled but the provisional Auth user could not be removed:',
          error,
        )
      }

      await recordAuditLog({
        companyId:
          invitationRecord.company_id,
        userId: user.id,
        userEmail:
          callerEmail || null,
        action:
          'team_invitation_cancelled',
        invitation: invitationRecord,
        details: {
          cancelled_at: cancelledAt,
          auth_user_deleted:
            authUserDeletion.deleted,
          auth_user_delete_reason:
            authUserDeletion.reason,
        },
      })

      return jsonResponse(request, {
        success: true,
        cancelled: true,
        message:
          `The invitation for ${invitationRecord.email} has been cancelled.`,
        invitationId:
          invitationRecord.id,
        companyId:
          invitationRecord.company_id,
        authUserId:
          invitationRecord.auth_user_id,
        authUserDeleted:
          authUserDeletion.deleted,
        authUserDeleteReason:
          authUserDeletion.reason,
      })
    }

    if (
      invitationRecord.status === 'accepted'
    ) {
      return jsonResponse(
        request,
        {
          error:
            'An accepted invitation cannot be resent.',
        },
        409,
      )
    }

    if (
      ![
        'pending',
        'expired',
        'cancelled',
        'revoked',
      ].includes(
        invitationRecord.status,
      )
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This invitation cannot be resent in its current status.',
        },
        409,
      )
    }

    const invitationRole = normaliseRole(
      invitationRecord.role,
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

    const {
      data: existingProfile,
      error: existingProfileError,
    } = await adminClient
      .from('profiles')
      .select('id, company_id, email')
      .ilike(
        'email',
        normaliseEmail(
          invitationRecord.email,
        ),
      )
      .maybeSingle()

    if (existingProfileError) {
      throw existingProfileError
    }

    if (existingProfile) {
      return jsonResponse(
        request,
        {
          error:
            existingProfile.company_id ===
            invitationRecord.company_id
              ? 'This user already belongs to the company.'
              : 'A Trustera profile already exists for this email address.',
        },
        409,
      )
    }

    try {
      await deleteInvitationAuthUser(
        invitationRecord,
      )
    } catch (error) {
      return jsonResponse(
        request,
        {
          error:
            error instanceof Error
              ? error.message
              : 'The previous invitation account could not be removed.',
        },
        500,
      )
    }

    const {
      data: company,
      error: companyError,
    } = await adminClient
      .from('companies')
      .select('id, name, status')
      .eq(
        'id',
        invitationRecord.company_id,
      )
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
            'This company cannot resend invitations in its current status.',
        },
        409,
      )
    }

    const resentAt =
      new Date().toISOString()

    const expiresAt =
      calculateExpiryDate()

    const {
      data: authInvite,
      error: authInviteError,
    } =
      await adminClient.auth.admin.inviteUserByEmail(
        normaliseEmail(
          invitationRecord.email,
        ),
        {
          redirectTo:
            PRODUCTION_REDIRECT_URL,
          data: {
            full_name:
              invitationRecord.full_name ||
              '',
            company_id:
              invitationRecord.company_id,
            company_name:
              company.name,
            role: invitationRole,
            invitation_id:
              invitationRecord.id,
            invited_by: user.id,
            invited_by_email:
              callerEmail || null,
          },
        },
      )

    if (
      authInviteError ||
      !authInvite.user
    ) {
      throw (
        authInviteError ??
        new Error(
          'Supabase did not return an invited user.',
        )
      )
    }

    const {
      data: updatedInvitation,
      error: invitationUpdateError,
    } = await adminClient
      .from('company_invitations')
      .update({
        status: 'pending',
        auth_user_id:
          authInvite.user.id,
        invited_by: user.id,
        invited_at: resentAt,
        expires_at: expiresAt,
        accepted_at: null,
        cancelled_at: null,
        revoked_at: null,
        updated_at: resentAt,
      })
      .eq('id', invitationRecord.id)
      .eq(
        'company_id',
        invitationRecord.company_id,
      )
      .select(`
        id,
        company_id,
        email,
        role,
        status,
        auth_user_id,
        invited_at,
        expires_at
      `)
      .maybeSingle()

    if (
      invitationUpdateError ||
      !updatedInvitation
    ) {
      try {
        await adminClient.auth.admin.deleteUser(
          authInvite.user.id,
        )
      } catch (rollbackError) {
        console.error(
          'Unable to roll back resent Auth invitation:',
          rollbackError,
        )
      }

      throw (
        invitationUpdateError ??
        new Error(
          'The resent invitation could not be saved.',
        )
      )
    }

    await recordAuditLog({
      companyId:
        invitationRecord.company_id,
      userId: user.id,
      userEmail:
        callerEmail || null,
      action:
        'team_invitation_resent',
      invitation: invitationRecord,
      details: {
        resent_at: resentAt,
        expires_at: expiresAt,
        auth_user_id:
          authInvite.user.id,
      },
    })

    return jsonResponse(request, {
      success: true,
      resent: true,
      message:
        `The invitation has been resent to ${invitationRecord.email}.`,
      invitationId:
        invitationRecord.id,
      companyId:
        invitationRecord.company_id,
      invitedUserId:
        authInvite.user.id,
      expiresAt,
    })
  } catch (error) {
    console.error(
      'Invitation management failed:',
      error,
    )

    return jsonResponse(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : 'The invitation action could not be completed.',
      },
      500,
    )
  }
})