import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins = new Set([
  'https://trust.jemadi.co.uk',
  'http://localhost:5173',
  'http://localhost:4173',
])

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

    const email = String(user.email || '')
      .trim()
      .toLowerCase()

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
     * First try to locate the invitation using auth_user_id.
     * Fall back to email for older invitations created before
     * auth_user_id was saved correctly.
     */
    let { data: invitation, error: invitationError } =
      await adminClient
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
        .maybeSingle()

    if (invitationError) {
      throw invitationError
    }

    if (!invitation) {
      const {
        data: emailInvitation,
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
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle()

      if (emailInvitationError) {
        throw emailInvitationError
      }

      invitation = emailInvitation
    }

    /*
     * This makes the function idempotent.
     * It can safely run every time the user signs in.
     */
    if (!invitation) {
      return jsonResponse(request, {
        success: true,
        accepted: false,
        message:
          'No pending invitation exists for this account.',
      })
    }

    if (
      String(invitation.email || '')
        .trim()
        .toLowerCase() !== email
    ) {
      return jsonResponse(
        request,
        {
          error:
            'This invitation does not belong to the authenticated account.',
        },
        403,
      )
    }

    const acceptedAt = new Date().toISOString()

    /*
     * Ensure the authenticated profile is connected to the
     * company and role recorded in the invitation.
     */
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert(
        {
          id: user.id,
          company_id: invitation.company_id,
          email,
          full_name:
            invitation.full_name ||
            user.user_metadata?.full_name ||
            null,
          role: invitation.role || 'staff',
        },
        {
          onConflict: 'id',
        },
      )

    if (profileError) {
      throw profileError
    }

    const { data: acceptedInvitation, error: updateError } =
      await adminClient
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
          accepted_at
        `)
        .single()

    if (updateError) {
      throw updateError
    }

    return jsonResponse(request, {
      success: true,
      accepted: true,
      message: 'Invitation accepted successfully.',
      invitation: acceptedInvitation,
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