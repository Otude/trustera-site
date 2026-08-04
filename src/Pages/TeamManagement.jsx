import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase } from '../supabase'
import { can } from '../utils/permissions'

const INITIAL_INVITE_FORM = {
  fullName: '',
  email: '',
  role: 'staff',
}

const ROLE_OPTIONS = [
  {
    value: 'manager',
    label: 'Manager',
    description:
      'Can add and edit workers, manage documents, review notifications and export reports.',
  },
  {
    value: 'compliance_officer',
    label: 'Compliance Officer',
    description:
      'Can manage workers and documents, review audit logs and oversee compliance activity.',
  },
  {
    value: 'staff',
    label: 'Staff',
    description:
      'Can view workers, upload documents and review notifications with restricted administration.',
  },
  {
    value: 'viewer',
    label: 'Viewer',
    description:
      'Read-only access to permitted workforce, document and notification information.',
  },
  {
    value: 'worker',
    label: 'Worker',
    description:
      'Restricted worker-level access with no company administration permissions.',
  },
]

const ROLE_LABELS = {
  platform_admin: 'Platform Administrator',
  admin: 'Administrator',
  manager: 'Manager',
  compliance_officer: 'Compliance Officer',
  staff: 'Staff',
  viewer: 'Viewer',
  worker: 'Worker',
}

const ROLE_BADGE_CLASSES = {
  platform_admin:
    'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200',
  admin:
    'border-purple-500/30 bg-purple-500/10 text-purple-200',
  manager:
    'border-blue-500/30 bg-blue-500/10 text-blue-200',
  compliance_officer:
    'border-teal-500/30 bg-teal-500/10 text-teal-200',
  staff:
    'border-slate-600 bg-slate-800 text-slate-200',
  viewer:
    'border-amber-500/30 bg-amber-500/10 text-amber-200',
  worker:
    'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
}

const STATUS_BADGE_CLASSES = {
  active:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  suspended:
    'border-red-500/30 bg-red-500/10 text-red-200',
  removed:
    'border-slate-600 bg-slate-800 text-slate-300',
  pending:
    'border-amber-500/30 bg-amber-500/10 text-amber-200',
  expired:
    'border-slate-600 bg-slate-800 text-slate-300',
  cancelled:
    'border-red-500/30 bg-red-500/10 text-red-200',
  revoked:
    'border-red-500/30 bg-red-500/10 text-red-200',
  accepted:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
}

const SUPPORTED_MEMBER_ROLES = new Set([
  'admin',
  'manager',
  'compliance_officer',
  'staff',
  'viewer',
  'worker',
])

const COMPANY_ADMIN_ASSIGNABLE_ROLES = new Set([
  'manager',
  'compliance_officer',
  'staff',
  'viewer',
  'worker',
])

function normaliseRole(role) {
  const value = String(role || '')
    .trim()
    .toLowerCase()

  return SUPPORTED_MEMBER_ROLES.has(value)
    ? value
    : 'staff'
}

function normaliseStatus(status, fallback = 'active') {
  const value = String(status || '')
    .trim()
    .toLowerCase()

  return STATUS_BADGE_CLASSES[value]
    ? value
    : fallback
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
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('')
  }

  return String(email || '?')
    .charAt(0)
    .toUpperCase()
}

function getEmailPrefix(email) {
  const value = String(email || '').trim()

  if (!value) return ''

  return value.includes('@')
    ? value.split('@')[0]
    : value
}

function getInvitationDisplayName(invitation) {
  return (
    String(invitation?.full_name || '').trim() ||
    getEmailPrefix(invitation?.email) ||
    'Invited user'
  )
}

function getMemberDisplayName(
  member,
  invitationNamesByEmail,
) {
  const profileName = String(
    member?.full_name || '',
  ).trim()

  if (profileName) {
    return profileName
  }

  const email = String(member?.email || '')
    .trim()
    .toLowerCase()

  const invitationName = String(
    invitationNamesByEmail.get(email) || '',
  ).trim()

  return (
    invitationName ||
    getEmailPrefix(email) ||
    'Trustera user'
  )
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(email || '').trim(),
  )
}

