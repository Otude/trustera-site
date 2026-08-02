import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../supabase'

const INITIAL_INVITE_FORM = {
  fullName: '',
  email: '',
  role: 'staff',
}

const ROLE_OPTIONS = [
  {
    value: 'admin',
    label: 'Administrator',
    description:
      'Full company access, including team management and compliance records.',
  },
  {
    value: 'manager',
    label: 'Manager',
    description:
      'Can manage workers, documents, notifications and compliance activity.',
  },
  {
    value: 'staff',
    label: 'Staff',
    description:
      'Standard operational access with restricted administrative permissions.',
  },
]

const ROLE_LABELS = {
  admin: 'Administrator',
  manager: 'Manager',
  staff: 'Staff',
  worker: 'Worker',
}

const ROLE_BADGE_CLASSES = {
  admin:
    'border-purple-500/30 bg-purple-500/10 text-purple-200',
  manager:
    'border-blue-500/30 bg-blue-500/10 text-blue-200',
  staff:
    'border-slate-600 bg-slate-800 text-slate-200',
  worker:
    'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
}

const STATUS_BADGE_CLASSES = {
  active:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  suspended:
    'border-red-500/30 bg-red-500/10 text-red-200',
  pending:
    'border-amber-500/30 bg-amber-500/10 text-amber-200',
  expired:
    'border-slate-600 bg-slate-800 text-slate-300',
  cancelled:
    'border-red-500/30 bg-red-500/10 text-red-200',
  accepted:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
}

function normaliseRole(role) {
  const value = String(role || '').toLowerCase()

  if (['admin', 'manager', 'staff', 'worker'].includes(value)) {
    return value
  }

  return 'staff'
}

