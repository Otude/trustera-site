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

type InviteRequest = {
  companyId?: string
  email?: string
  fullName?: string
  role?: string
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
  body: Record<string, unknown>,
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: getCorsHeaders(request),
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      request,
      { error: 'Method not allowed.' },
      405,
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get(
      'SUPABASE_SERVICE_ROLE_KEY',
    )

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error(
        'Required Supabase environment variables are missing.',
      )
    }

    const authorization =
      request.headers.get('Authorization') ?? ''

    if (!authorization.startsWith('Bearer ')) {
      return jsonResponse(
        request,
        { error: 'Authentication is required.' },
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

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse(
        request,
        { error: 'Your session is invalid or expired.' },
        401,
      )
    }

    const { data: callerProfile, error: profileError } =
      await adminClient
        .from('profiles')
        .select('id, company_id, role')
        .eq('id', user.id)
        .maybeSingle()

    if (profileError) {
      throw profileError
    }

    const { data: platformAdmin } = await adminClient
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const isPlatformAdmin = Boolean(platformAdmin)
    const isCompanyAdmin =
      callerProfile?.role === 'admin'

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

    const body = (await request.json()) as InviteRequest

    const email = body.email
      ?.trim()
      .toLowerCase()

    const fullName = body.fullName?.trim() || ''
    const requestedRole = body.role?.trim() || 'staff'

    if (!email) {
      return jsonResponse(
        request,
        { error: 'An email address is required.' },
        400,
      )
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(
        request,
        { error: 'Enter a valid email address.' },
        400,
      )
    }

    if (!allowedRoles.has(requestedRole)) {
      return jsonResponse(
        request,
        { error: 'The selected role is not valid.' },
        400,
      )
    }

    let companyId = callerProfile?.company_id ?? null

    if (isPlatformAdmin && body.companyId) {
      companyId = body.companyId
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

    if (!isPlatformAdmin && requestedRole === 'admin') {
      return jsonResponse(
        request,
        {
          error:
            'Only a Trustera platform administrator can invite another company administrator.',
        },
        403,
      )
    }

    const { data: company, error: companyError } =
      await adminClient
        .from('companies')
        .select('id, name, status')
        .eq('id', companyId)
        .single()

    if (companyError || !company) {
      return jsonResponse(
        request,
        { error: 'Company not found.' },
        404,
      )
    }

    if (
      !['onboarding', 'active'].includes(company.status)
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

    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, email, company_id')
      .ilike('email', email)
      .maybeSingle()

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

    const { data: existingInvitation } =
      await adminClient
        .from('company_invitations')
        .select('id, status')
        .eq('company_id', companyId)
        .ilike('email', email)
        .eq('status', 'pending')
        .maybeSingle()

    if (existingInvitation) {
      return jsonResponse(
        request,
        {
          error:
            'A pending invitation already exists for this email address.',
        },
        409,
      )
    }

    const { data: invitation, error: invitationError } =
      await adminClient
        .from('company_invitations')
        .insert({
          company_id: companyId,
          email,
          full_name: fullName || null,
          role: requestedRole,
          invited_by: user.id,
          status: 'pending',
        })
        .select('id')
        .single()

    if (invitationError) {
      throw invitationError
    }

    const { data: authInvite, error: inviteError } =
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
          },
        },
      )

    if (inviteError || !authInvite.user) {
      await adminClient
        .from('company_invitations')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
        })
        .eq('id', invitation.id)

      throw inviteError ?? new Error(
        'Supabase did not return an invited user.',
      )
    }

    const invitedUserId = authInvite.user.id

    const { error: profileInsertError } =
      await adminClient
        .from('profiles')
        .upsert(
          {
            id: invitedUserId,
            company_id: companyId,
            email,
            role: requestedRole,
          },
          {
            onConflict: 'id',
          },
        )

    if (profileInsertError) {
      throw profileInsertError
    }

    const { error: invitationUpdateError } =
      await adminClient
        .from('company_invitations')
        .update({
          auth_user_id: invitedUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invitation.id)

    if (invitationUpdateError) {
      throw invitationUpdateError
    }

    return jsonResponse(request, {
      success: true,
      message: `Invitation sent to ${email}.`,
      invitationId: invitation.id,
    })
  } catch (error) {
    console.error('Invitation function failed:', error)

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