function getFunctionErrorMessage(error, fallback) {
  const message = String(
    error?.message || error || '',
  )

  if (
    message.toLowerCase().includes('rate limit')
  ) {
    return 'Too many invitation emails were requested. Please wait before trying again.'
  }

  return message || fallback
}

async function invokeFunction(functionName, body) {
  const { data, error } =
    await supabase.functions.invoke(
      functionName,
      { body },
    )

  if (error) {
    let message = error.message

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

    throw new Error(
      getFunctionErrorMessage(
        { message },
        `The ${functionName} request failed.`,
      ),
    )
  }

  if (data?.success === false || data?.error) {
    throw new Error(
      getFunctionErrorMessage(
        { message: data.error },
        `The ${functionName} request failed.`,
      ),
    )
  }

  return data
}

function AlertMessage({
  type = 'error',
  children,
}) {
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

function RoleBadge({ role, label }) {
  const normalised = normaliseRole(role)

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
        ROLE_BADGE_CLASSES[normalised] ||
        ROLE_BADGE_CLASSES.staff
      }`}
    >
      {label || ROLE_LABELS[normalised] || 'Staff'}
    </span>
  )
}

function StatusBadge({ status }) {
  const normalised = normaliseStatus(status)

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
        STATUS_BADGE_CLASSES[normalised] ||
        STATUS_BADGE_CLASSES.active
      }`}
    >
      {normalised}
    </span>
  )
}

function StatCard({
  label,
  value,
  description,
  valueClassName = '',
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-sm text-slate-400">
        {label}
      </div>

      <div
        className={`mt-2 text-3xl font-bold ${valueClassName}`}
      >
        {value}
      </div>

      <div className="mt-2 text-xs text-slate-500">
        {description}
      </div>
    </article>
  )
}