function normaliseStatus(status) {
  const value = String(status || '').toLowerCase()

  if (
    [
      'active',
      'suspended',
      'pending',
      'expired',
      'cancelled',
      'accepted',
    ].includes(value)
  ) {
    return value
  }

  return 'active'
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getInitials(name, email) {
  const source = String(name || '').trim()

  if (source) {
    const words = source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)

    return words
      .map((word) => word.charAt(0).toUpperCase())
      .join('')
  }

  return String(email || '?')
    .charAt(0)
    .toUpperCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function AlertMessage({ type = 'error', children }) {
  const classes =
    type === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border-red-500/30 bg-red-500/10 text-red-200'

  return (
    <div
      role={type === 'success' ? 'status' : 'alert'}
      className={`rounded-xl border px-4 py-3 text-sm ${classes}`}
    >
      {children}
    </div>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-xl">
        👥
      </div>

      <h3 className="mt-4 text-lg font-semibold text-white">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
  )
}

export default function TeamManagement({ profile, session }) {
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteForm, setInviteForm] = useState(
    INITIAL_INVITE_FORM,
  )
  const [inviting, setInviting] = useState(false)

  const [updatingMemberId, setUpdatingMemberId] =
    useState(null)
  const [cancellingInvitationId, setCancellingInvitationId] =
    useState(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const companyId = profile?.company_id || null
  const currentUserId =
    session?.user?.id || profile?.id || null
  const currentUserRole = normaliseRole(profile?.role)

  const canManageTeam = ['admin'].includes(currentUserRole)

  const clearMessages = useCallback(() => {
    setErrorMessage('')
    setSuccessMessage('')
  }, [])

  const recordAuditLog = useCallback(
    async ({
      action,
      entityType,
      entityId = null,
      entityName = null,
      details = {},
    }) => {
      if (!companyId || !currentUserId) return

      const { error } = await supabase
        .from('audit_logs')
        .insert({
          company_id: companyId,
          user_id: currentUserId,
          user_email:
            session?.user?.email ||
            profile?.email ||
            null,
          action,
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          details,
        })

      if (error) {
        console.warn('Audit log could not be recorded:', error)
      }
    },
    [
      companyId,
      currentUserId,
      profile?.email,
      session?.user?.email,
    ],
  )

  const loadTeamData = useCallback(
    async ({ silent = false } = {}) => {
      if (!companyId) {
        setMembers([])
        setInvitations([])
        setLoading(false)
        return
      }

      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      clearMessages()

      try {
        const [
          { data: profileData, error: profileError },
          { data: invitationData, error: invitationError },
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select(
              `
                id,
                company_id,
                email,
                full_name,
                role,
                created_at
              `,
            )
            .eq('company_id', companyId)
            .order('created_at', {
              ascending: true,
            }),

          supabase
            .from('company_invitations')
            .select(
              `
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
                created_at,
                updated_at
              `,
            )
            .eq('company_id', companyId)
            .order('invited_at', {
              ascending: false,
            }),
        ])

        if (profileError) {
          throw profileError
        }

        if (invitationError) {
          throw invitationError
        }

        setMembers(profileData || [])
        setInvitations(invitationData || [])
      } catch (error) {
        console.error('Team data could not be loaded:', error)

        setErrorMessage(
          error?.message ||
            'The team information could not be loaded.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [clearMessages, companyId],
  )

  useEffect(() => {
    loadTeamData()
  }, [loadTeamData])

  useEffect(() => {
    if (!companyId) return undefined

    const channel = supabase
      .channel(`team-management-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          loadTeamData({ silent: true })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_invitations',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          loadTeamData({ silent: true })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, loadTeamData])

  const pendingInvitations = useMemo(
    () =>
      invitations.filter(
        (invitation) =>
          normaliseStatus(invitation.status) === 'pending',
      ),
    [invitations],
  )

  const expiredInvitations = useMemo(
    () =>
      invitations.filter((invitation) => {
        const status = normaliseStatus(invitation.status)

        if (status === 'expired') return true

        if (
          status === 'pending' &&
          invitation.expires_at &&
          new Date(invitation.expires_at).getTime() <
            Date.now()
        ) {
          return true
        }

        return false
      }),
    [invitations],
  )

  const activeMembers = members

  const filteredMembers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return members.filter((member) => {
      const role = normaliseRole(member.role)

      const matchesSearch =
        !search ||
        String(member.full_name || '')
          .toLowerCase()
          .includes(search) ||
        String(member.email || '')
          .toLowerCase()
          .includes(search) ||
        ROLE_LABELS[role]
          .toLowerCase()
          .includes(search)

      const matchesRole =
        roleFilter === 'all' || role === roleFilter

      return matchesSearch && matchesRole
    })
  }, [members, roleFilter, searchTerm])

  function handleInviteChange(event) {
    const { name, value } = event.target

    setInviteForm((previous) => ({
      ...previous,
      [name]: value,
    }))

    clearMessages()
  }

  async function handleInviteSubmit(event) {
    event.preventDefault()

    if (inviting || !canManageTeam) return

    clearMessages()

    const payload = {
      companyId,
      fullName: inviteForm.fullName.trim(),
      email: inviteForm.email.trim().toLowerCase(),
      role: normaliseRole(inviteForm.role),
    }

    if (!payload.companyId) {
      setErrorMessage(
        'Your account is not connected to a company.',
      )
      return
    }

    if (!payload.fullName) {
      setErrorMessage(
        'Enter the team member’s full name.',
      )
      return
    }

    if (!payload.email || !isValidEmail(payload.email)) {
      setErrorMessage(
        'Enter a valid work email address.',
      )
      return
    }

    if (
      !['admin', 'manager', 'staff'].includes(payload.role)
    ) {
      setErrorMessage('Select a valid team role.')
      return
    }

    const existingMember = members.find(
      (member) =>
        String(member.email || '').toLowerCase() ===
        payload.email,
    )

    if (existingMember) {
      setErrorMessage(
        'A Trustera user with this email already belongs to your company.',
      )
      return
    }

    const existingInvitation = pendingInvitations.find(
      (invitation) =>
        String(invitation.email || '').toLowerCase() ===
        payload.email,
    )

    if (existingInvitation) {
      setErrorMessage(
        'A pending invitation already exists for this email address.',
      )
      return
    }

    setInviting(true)

    try {
      const { data, error } =
        await supabase.functions.invoke(
          'invite-company-user',
          {
            body: payload,
          },
        )

      if (error) {
        let message =
          error.message ||
          'The invitation could not be sent.'

        if (error.context) {
          try {
            const responseBody =
              await error.context.json()

            if (responseBody?.error) {
              message = responseBody.error
            }
          } catch {
            // Keep the original function error.
          }
        }

        throw new Error(message)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      setInviteForm(INITIAL_INVITE_FORM)
      setShowInviteForm(false)

      setSuccessMessage(
        `An invitation has been sent to ${payload.email}.`,
      )

      await loadTeamData({ silent: true })
    } catch (error) {
      console.error('Team invitation failed:', error)

      setErrorMessage(
        error?.message ||
          'The invitation could not be sent.',
      )
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(member, nextRole) {
    if (
      !canManageTeam ||
      updatingMemberId ||
      !companyId
    ) {
      return
    }

    const role = normaliseRole(nextRole)
    const previousRole = normaliseRole(member.role)

    if (role === previousRole) return

    if (
      !['admin', 'manager', 'staff'].includes(role)
    ) {
      setErrorMessage('That role is not supported.')
      return
    }

    if (member.id === currentUserId) {
      setErrorMessage(
        'You cannot change your own role from this screen.',
      )
      return
    }

    const confirmed = window.confirm(
      `Change ${member.full_name || member.email} from ${
        ROLE_LABELS[previousRole]
      } to ${ROLE_LABELS[role]}?`,
    )

    if (!confirmed) return

    clearMessages()
    setUpdatingMemberId(member.id)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', member.id)
        .eq('company_id', companyId)

      if (error) {
        throw error
      }

      await recordAuditLog({
        action: 'User Role Updated',
        entityType: 'profile',
        entityId: member.id,
        entityName:
          member.full_name || member.email,
        details: {
          email: member.email,
          previous_role: previousRole,
          new_role: role,
        },
      })

      setMembers((previous) =>
        previous.map((item) =>
          item.id === member.id
            ? {
                ...item,
                role,
              }
            : item,
        ),
      )

      setSuccessMessage(
        `${member.full_name || member.email} is now a ${
          ROLE_LABELS[role]
        }.`,
      )
    } catch (error) {
      console.error('Role update failed:', error)

      setErrorMessage(
        error?.message ||
          'The user’s role could not be updated.',
      )
    } finally {
      setUpdatingMemberId(null)
    }
  }

  async function handleCancelInvitation(invitation) {
    if (
      !canManageTeam ||
      cancellingInvitationId ||
      !companyId
    ) {
      return
    }

    const confirmed = window.confirm(
      `Cancel the pending invitation for ${invitation.email}?`,
    )

    if (!confirmed) return

    clearMessages()
    setCancellingInvitationId(invitation.id)

    try {
      const { error } = await supabase
        .from('company_invitations')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invitation.id)
        .eq('company_id', companyId)
        .eq('status', 'pending')

      if (error) {
        throw error
      }

      await recordAuditLog({
        action: 'Invitation Cancelled',
        entityType: 'company_invitation',
        entityId: invitation.id,
        entityName:
          invitation.full_name || invitation.email,
        details: {
          email: invitation.email,
          role: invitation.role,
        },
      })

      setInvitations((previous) =>
        previous.map((item) =>
          item.id === invitation.id
            ? {
                ...item,
                status: 'cancelled',
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
      )

      setSuccessMessage(
        `The invitation for ${invitation.email} has been cancelled.`,
      )
    } catch (error) {
      console.error(
        'Invitation cancellation failed:',
        error,
      )

      setErrorMessage(
        error?.message ||
          'The invitation could not be cancelled.',
      )
    } finally {
      setCancellingInvitationId(null)
    }
  }

  async function handleResendInvitation(invitation) {
    if (!canManageTeam || inviting) return

    clearMessages()
    setInviting(true)

    try {
      const { data, error } =
        await supabase.functions.invoke(
          'invite-company-user',
          {
            body: {
              companyId,
              fullName:
                invitation.full_name || '',
              email: String(
                invitation.email || '',
              ).toLowerCase(),
              role: normaliseRole(
                invitation.role,
              ),
              resend: true,
            },
          },
        )

      if (error) {
        let message =
          error.message ||
          'The invitation could not be resent.'

        if (error.context) {
          try {
            const responseBody =
              await error.context.json()

            if (responseBody?.error) {
              message = responseBody.error
            }
          } catch {
            // Keep original error.
          }
        }

        throw new Error(message)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      setSuccessMessage(
        `The invitation has been resent to ${invitation.email}.`,
      )

      await loadTeamData({ silent: true })
    } catch (error) {
      console.error(
        'Invitation resend failed:',
        error,
      )

      setErrorMessage(
        error?.message ||
          'The invitation could not be resent.',
      )
    } finally {
      setInviting(false)
    }
  }

  if (!profile) {
    return (
      <div className="p-6 text-slate-300">
        Loading your Trustera profile...
      </div>
    )
  }

  if (!companyId) {
    return (
      <div className="p-6">
        <AlertMessage>
          Your Trustera account is not connected to a company.
          Contact the platform administrator.
        </AlertMessage>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-400">
              Company administration
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Team Management
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              Invite colleagues, assign access levels and manage
              the users who belong to your organisation.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                loadTeamData({ silent: true })
              }
              disabled={refreshing}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold transition hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing
                ? 'Refreshing...'
                : 'Refresh'}
            </button>

            {canManageTeam && (
              <button
                type="button"
                onClick={() => {
                  clearMessages()
                  setShowInviteForm((previous) => !previous)
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
              >
                {showInviteForm
                  ? 'Close invite form'
                  : 'Invite team member'}
              </button>
            )}
          </div>
        </div>

        {!canManageTeam && (
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            You can view the company team, but only an
            administrator can invite users or change access
            permissions.
          </div>
        )}

        <div className="mt-6 space-y-3">
          {errorMessage && (
            <AlertMessage>
              {errorMessage}
            </AlertMessage>
          )}

          {successMessage && (
            <AlertMessage type="success">
              {successMessage}
            </AlertMessage>
          )}
        </div>

        {showInviteForm && canManageTeam && (
          <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl sm:p-7">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold">
                Invite a team member
              </h2>

              <p className="text-sm leading-6 text-slate-400">
                The user will receive an email invitation and
                will automatically be connected to your
                company when they sign in.
              </p>
            </div>

            <form
              onSubmit={handleInviteSubmit}
              className="mt-6 grid gap-5 lg:grid-cols-3"
              noValidate
            >
              <div>
                <label
                  htmlFor="invite-full-name"
                  className="mb-2 block text-sm font-semibold"
                >
                  Full name *
                </label>

                <input
                  id="invite-full-name"
                  type="text"
                  name="fullName"
                  value={inviteForm.fullName}
                  onChange={handleInviteChange}
                  autoComplete="name"
                  disabled={inviting}
                  placeholder="Jane Smith"
                  className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="invite-email"
                  className="mb-2 block text-sm font-semibold"
                >
                  Work email *
                </label>

                <input
                  id="invite-email"
                  type="email"
                  name="email"
                  value={inviteForm.email}
                  onChange={handleInviteChange}
                  autoComplete="email"
                  inputMode="email"
                  disabled={inviting}
                  placeholder="jane@company.co.uk"
                  className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="invite-role"
                  className="mb-2 block text-sm font-semibold"
                >
                  Access role *
                </label>

                <select
                  id="invite-role"
                  name="role"
                  value={inviteForm.role}
                  onChange={handleInviteChange}
                  disabled={inviting}
                  className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option
                      key={role.value}
                      value={role.value}
                    >
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3">
                <div className="grid gap-3 md:grid-cols-3">
                  {ROLE_OPTIONS.map((role) => {
                    const selected =
                      inviteForm.role === role.value

                    return (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() =>
                          setInviteForm((previous) => ({
                            ...previous,
                            role: role.value,
                          }))
                        }
                        disabled={inviting}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-800 bg-slate-950 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-semibold">
                          {role.label}
                        </div>

                        <div className="mt-2 text-xs leading-5 text-slate-400">
                          {role.description}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3 lg:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false)
                    setInviteForm(INITIAL_INVITE_FORM)
                    clearMessages()
                  }}
                  disabled={inviting}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-700 px-5 py-2 font-semibold transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-blue-600 px-6 py-2 font-semibold shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inviting
                    ? 'Sending invitation...'
                    : 'Send invitation'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">
              Total members
            </div>

            <div className="mt-2 text-3xl font-bold">
              {members.length}
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Registered company users
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">
              Active members
            </div>

            <div className="mt-2 text-3xl font-bold text-emerald-300">
              {activeMembers.length}
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Accounts currently enabled
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">
              Pending invitations
            </div>

            <div className="mt-2 text-3xl font-bold text-amber-300">
              {pendingInvitations.length}
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Awaiting user acceptance
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">
              Suspended
            </div>

            <div className="mt-2 text-3xl font-bold text-red-300">
              0
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Access temporarily disabled
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-bold">
                Company users
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                View account status and control access levels.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="team-search"
                  className="sr-only"
                >
                  Search team
                </label>

                <input
                  id="team-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                  placeholder="Search name or email..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm outline-none transition focus:border-blue-500 sm:min-w-[260px]"
                />
              </div>

              <div>
                <label
                  htmlFor="team-role-filter"
                  className="sr-only"
                >
                  Filter by role
                </label>

                <select
                  id="team-role-filter"
                  value={roleFilter}
                  onChange={(event) =>
                    setRoleFilter(event.target.value)
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm outline-none transition focus:border-blue-500"
                >
                  <option value="all">All roles</option>
                  <option value="admin">
                    Administrators
                  </option>
                  <option value="manager">
                    Managers
                  </option>
                  <option value="staff">Staff</option>
                  <option value="worker">Workers</option>
                </select>
              </div>

            </div>
          </div>

          <div className="mt-6">
            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 px-6 py-12 text-center text-slate-400">
                Loading team members...
              </div>
            ) : filteredMembers.length === 0 ? (
              <EmptyState
                title="No team members found"
                description={
                  members.length
                    ? 'No users match the selected search or filters.'
                    : 'Invite your first company administrator, manager or staff member.'
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-900 text-slate-300">
                    <tr>
                      <th className="px-4 py-4 font-semibold">
                        User
                      </th>

                      <th className="px-4 py-4 font-semibold">
                        Role
                      </th>

                      <th className="px-4 py-4 font-semibold">
                        Status
                      </th>

                      <th className="px-4 py-4 font-semibold">
                        Added
                      </th>

                      <th className="px-4 py-4 text-right font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                    {filteredMembers.map((member) => {
                      const role = normaliseRole(
                        member.role,
                      )
                      const isCurrentUser =
                        member.id === currentUserId
                      const isUpdating =
                        updatingMemberId === member.id

                      return (
                        <tr
                          key={member.id}
                          className="align-middle transition hover:bg-slate-900/60"
                        >
                          <td className="px-4 py-4">
                            <div className="flex min-w-[230px] items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold">
                                {getInitials(
                                  member.full_name,
                                  member.email,
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-2 font-semibold text-white">
                                  {member.full_name ||
                                    'Unnamed user'}

                                  {isCurrentUser && (
                                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-200">
                                      You
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 text-xs text-slate-400">
                                  {member.email || 'No email'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            {canManageTeam &&
                            !isCurrentUser ? (
                              <select
                                value={role}
                                onChange={(event) =>
                                  handleRoleChange(
                                    member,
                                    event.target.value,
                                  )
                                }
                                disabled={isUpdating}
                                className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="admin">
                                  Administrator
                                </option>
                                <option value="manager">
                                  Manager
                                </option>
                                <option value="staff">
                                  Staff
                                </option>
                              </select>
                            ) : (
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                                  ROLE_BADGE_CLASSES[role] ||
                                  ROLE_BADGE_CLASSES.staff
                                }`}
                              >
                                {ROLE_LABELS[role] ||
                                  'Staff'}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                              Active
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-400">
                            {formatDate(
                              member.created_at,
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex justify-end">
                              <span className="text-xs text-slate-500">
                                {isCurrentUser
                                  ? 'Current account'
                                  : canManageTeam
                                    ? 'Role can be changed'
                                    : 'No actions available'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-bold">
              Invitations
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              Review users who have been invited but have not
              yet completed access setup.
            </p>
          </div>

          <div className="mt-6">
            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 px-6 py-12 text-center text-slate-400">
                Loading invitations...
              </div>
            ) : invitations.length === 0 ? (
              <EmptyState
                title="No invitations yet"
                description="Invitations sent to company administrators, managers and staff will appear here."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {invitations.map((invitation) => {
                  let status = normaliseStatus(
                    invitation.status,
                  )

                  const expiredByDate =
                    status === 'pending' &&
                    invitation.expires_at &&
                    new Date(
                      invitation.expires_at,
                    ).getTime() < Date.now()

                  if (expiredByDate) {
                    status = 'expired'
                  }

                  const isPending =
                    status === 'pending'
                  const isCancelling =
                    cancellingInvitationId ===
                    invitation.id

                  return (
                    <article
                      key={invitation.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950 p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 font-bold">
                            {getInitials(
                              invitation.full_name,
                              invitation.email,
                            )}
                          </div>

                          <div>
                            <h3 className="font-semibold text-white">
                              {invitation.full_name ||
                                'Invited user'}
                            </h3>

                            <p className="mt-1 break-all text-sm text-slate-400">
                              {invitation.email}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`inline-flex self-start rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                            STATUS_BADGE_CLASSES[
                              status
                            ] ||
                            STATUS_BADGE_CLASSES.pending
                          }`}
                        >
                          {status}
                        </span>
                      </div>

                      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <dt className="text-slate-500">
                            Role
                          </dt>

                          <dd className="mt-1 text-slate-200">
                            {ROLE_LABELS[
                              normaliseRole(
                                invitation.role,
                              )
                            ] || 'Staff'}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-slate-500">
                            Invited
                          </dt>

                          <dd className="mt-1 text-slate-200">
                            {formatDate(
                              invitation.invited_at ||
                                invitation.created_at,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-slate-500">
                            Expires
                          </dt>

                          <dd className="mt-1 text-slate-200">
                            {formatDate(
                              invitation.expires_at,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-slate-500">
                            Auth account
                          </dt>

                          <dd className="mt-1 text-slate-200">
                            {invitation.auth_user_id
                              ? 'Created'
                              : 'Pending'}
                          </dd>
                        </div>
                      </dl>

                      {canManageTeam &&
                        (isPending ||
                          status === 'expired') && (
                          <div className="mt-5 flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                handleResendInvitation(
                                  invitation,
                                )
                              }
                              disabled={
                                inviting ||
                                isCancelling
                              }
                              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold transition hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Resend invitation
                            </button>

                            {isPending && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleCancelInvitation(
                                    invitation,
                                  )
                                }
                                disabled={
                                  isCancelling ||
                                  inviting
                                }
                                className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isCancelling
                                  ? 'Cancelling...'
                                  : 'Cancel invitation'}
                              </button>
                            )}
                          </div>
                        )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {expiredInvitations.length > 0 && (
            <p className="mt-5 text-xs leading-5 text-slate-500">
              {expiredInvitations.length} invitation
              {expiredInvitations.length === 1 ? '' : 's'}{' '}
              expired before the recipient completed account
              setup.
            </p>
          )}
        </section>

        <section className="mt-8 rounded-3xl border border-blue-500/20 bg-blue-500/5 p-5 sm:p-6">
          <h2 className="text-lg font-bold">
            Trustera access roles
          </h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {ROLE_OPTIONS.map((role) => (
              <article
                key={role.value}
                className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5"
              >
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    ROLE_BADGE_CLASSES[role.value]
                  }`}
                >
                  {role.label}
                </span>

                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {role.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}