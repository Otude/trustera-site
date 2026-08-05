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

const companyAdminAssignableRoles = new Set([
  'manager',
  'compliance_officer',
  'staff',
  'viewer',
  'worker',
])

const INVITATION_EXPIRY_DAYS = 7
const PRODUCTION_REDIRECT_URL =
  'https://trust.jemadi.co.uk/login'

type InviteRequest = {
  companyId?: string
  email?: string
  fullName?: string
  role?: string
  resend?: boolean
}

type JsonBody = Record<string, unknown>

type ExistingInvitation = {
  id: string
  status: string | null
  expires_at: string | null
  auth_user_id: string | null
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

function isExpired(value: string | null) {
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
  let createdAuthUserId: string | null = null

  async function markInvitationRevoked(
    invitationId: string,
  ) {
    const timestamp = new Date().toISOString()

    const { error } = await adminClient
      .from('company_invitations')
      .update({
        status: 'revoked',
        revoked_at: timestamp,
        updated_at: timestamp,
      })
      .eq('id', invitationId)

    if (error) {
      console.error(
        'Failed to revoke invitation:',
        error,
      )
    }
  }

  async function markInvitationExpired(
    invitationId: string,
  ) {
    const { error } = await adminClient
      .from('company_invitations')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitationId)
      .eq('status', 'pending')

    if (error) {
      throw error
    }
  }

  async function deleteAuthUser(
    userId: string | null,
  ) {
    if (!userId) {
      return
    }

    const { error } =
      await adminClient.auth.admin.deleteUser(userId)

    if (error) {
      console.error(
        'Failed to delete invited auth user:',
        error,
      )
    }
  }

  async function rollbackCreatedInvitation() {
    if (createdAuthUserId) {
      await deleteAuthUser(createdAuthUserId)
    }

    if (createdInvitationId) {
      await markInvitationRevoked(
        createdInvitationId,
      )
    }
  }

  async function recordAuditLog({
    companyId,
    userId,
    action,
    invitationId,
    email,
    fullName,
    role,
    invitedByEmail,
    previousInvitationId = null,
  }: {
    companyId: string
    userId: string
    action: string
    invitationId: string
    email: string
    fullName: string
    role: string
    invitedByEmail: string | null
    previousInvitationId?: string | null
  }) {
    const { error } = await adminClient
      .from('audit_logs')
      .insert({
        company_id: companyId,
        user_id: userId,
        action,
        entity_type: 'company_invitation',
        entity_id: invitationId,
        entity_name: fullName || email,
        details: {
          invitation_id: invitationId,
          previous_invitation_id:
            previousInvitationId,
          email,
          full_name: fullName || null,
          role,
          invited_by: userId,
          invited_by_email: invitedByEmail,
        },
      })

    if (error) {
      console.error(
        'Invitation succeeded but audit logging failed:',
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

    /*
     * Do not select profiles.updated_at here.
     * The current profiles table does not contain that column.
     */
    const {
      data: callerProfile,
      error: profileError,
    } = await adminClient
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

    const callerRole = String(
      callerProfile?.role ?? '',
    )
      .trim()
      .toLowerCase()

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
    const resend = body.resend === true

    if (!fullName) {
      return jsonResponse(
        request,
        {
          error:
            'The team member’s full name is required.',
        },
        400,
      )
    }

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
      !companyAdminAssignableRoles.has(
        requestedRole,
      )
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

    const {
      data: company,
      error: companyError,
    } = await adminClient
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

    /*
     * A completed profile means the person already has
     * Trustera access. No profiles row is created by this
     * invitation function.
     */
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
            existingProfile.company_id === companyId
              ? 'This user already belongs to your company.'
              : 'A Trustera profile already exists for this email address.',
        },
        409,
      )
    }

    const {
      data: pendingInvitationRows,
      error: pendingInvitationError,
    } = await adminClient
      .from('company_invitations')
      .select(
        'id, status, expires_at, auth_user_id',
      )
      .eq('company_id', companyId)
      .ilike('email', email)
      .eq('status', 'pending')
      .order('created_at', {
        ascending: false,
      })
      .limit(1)

    if (pendingInvitationError) {
      throw pendingInvitationError
    }

    const existingPendingInvitation =
      (pendingInvitationRows?.[0] ??
        null) as ExistingInvitation | null

    let previousInvitationId: string | null = null

    if (existingPendingInvitation) {
      previousInvitationId =
        existingPendingInvitation.id

      const pendingInvitationExpired = isExpired(
        existingPendingInvitation.expires_at,
      )

      if (
        !pendingInvitationExpired &&
        !resend
      ) {
        return jsonResponse(
          request,
          {
            error:
              'A pending invitation already exists for this email address.',
          },
          409,
        )
      }

      /*
       * Resending creates a fresh auth invitation and a fresh
       * company invitation record. The previous link will no
       * longer be treated as the current pending invitation.
       */
      if (resend) {
        await markInvitationRevoked(
          existingPendingInvitation.id,
        )
      } else {
        await markInvitationExpired(
          existingPendingInvitation.id,
        )
      }

      /*
       * An invitation-generated auth user has no completed
       * profile yet. Remove it before issuing a replacement
       * invitation so Supabase can create a fresh invite link.
       */
      if (existingPendingInvitation.auth_user_id) {
        await deleteAuthUser(
          existingPendingInvitation.auth_user_id,
        )
      }
    }

    const expiresAt = calculateExpiryDate()
    const invitedAt = new Date().toISOString()

    const {
      data: invitation,
      error: invitationError,
    } = await adminClient
      .from('company_invitations')
      .insert({
        company_id: companyId,
        email,
        full_name: fullName,
        role: requestedRole,
        invited_by: user.id,
        status: 'pending',
        invited_at: invitedAt,
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
          redirectTo: PRODUCTION_REDIRECT_URL,
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
      await rollbackCreatedInvitation()

      throw (
        inviteError ??
        new Error(
          'Supabase did not return an invited user.',
        )
      )
    }

    createdAuthUserId = authInvite.user.id

    /*
     * Important:
     * Do not create the profiles row here.
     *
     * The accept-company-invitation lifecycle should create
     * or update the profile only after the recipient signs in
     * and the invitation has been verified.
     */
    const {
      error: invitationUpdateError,
    } = await adminClient
      .from('company_invitations')
      .update({
        auth_user_id: createdAuthUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)
      .eq('status', 'pending')

    if (invitationUpdateError) {
      await rollbackCreatedInvitation()
      throw invitationUpdateError
    }

    await recordAuditLog({
      companyId,
      userId: user.id,
      action: resend
        ? 'team_invitation_resent'
        : 'team_member_invited',
      invitationId: invitation.id,
      email,
      fullName,
      role: requestedRole,
      invitedByEmail: callerEmail || null,
      previousInvitationId,
    })

    return jsonResponse(request, {
      success: true,
      resent: resend,
      message: resend
        ? `Invitation resent to ${email}.`
        : `Invitation sent to ${email}.`,
      invitationId: invitation.id,
      invitedUserId: createdAuthUserId,
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