function LoadingPanel({ text }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 px-6 py-12 text-center text-slate-400">
      {text}
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant,
}) {
  const classes = {
    success:
      'border-emerald-500/30 bg-emerald-600 text-white hover:bg-emerald-500',
    warning:
      'border-amber-500/30 bg-amber-600 text-white hover:bg-amber-500',
    danger:
      'border-red-500/30 bg-red-600 text-white hover:bg-red-500',
  }[variant]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[36px] items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${classes}`}
    >
      {label}
    </button>
  )
}

function InvitationCard({
  invitation,
  status,
  canManageTeam,
  isPending,
  isCancelling,
  isResending,
  onCancel,
  onResend,
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 font-bold">
            {getInitials(
              getInvitationDisplayName(invitation),
              invitation.email,
            )}
          </div>

          <div>
            <h3 className="font-semibold text-white">
              {getInvitationDisplayName(invitation)}
            </h3>

            <p className="mt-1 break-all text-sm text-slate-400">
              {invitation.email}
            </p>
          </div>
        </div>

        <StatusBadge status={status} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-slate-500">Role</dt>
          <dd className="mt-1 text-slate-200">
            {ROLE_LABELS[
              normaliseRole(invitation.role)
            ] || 'Staff'}
          </dd>
        </div>

        <div>
          <dt className="text-slate-500">Invited</dt>
          <dd className="mt-1 text-slate-200">
            {formatDate(
              invitation.invited_at ||
                invitation.created_at,
            )}
          </dd>
        </div>

        <div>
          <dt className="text-slate-500">Expires</dt>
          <dd className="mt-1 text-slate-200">
            {formatDate(invitation.expires_at)}
          </dd>
        </div>

        <div>
          <dt className="text-slate-500">
            Account setup
          </dt>
          <dd className="mt-1 text-slate-200">
            {invitation.auth_user_id
              ? status === 'accepted'
                ? 'Complete'
                : 'Auth account created'
              : 'Awaiting acceptance'}
          </dd>
        </div>
      </dl>

      {canManageTeam &&
        (isPending || status === 'expired') && (
          <div className="mt-5 flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onResend}
              disabled={isResending || isCancelling}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold transition hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResending
                ? 'Resending...'
                : 'Resend invitation'}
            </button>

            {isPending && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isCancelling || isResending}
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
}

export default function TeamManagement({
  profile,
  session,
}) {
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)

  const [showInviteForm, setShowInviteForm] =
    useState(false)
  const [inviteForm, setInviteForm] =
    useState(INITIAL_INVITE_FORM)
  const [inviting, setInviting] =
    useState(false)

  const [
    updatingMemberId,
    setUpdatingMemberId,
  ] = useState(null)
  const [
    managingMemberId,
    setManagingMemberId,
  ] = useState(null)
  const [
    cancellingInvitationId,
    setCancellingInvitationId,
  ] = useState(null)
  const [
    resendingInvitationId,
    setResendingInvitationId,
  ] = useState(null)

  const [searchTerm, setSearchTerm] =
    useState('')
  const [roleFilter, setRoleFilter] =
    useState('all')
  const [statusFilter, setStatusFilter] =
    useState('all')

  const [errorMessage, setErrorMessage] =
    useState('')
  const [
    successMessage,
    setSuccessMessage,
  ] = useState('')

  const companyId = profile?.company_id || null
  const currentUserId =
    session?.user?.id || profile?.id || null
  const currentUserRole =
    normaliseRole(profile?.role)

  const isPlatformAdmin =
    Boolean(profile?.is_platform_admin) ||
    profile?.role === 'platform_admin'

  const canManageTeam =
    can(profile, 'manageTeam') ||
    currentUserRole === 'admin'

  const clearMessages = useCallback(() => {
    setErrorMessage('')
    setSuccessMessage('')
  }, [])

  const loadTeamData = useCallback(
    async ({ silent = false } = {}) => {
      if (!companyId) {
        setMembers([])
        setInvitations([])
        setLoading(false)
        setRefreshing(false)
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
          profileResponse,
          invitationResponse,
        ] = await Promise.all([
          supabase
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
            .eq('company_id', companyId)
            .order('created_at', {
              ascending: true,
            }),

          supabase
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
              accepted_at,
              revoked_at,
              expires_at,
              created_at,
              updated_at
            `)
            .eq('company_id', companyId)
            .order('created_at', {
              ascending: false,
            }),
        ])

        if (profileResponse.error) {
          throw profileResponse.error
        }

        if (invitationResponse.error) {
          throw invitationResponse.error
        }

        setMembers(profileResponse.data || [])
        setInvitations(
          invitationResponse.data || [],
        )
      } catch (error) {
        console.error(
          'Team data could not be loaded:',
          error,
        )

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
    if (!companyId) {
      return undefined
    }

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

  const visibleInvitations = useMemo(
    () =>
      invitations.filter((invitation) => {
        const status = normaliseStatus(
          invitation.status,
          'pending',
        )

        return ![
          'revoked',
          'cancelled',
        ].includes(status)
      }),
    [invitations],
  )

  const pendingInvitations = useMemo(
    () =>
      visibleInvitations.filter(
        (invitation) =>
          normaliseStatus(
            invitation.status,
            'pending',
          ) === 'pending',
      ),
    [visibleInvitations],
  )

  const expiredInvitations = useMemo(
    () =>
      visibleInvitations.filter((invitation) => {
        const status = normaliseStatus(
          invitation.status,
          'pending',
        )

        if (status === 'expired') return true

        return Boolean(
          status === 'pending' &&
            invitation.expires_at &&
            new Date(
              invitation.expires_at,
            ).getTime() < Date.now(),
        )
      }),
    [visibleInvitations],
  )

  const invitationNamesByEmail = useMemo(() => {
    const names = new Map()

    visibleInvitations.forEach((invitation) => {
      const email = String(
        invitation?.email || '',
      )
        .trim()
        .toLowerCase()
      const fullName = String(
        invitation?.full_name || '',
      ).trim()

      if (email && fullName && !names.has(email)) {
        names.set(email, fullName)
      }
    })

    return names
  }, [visibleInvitations])

  const activeMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          normaliseStatus(
            member.account_status,
          ) === 'active',
      ),
    [members],
  )

  const suspendedMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          normaliseStatus(
            member.account_status,
          ) === 'suspended',
      ),
    [members],
  )

  const filteredMembers = useMemo(() => {
    const search = searchTerm
      .trim()
      .toLowerCase()

    return members.filter((member) => {
      const role = normaliseRole(member.role)
      const status = normaliseStatus(
        member.account_status,
      )
      const displayName =
        getMemberDisplayName(
          member,
          invitationNamesByEmail,
        )

      const matchesSearch =
        !search ||
        displayName
          .toLowerCase()
          .includes(search) ||
        String(member.email || '')
          .toLowerCase()
          .includes(search) ||
        String(ROLE_LABELS[role] || role)
          .toLowerCase()
          .includes(search)

      const matchesRole =
        roleFilter === 'all' ||
        role === roleFilter

      const matchesStatus =
        statusFilter === 'all' ||
        status === statusFilter

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus
      )
    })
  }, [
    invitationNamesByEmail,
    members,
    roleFilter,
    searchTerm,
    statusFilter,
  ])

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
      fullName:
        inviteForm.fullName.trim(),
      email: inviteForm.email
        .trim()
        .toLowerCase(),
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

    if (
      !payload.email ||
      !isValidEmail(payload.email)
    ) {
      setErrorMessage(
        'Enter a valid work email address.',
      )
      return
    }

    if (
      !COMPANY_ADMIN_ASSIGNABLE_ROLES.has(
        payload.role,
      )
    ) {
      setErrorMessage(
        'Select a valid team role.',
      )
      return
    }

    const existingMember = members.find(
      (member) =>
        String(member.email || '')
          .trim()
          .toLowerCase() ===
        payload.email,
    )

    if (existingMember) {
      setErrorMessage(
        'A Trustera user with this email already belongs to your company.',
      )
      return
    }

    const existingInvitation =
      pendingInvitations.find(
        (invitation) =>
          String(invitation.email || '')
            .trim()
            .toLowerCase() ===
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
      await invokeFunction(
        'invite-company-user',
        payload,
      )

      setInviteForm(INITIAL_INVITE_FORM)
      setShowInviteForm(false)

      setSuccessMessage(
        `An invitation has been sent to ${payload.email}.`,
      )

      await loadTeamData({
        silent: true,
      })
    } catch (error) {
      console.error(
        'Team invitation failed:',
        error,
      )

      setErrorMessage(
        getFunctionErrorMessage(
          error,
          'The invitation could not be sent.',
        ),
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
    const previousRole =
      normaliseRole(member.role)

    if (role === previousRole) return

    if (
      !COMPANY_ADMIN_ASSIGNABLE_ROLES.has(role)
    ) {
      setErrorMessage(
        'Company administrators cannot assign another administrator from this page.',
      )
      return
    }

    if (member.id === currentUserId) {
      setErrorMessage(
        'You cannot change your own role from this screen.',
      )
      return
    }

    const memberDisplayName =
      getMemberDisplayName(
        member,
        invitationNamesByEmail,
      )

    const confirmed = window.confirm(
      `Change ${memberDisplayName} from ${
        ROLE_LABELS[previousRole]
      } to ${ROLE_LABELS[role]}?`,
    )

    if (!confirmed) return

    clearMessages()
    setUpdatingMemberId(member.id)

    try {
      await invokeFunction(
        'update-company-user-role',
        {
          targetUserId: member.id,
          role,
        },
      )

      setMembers((previous) =>
        previous.map((item) =>
          item.id === member.id
            ? { ...item, role }
            : item,
        ),
      )

      setSuccessMessage(
        `${memberDisplayName} is now a ${ROLE_LABELS[role]}.`,
      )
    } catch (error) {
      console.error('Role update failed:', error)

      setErrorMessage(
        getFunctionErrorMessage(
          error,
          'The user’s role could not be updated.',
        ),
      )
    } finally {
      setUpdatingMemberId(null)
    }
  }

  async function handleMemberAction(
    member,
    action,
  ) {
    if (
      !canManageTeam ||
      managingMemberId ||
      !companyId
    ) {
      return
    }

    if (member.id === currentUserId) {
      setErrorMessage(
        'You cannot manage your own account from this screen.',
      )
      return
    }

    if (
      normaliseRole(member.role) === 'admin' &&
      !isPlatformAdmin
    ) {
      setErrorMessage(
        'Only a Trustera platform administrator can suspend or remove a company administrator.',
      )
      return
    }

    const displayName =
      getMemberDisplayName(
        member,
        invitationNamesByEmail,
      )

    const confirmed = window.confirm(
      `${action
        .charAt(0)
        .toUpperCase()}${action.slice(
        1,
      )} ${displayName}?`,
    )

    if (!confirmed) return

    clearMessages()
    setManagingMemberId(member.id)

    try {
      await invokeFunction(
        'manage-company-user',
        {
          targetUserId: member.id,
          action,
        },
      )

      const nextStatus = {
        suspend: 'suspended',
        reactivate: 'active',
        remove: 'removed',
      }[action]

      setMembers((previous) =>
        previous.map((item) =>
          item.id === member.id
            ? {
                ...item,
                account_status: nextStatus,
              }
            : item,
        ),
      )

      setSuccessMessage(
        `${displayName} was ${{
          suspend: 'suspended',
          reactivate: 'reactivated',
          remove: 'removed',
        }[action]}.`,
      )
    } catch (error) {
      console.error(
        'Member action failed:',
        error,
      )

      setErrorMessage(
        getFunctionErrorMessage(
          error,
          'The team member could not be updated.',
        ),
      )
    } finally {
      setManagingMemberId(null)
    }
  }

  async function handleCancelInvitation(
    invitation,
  ) {
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
      await invokeFunction(
        'manage-company-invitation',
        {
          invitationId: invitation.id,
          action: 'cancel',
        },
      )

      setInvitations((previous) =>
        previous.filter(
          (item) =>
            item.id !== invitation.id,
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
        getFunctionErrorMessage(
          error,
          'The invitation could not be cancelled.',
        ),
      )
    } finally {
      setCancellingInvitationId(null)
    }
  }

  async function handleResendInvitation(
    invitation,
  ) {
    if (
      !canManageTeam ||
      resendingInvitationId
    ) {
      return
    }

    clearMessages()
    setResendingInvitationId(invitation.id)

    try {
      await invokeFunction(
        'manage-company-invitation',
        {
          invitationId: invitation.id,
          action: 'resend',
        },
      )

      setSuccessMessage(
        `The invitation has been resent to ${invitation.email}.`,
      )

      await loadTeamData({
        silent: true,
      })
    } catch (error) {
      console.error(
        'Invitation resend failed:',
        error,
      )

      setErrorMessage(
        getFunctionErrorMessage(
          error,
          'The invitation could not be resent.',
        ),
      )
    } finally {
      setResendingInvitationId(null)
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
          Your Trustera account is not connected to a company. Contact the platform administrator.
        </AlertMessage>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-400">
              Company administration
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Team Management
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              Invite colleagues, assign access levels, suspend access and manage users who belong to your organisation.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                loadTeamData({
                  silent: true,
                })
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
                  setShowInviteForm(
                    (previous) => !previous,
                  )
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
              >
                {showInviteForm
                  ? 'Close invite form'
                  : 'Invite team member'}
              </button>
            )}
          </div>
        </header>

        {!canManageTeam && (
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            You can view the company team, but only an administrator can invite users or change access permissions.
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
            <h2 className="text-xl font-bold">
              Invite a team member
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              The recipient will receive a secure email invitation and will be connected to your company after completing account setup.
            </p>

            <form
              onSubmit={handleInviteSubmit}
              className="mt-6 grid gap-5 lg:grid-cols-3"
              noValidate
            >
              <input
                type="text"
                name="fullName"
                value={inviteForm.fullName}
                onChange={handleInviteChange}
                placeholder="Full name"
                disabled={inviting}
                className="min-h-[48px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
              />

              <input
                type="email"
                name="email"
                value={inviteForm.email}
                onChange={handleInviteChange}
                placeholder="Work email"
                disabled={inviting}
                className="min-h-[48px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
              />

              <select
                name="role"
                value={inviteForm.role}
                onChange={handleInviteChange}
                disabled={inviting}
                className="min-h-[48px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
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

              <div className="flex gap-3 lg:col-span-3 lg:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false)
                    setInviteForm(
                      INITIAL_INVITE_FORM,
                    )
                  }}
                  disabled={inviting}
                  className="rounded-xl border border-slate-700 px-5 py-3 font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={inviting}
                  className="rounded-xl bg-blue-600 px-6 py-3 font-semibold disabled:opacity-60"
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
          <StatCard
            label="Total members"
            value={members.length}
            description="Registered company users"
          />
          <StatCard
            label="Active members"
            value={activeMembers.length}
            description="Accounts currently enabled"
            valueClassName="text-emerald-300"
          />
          <StatCard
            label="Pending invitations"
            value={pendingInvitations.length}
            description="Awaiting user acceptance"
            valueClassName="text-amber-300"
          />
          <StatCard
            label="Suspended"
            value={suspendedMembers.length}
            description="Access temporarily disabled"
            valueClassName="text-red-300"
          />
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
              <input
                type="search"
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(
                    event.target.value,
                  )
                }
                placeholder="Search name or email..."
                className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm"
              />

              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(
                    event.target.value,
                  )
                }
                className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm"
              >
                <option value="all">
                  All roles
                </option>
                {Object.entries(ROLE_LABELS)
                  .filter(
                    ([value]) =>
                      value !== 'platform_admin',
                  )
                  .map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value,
                  )
                }
                className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm"
              >
                <option value="all">
                  All statuses
                </option>
                <option value="active">
                  Active
                </option>
                <option value="suspended">
                  Suspended
                </option>
                <option value="removed">
                  Removed
                </option>
              </select>
            </div>
          </div>

          <div className="mt-6">
            {loading ? (
              <LoadingPanel text="Loading team members..." />
            ) : filteredMembers.length === 0 ? (
              <EmptyState
                title="No team members found"
                description="No users match the selected search or filters."
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900 text-slate-300">
                    <tr>
                      <th className="px-4 py-4">
                        User
                      </th>
                      <th className="px-4 py-4">
                        Role
                      </th>
                      <th className="px-4 py-4">
                        Status
                      </th>
                      <th className="px-4 py-4">
                        Added
                      </th>
                      <th className="px-4 py-4 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                    {filteredMembers.map((member) => {
                      const role = normaliseRole(
                        member.role,
                      )
                      const status =
                        normaliseStatus(
                          member.account_status,
                        )
                      const displayName =
                        getMemberDisplayName(
                          member,
                          invitationNamesByEmail,
                        )
                      const isCurrentUser =
                        member.id === currentUserId
                      const isUpdating =
                        updatingMemberId ===
                        member.id
                      const isManaging =
                        managingMemberId ===
                        member.id
                      const isProtectedAdmin =
                        role === 'admin' &&
                        !isPlatformAdmin

                      return (
                        <tr key={member.id}>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold">
                                {getInitials(
                                  displayName,
                                  member.email,
                                )}
                              </div>
                              <div>
                                <div className="font-semibold">
                                  {displayName}
                                </div>
                                <div className="text-xs text-slate-400">
                                  {member.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            {canManageTeam &&
                            !isCurrentUser &&
                            role !== 'admin' ? (
                              <select
                                value={role}
                                onChange={(event) =>
                                  handleRoleChange(
                                    member,
                                    event.target.value,
                                  )
                                }
                                disabled={
                                  isUpdating ||
                                  isManaging
                                }
                                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2"
                              >
                                {ROLE_OPTIONS.map(
                                  (option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            ) : (
                              <RoleBadge role={role} />
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <StatusBadge
                              status={status}
                            />
                          </td>

                          <td className="px-4 py-4 text-slate-400">
                            {formatDate(
                              member.created_at,
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              {isCurrentUser ? (
                                <span className="text-xs text-slate-500">
                                  Current account
                                </span>
                              ) : !canManageTeam ? (
                                <span className="text-xs text-slate-500">
                                  No actions available
                                </span>
                              ) : isProtectedAdmin ? (
                                <span className="text-xs text-slate-500">
                                  Platform admin action required
                                </span>
                              ) : status === 'active' ? (
                                <>
                                  <ActionButton
                                    label="Suspend"
                                    onClick={() =>
                                      handleMemberAction(
                                        member,
                                        'suspend',
                                      )
                                    }
                                    disabled={
                                      isManaging ||
                                      isUpdating
                                    }
                                    variant="warning"
                                  />
                                  <ActionButton
                                    label="Remove"
                                    onClick={() =>
                                      handleMemberAction(
                                        member,
                                        'remove',
                                      )
                                    }
                                    disabled={
                                      isManaging ||
                                      isUpdating
                                    }
                                    variant="danger"
                                  />
                                </>
                              ) : status ===
                                'suspended' ? (
                                <>
                                  <ActionButton
                                    label="Reactivate"
                                    onClick={() =>
                                      handleMemberAction(
                                        member,
                                        'reactivate',
                                      )
                                    }
                                    disabled={
                                      isManaging ||
                                      isUpdating
                                    }
                                    variant="success"
                                  />
                                  <ActionButton
                                    label="Remove"
                                    onClick={() =>
                                      handleMemberAction(
                                        member,
                                        'remove',
                                      )
                                    }
                                    disabled={
                                      isManaging ||
                                      isUpdating
                                    }
                                    variant="danger"
                                  />
                                </>
                              ) : (
                                <span className="text-xs text-slate-500">
                                  Access removed
                                </span>
                              )}
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
          <h2 className="text-xl font-bold">
            Invitations
          </h2>

          <div className="mt-6">
            {loading ? (
              <LoadingPanel text="Loading invitations..." />
            ) : visibleInvitations.length === 0 ? (
              <EmptyState
                title="No invitations yet"
                description="Invitations will appear here."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {visibleInvitations.map(
                  (invitation) => {
                    let status = normaliseStatus(
                      invitation.status,
                      'pending',
                    )

                    const expiredByDate =
                      status === 'pending' &&
                      invitation.expires_at &&
                      new Date(
                        invitation.expires_at,
                      ).getTime() <
                        Date.now()

                    if (expiredByDate) {
                      status = 'expired'
                    }

                    return (
                      <InvitationCard
                        key={invitation.id}
                        invitation={invitation}
                        status={status}
                        canManageTeam={
                          canManageTeam
                        }
                        isPending={
                          status === 'pending'
                        }
                        isCancelling={
                          cancellingInvitationId ===
                          invitation.id
                        }
                        isResending={
                          resendingInvitationId ===
                          invitation.id
                        }
                        onCancel={() =>
                          handleCancelInvitation(
                            invitation,
                          )
                        }
                        onResend={() =>
                          handleResendInvitation(
                            invitation,
                          )
                        }
                      />
                    )
                  },
                )}
              </div>
            )}
          </div>

          {expiredInvitations.length > 0 && (
            <p className="mt-5 text-xs text-slate-500">
              {expiredInvitations.length} invitation
              {expiredInvitations.length === 1
                ? ''
                : 's'}{' '}
              expired before account setup was completed.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}