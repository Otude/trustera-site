import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'
import { can } from '../utils/permissions'

const ACTION_META = {
  all: {
    label: 'Total Logs',
    description: 'All recorded activity',
    icon: '☷',
    accent: '#2563eb',
  },

  create: {
    label: 'Create Actions',
    description: 'New records and uploads',
    icon: '+',
    accent: '#16a34a',
  },

  update: {
    label: 'Update Actions',
    description: 'Changes and modifications',
    icon: '✎',
    accent: '#d97706',
  },

  delete: {
    label: 'Delete Actions',
    description: 'Removed records',
    icon: '⌫',
    accent: '#dc2626',
  },

  access: {
    label: 'Access Actions',
    description: 'Login and access events',
    icon: '♙',
    accent: '#7c3aed',
  },

  other: {
    label: 'Other Actions',
    description: 'Uncategorised activity',
    icon: '•',
    accent: '#475569',
  },
}

const AUDIT_VISIBLE_ROLES = new Set([
  'admin',
  'compliance_officer',
])

const SENSITIVE_DETAIL_KEYS = new Set([
  'id',
  'user_id',
  'company_id',
  'entity_id',
  'invitation_id',
  'document_id',
  'worker_id',
  'auth_user_id',
  'invited_by',
  'access_token',
  'refresh_token',
  'token',
  'password',
  'service_role_key',
])

function normaliseRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
}

function normaliseAction(action) {
  return String(action || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ')
}

function titleCase(value) {
  const normalised = String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ')

  if (!normalised) {
    return ''
  }

  return normalised
    .split(' ')
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase(),
    )
    .join(' ')
}

function formatAction(action) {
  return titleCase(action) || 'Unknown Action'
}

function formatEntityType(entityType) {
  return titleCase(entityType) || 'Other'
}

function formatDate(dateValue) {
  if (!dateValue) {
    return '-'
  }

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

function parseDetails(details) {
  if (!details) {
    return {}
  }

  if (
    typeof details === 'object' &&
    details !== null &&
    !Array.isArray(details)
  ) {
    return details
  }

  try {
    const parsed = JSON.parse(String(details))

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed
    }

    return {
      message: String(details),
    }
  } catch {
    return {
      message: String(details),
    }
  }
}

function humaniseKey(key) {
  return titleCase(key) || 'Detail'
}

function isSensitiveDetailKey(key) {
  const value = String(key || '')
    .trim()
    .toLowerCase()

  if (SENSITIVE_DETAIL_KEYS.has(value)) {
    return true
  }

  return (
    value.endsWith('_id') ||
    value.includes('uuid') ||
    value.includes('token') ||
    value.includes('secret') ||
    value.includes('password') ||
    value.includes('service_role') ||
    value.includes('file_path') ||
    value.includes('storage_path')
  )
}

function formatDetailValue(value) {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'object'
          ? JSON.stringify(item)
          : String(item),
      )
      .join(', ')
  }

  if (
    typeof value === 'object' &&
    value !== null
  ) {
    return JSON.stringify(value)
  }

  return String(value)
}

function getSafeDetailEntries(details) {
  return Object.entries(parseDetails(details))
    .filter(([key, value]) => {
      if (isSensitiveDetailKey(key)) {
        return false
      }

      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        return false
      }

      return true
    })
    .slice(0, 10)
}

function getActionCategory(action) {
  const normalised = normaliseAction(action)

  if (
    normalised.includes('delete') ||
    normalised.includes('remove') ||
    normalised.includes('revoke') ||
    normalised.includes('cancel')
  ) {
    return 'delete'
  }

  if (
    normalised.includes('update') ||
    normalised.includes('edit') ||
    normalised.includes('change') ||
    normalised.includes('mark') ||
    normalised.includes('accept') ||
    normalised.includes('approve') ||
    normalised.includes('assign') ||
    normalised.includes('suspend') ||
    normalised.includes('restore')
  ) {
    return 'update'
  }

  if (
    normalised.includes('create') ||
    normalised.includes('upload') ||
    normalised.includes('add') ||
    normalised.includes('insert') ||
    normalised.includes('invite') ||
    normalised.includes('request') ||
    normalised.includes('send')
  ) {
    return 'create'
  }

  if (
    normalised.includes('login') ||
    normalised.includes('log in') ||
    normalised.includes('sign in') ||
    normalised.includes('sign out') ||
    normalised.includes('view') ||
    normalised.includes('download') ||
    normalised.includes('export') ||
    normalised.includes('access')
  ) {
    return 'access'
  }

  return 'other'
}

function getEntityName(log) {
  const details = parseDetails(log.details)

  const possibleNames = [
    log.entity_name,
    details.entity_name,
    details.full_name,
    details.worker_name,
    details.document_name,
    details.document_type,
    details.company_name,
    details.email,
    details.user_email,
    details.name,
    details.title,
  ]

  const matchedName = possibleNames.find(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim(),
  )

  if (matchedName) {
    return String(matchedName).trim()
  }

  return formatEntityType(log.entity_type)
}

function getUserEmail(log) {
  const details = parseDetails(log.details)

  return (
    log.user_email ||
    log.resolved_user_email ||
    details.user_email ||
    details.invited_by_email ||
    details.email ||
    ''
  )
}

function getFriendlyDetail(log) {
  const details = parseDetails(log.details)
  const action = normaliseAction(log.action)
  const category = getActionCategory(log.action)
  const entityName = getEntityName(log)

  if (
    action.includes('team member invited') ||
    action.includes('user invited') ||
    action.includes('invitation sent')
  ) {
    const invitedEmail =
      details.email ||
      details.invited_email ||
      entityName

    return `Invitation sent to ${invitedEmail}`
  }

  if (
    action.includes('invitation accepted') ||
    action.includes('invite accepted')
  ) {
    return `${entityName || 'Invitation'} accepted`
  }

  if (
    action.includes('invitation revoked') ||
    action.includes('invite revoked')
  ) {
    return `${entityName || 'Invitation'} revoked`
  }

  if (
    action.includes('worker created') ||
    action.includes('worker added')
  ) {
    return `${entityName || 'Worker'} created`
  }

  if (
    action.includes('worker updated') ||
    action.includes('worker edited')
  ) {
    return `${entityName || 'Worker'} updated`
  }

  if (
    action.includes('worker deleted') ||
    action.includes('worker removed')
  ) {
    return `${entityName || 'Worker'} deleted`
  }

  if (
    action.includes('document uploaded') ||
    action.includes('upload document')
  ) {
    return `${entityName || 'Document'} uploaded successfully`
  }

  if (action.includes('document updated')) {
    return `${entityName || 'Document'} updated`
  }

  if (action.includes('document deleted')) {
    return `${entityName || 'Document'} deleted`
  }

  if (action.includes('role changed')) {
    const previousRole =
      details.previous_role ||
      details.old_role

    const nextRole =
      details.new_role ||
      details.role

    if (previousRole && nextRole) {
      return `${entityName || 'User'} changed from ${titleCase(
        previousRole,
      )} to ${titleCase(nextRole)}`
    }

    if (nextRole) {
      return `${entityName || 'User'} assigned the ${titleCase(
        nextRole,
      )} role`
    }

    return `${entityName || 'User'} role changed`
  }

  if (
    action.includes('login') ||
    action.includes('sign in')
  ) {
    return 'User signed in'
  }

  if (action.includes('sign out')) {
    return 'User signed out'
  }

  if (
    action.includes('export') ||
    action.includes('download')
  ) {
    return `${entityName || 'Report'} downloaded`
  }

  if (details.message) {
    return String(details.message)
  }

  if (category === 'create') {
    return `${entityName || 'Record'} created`
  }

  if (category === 'update') {
    return `${entityName || 'Record'} updated`
  }

  if (category === 'delete') {
    return `${entityName || 'Record'} deleted`
  }

  if (category === 'access') {
    return `${entityName || 'Record'} accessed`
  }

  return 'System activity recorded'
}

function getActionAppearance(action) {
  const category = getActionCategory(action)
  const meta =
    ACTION_META[category] || ACTION_META.other

  const appearances = {
    create: {
      background: '#052e16',
      color: '#bbf7d0',
      border: '#15803d',
    },

    update: {
      background: '#451a03',
      color: '#fde68a',
      border: '#b45309',
    },

    delete: {
      background: '#450a0a',
      color: '#fecaca',
      border: '#b91c1c',
    },

    access: {
      background: '#2e1065',
      color: '#ddd6fe',
      border: '#7c3aed',
    },

    other: {
      background: '#1e293b',
      color: '#cbd5e1',
      border: '#475569',
    },
  }

  return {
    ...appearances[category],
    icon: meta.icon,
    accent: meta.accent,
    category,
  }
}

function normaliseLog(log, profileEmailMap = {}) {
  const details = parseDetails(log.details)

  const createdAt =
    log.created_at ||
    log.logged_at ||
    log.inserted_at ||
    log.timestamp ||
    null

  const userId =
    log.user_id ||
    log.created_by ||
    log.actor_id ||
    null

  const resolvedUserEmail =
    log.user_email ||
    profileEmailMap[userId] ||
    details.user_email ||
    details.invited_by_email ||
    details.email ||
    null

  return {
    ...log,
    id:
      log.id ||
      `${createdAt || 'log'}-${Math.random()}`,
    company_id:
      log.company_id ||
      details.company_id ||
      null,
    user_id: userId,
    user_email: resolvedUserEmail,
    resolved_user_email: resolvedUserEmail,
    action:
      log.action ||
      log.event_type ||
      log.event ||
      'system_activity',
    entity_type:
      log.entity_type ||
      log.resource_type ||
      log.table_name ||
      'record',
    entity_id:
      log.entity_id ||
      log.resource_id ||
      null,
    entity_name:
      log.entity_name ||
      details.entity_name ||
      details.full_name ||
      details.worker_name ||
      details.document_type ||
      details.company_name ||
      details.email ||
      null,
    details,
    created_at: createdAt,
  }
}

export default function AuditLogs({
  profile,
  session,
}) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] =
    useState('all')
  const [expandedLogId, setExpandedLogId] =
    useState(null)

  const companyId =
    profile?.company_id || null

  const profileRole = normaliseRole(profile?.role)

  const hasAuditPermission =
    can(profile, 'viewAuditLogs') ||
    AUDIT_VISIBLE_ROLES.has(profileRole)

  const currentUserEmail =
    session?.user?.email ||
    profile?.email ||
    ''

  const fetchProfileEmailMap = useCallback(
    async (userIds) => {
      const uniqueUserIds = [
        ...new Set(
          userIds.filter(Boolean),
        ),
      ]

      if (uniqueUserIds.length === 0) {
        return {}
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', uniqueUserIds)

      if (error) {
        console.warn(
          'Unable to resolve audit-log users:',
          error,
        )

        return {}
      }

      return (data || []).reduce(
        (result, item) => {
          if (item?.id) {
            result[item.id] =
              item.email ||
              item.full_name ||
              'Unknown user'
          }

          return result
        },
        {},
      )
    },
    [],
  )

  const fetchLogs = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!companyId || !hasAuditPermission) {
        setLogs([])
        setLoadError('')
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (showLoading) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setLoadError('')

      try {
        /*
         * Select all available columns so the page does not fail
         * when optional columns such as user_email or entity_name
         * are not present in the database.
         */
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', {
            ascending: false,
          })

        if (error) {
          /*
           * Some older schemas may use logged_at instead of
           * created_at. Retry using logged_at when necessary.
           */
          const missingCreatedAt =
            String(error.message || '')
              .toLowerCase()
              .includes('created_at')

          if (!missingCreatedAt) {
            throw error
          }

          const {
            data: fallbackData,
            error: fallbackError,
          } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('company_id', companyId)
            .order('logged_at', {
              ascending: false,
            })

          if (fallbackError) {
            throw fallbackError
          }

          const userIds = (
            fallbackData || []
          )
            .map(
              (log) =>
                log.user_id ||
                log.created_by ||
                log.actor_id,
            )
            .filter(Boolean)

          const emailMap =
            await fetchProfileEmailMap(userIds)

          setLogs(
            (fallbackData || []).map((log) =>
              normaliseLog(log, emailMap),
            ),
          )

          return
        }

        const userIds = (data || [])
          .map(
            (log) =>
              log.user_id ||
              log.created_by ||
              log.actor_id,
          )
          .filter(Boolean)

        const emailMap =
          await fetchProfileEmailMap(userIds)

        setLogs(
          (data || []).map((log) =>
            normaliseLog(log, emailMap),
          ),
        )
      } catch (error) {
        console.error(
          'Unable to load audit logs:',
          error,
        )

        const message =
          error?.message ||
          'Unable to load audit logs.'

        setLoadError(message)
        setLogs([])
        toast.error(message)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [
      companyId,
      fetchProfileEmailMap,
      hasAuditPermission,
    ],
  )

  useEffect(() => {
    if (
      !companyId ||
      !hasAuditPermission
    ) {
      setLogs([])
      setLoading(false)
      return undefined
    }

    fetchLogs()

    const channel = supabase
      .channel(`audit-logs-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          filter: `company_id=eq.${companyId}`,
        },
        async (payload) => {
          const insertedLog = payload.new

          if (
            insertedLog?.company_id !== companyId
          ) {
            return
          }

          const userId =
            insertedLog.user_id ||
            insertedLog.created_by ||
            insertedLog.actor_id ||
            null

          let emailMap = {}

          if (userId) {
            emailMap =
              await fetchProfileEmailMap([
                userId,
              ])
          }

          const normalisedLog =
            normaliseLog(
              insertedLog,
              emailMap,
            )

          setLogs((current) => {
            const alreadyExists =
              current.some(
                (item) =>
                  item.id ===
                  normalisedLog.id,
              )

            if (alreadyExists) {
              return current
            }

            return [
              normalisedLog,
              ...current,
            ]
          })
        },
      )
      .subscribe((status) => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT'
        ) {
          console.error(
            'Audit log Realtime channel failed:',
            status,
          )
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [
    companyId,
    fetchLogs,
    fetchProfileEmailMap,
    hasAuditPermission,
  ])

  const filteredLogs = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase()

    return logs.filter((log) => {
      const action =
        normaliseAction(log.action)

      const entityType = String(
        log.entity_type || '',
      ).toLowerCase()

      const entityName = getEntityName(
        log,
      ).toLowerCase()

      const userEmail = getUserEmail(
        log,
      ).toLowerCase()

      const friendlyDetail =
        getFriendlyDetail(
          log,
        ).toLowerCase()

      const safeDetails =
        getSafeDetailEntries(log.details)
          .map(
            ([key, value]) =>
              `${key} ${formatDetailValue(
                value,
              )}`,
          )
          .join(' ')
          .toLowerCase()

      const matchesSearch =
        !term ||
        action.includes(term) ||
        entityType.includes(term) ||
        entityName.includes(term) ||
        userEmail.includes(term) ||
        friendlyDetail.includes(term) ||
        safeDetails.includes(term)

      const matchesFilter =
        actionFilter === 'all' ||
        getActionCategory(log.action) ===
          actionFilter

      return (
        matchesSearch &&
        matchesFilter
      )
    })
  }, [
    actionFilter,
    logs,
    search,
  ])

  const categoryCounts = useMemo(() => {
    const counts = {
      all: logs.length,
      create: 0,
      update: 0,
      delete: 0,
      access: 0,
      other: 0,
    }

    logs.forEach((log) => {
      const category =
        getActionCategory(log.action)

      counts[category] += 1
    })

    return counts
  }, [logs])

  const activeFilterLabel =
    ACTION_META[actionFilter]?.label ||
    'Audit Logs'

  if (!hasAuditPermission) {
    return (
      <div style={styles.page}>
        <div style={styles.accessDeniedCard}>
          <div style={styles.accessDeniedIcon}>
            !
          </div>

          <h1 style={styles.accessDeniedTitle}>
            Audit log access restricted
          </h1>

          <p style={styles.accessDeniedText}>
            You are signed in as{' '}
            <strong>
              {titleCase(profileRole) ||
                'a restricted user'}
            </strong>
            . Only administrators and compliance
            officers can view the organisation’s
            audit trail.
          </p>
        </div>
      </div>
    )
  }

  if (!companyId) {
    return (
      <div style={styles.page}>
        <div style={styles.errorPanel}>
          Your account is not assigned to a
          company. Sign out and contact a Trustera
          administrator.
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.eyebrow}>
            ACCOUNTABILITY RECORD
          </div>

          <h1 style={styles.pageTitle}>
            Audit Logs
          </h1>

          <p style={styles.subText}>
            Review important system activity and
            administrative actions recorded for
            your organisation.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            fetchLogs({
              showLoading: false,
            })
          }
          style={{
            ...styles.refreshButton,
            ...(refreshing
              ? styles.disabledButton
              : {}),
          }}
          disabled={refreshing}
        >
          {refreshing
            ? 'Refreshing...'
            : 'Refresh'}
        </button>
      </div>

      {loadError && (
        <div style={styles.errorBanner}>
          <strong>
            Audit logs could not be loaded.
          </strong>

          <span>{loadError}</span>
        </div>
      )}

      <div style={styles.statsGrid}>
        {[
          'all',
          'create',
          'update',
          'delete',
          'access',
        ].map((category) => (
          <StatCard
            key={category}
            meta={ACTION_META[category]}
            value={
              categoryCounts[category]
            }
            active={
              actionFilter === category
            }
            onClick={() =>
              setActionFilter(category)
            }
          />
        ))}
      </div>

      <div style={styles.legendCard}>
        <div>
          <h2 style={styles.sectionTitle}>
            Action legend
          </h2>

          <p style={styles.sectionText}>
            Each colour identifies the type of
            activity recorded in the audit trail.
          </p>
        </div>

        <div style={styles.legendGrid}>
          {[
            'create',
            'update',
            'delete',
            'access',
            'other',
          ].map((category) => {
            const meta =
              ACTION_META[category]

            return (
              <button
                key={category}
                type="button"
                onClick={() =>
                  setActionFilter(category)
                }
                style={{
                  ...styles.legendItem,
                  ...(actionFilter ===
                  category
                    ? styles.legendItemActive
                    : {}),
                }}
              >
                <span
                  style={{
                    ...styles.legendIcon,
                    background:
                      meta.accent,
                  }}
                >
                  {meta.icon}
                </span>

                <span>
                  <strong
                    style={
                      styles.legendLabel
                    }
                  >
                    {meta.label}
                  </strong>

                  <span
                    style={
                      styles.legendDescription
                    }
                  >
                    {meta.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={styles.filterCard}>
        <div style={styles.filterHeader}>
          <div>
            <h2 style={styles.sectionTitle}>
              Activity history
            </h2>

            <p style={styles.sectionText}>
              Showing {filteredLogs.length} of{' '}
              {logs.length} records ·{' '}
              {activeFilterLabel}
            </p>
          </div>

          {(actionFilter !== 'all' ||
            search) && (
            <button
              type="button"
              onClick={() => {
                setActionFilter('all')
                setSearch('')
              }}
              style={styles.clearButton}
            >
              Clear filters
            </button>
          )}
        </div>

        <div style={styles.filterRow}>
          <div style={styles.searchWrapper}>
            <span style={styles.searchIcon}>
              ⌕
            </span>

            <input
              type="text"
              placeholder="Search by action, entity, user or details..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              style={styles.searchInput}
            />
          </div>

          <select
            value={actionFilter}
            onChange={(event) =>
              setActionFilter(
                event.target.value,
              )
            }
            style={styles.filterSelect}
          >
            <option value="all">
              All Actions
            </option>

            <option value="create">
              Create
            </option>

            <option value="update">
              Update
            </option>

            <option value="delete">
              Delete
            </option>

            <option value="access">
              Access
            </option>

            <option value="other">
              Other
            </option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={styles.emptyState}>
          <div style={styles.spinner} />

          <strong>
            Loading audit logs...
          </strong>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            ✓
          </div>

          <strong>
            No matching audit logs found.
          </strong>

          <span style={styles.emptySubText}>
            {logs.length === 0
              ? 'No audit activity has been recorded for this organisation yet.'
              : 'Try changing the action filter or search term.'}
          </span>
        </div>
      ) : (
        <div style={styles.tableCard}>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>
                    Action
                  </th>

                  <th style={styles.th}>
                    Entity Type
                  </th>

                  <th style={styles.th}>
                    Entity
                  </th>

                  <th style={styles.th}>
                    Details
                  </th>

                  <th style={styles.th}>
                    User
                  </th>

                  <th style={styles.th}>
                    Logged At
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredLogs.map((log) => {
                  const appearance =
                    getActionAppearance(
                      log.action,
                    )

                  const safeDetails =
                    getSafeDetailEntries(
                      log.details,
                    )

                  const isExpanded =
                    expandedLogId === log.id

                  const userEmail =
                    getUserEmail(log)

                  const isCurrentUser =
                    userEmail &&
                    currentUserEmail &&
                    userEmail.toLowerCase() ===
                      currentUserEmail.toLowerCase()

                  return (
                    <tr
                      key={log.id}
                      style={styles.tableRow}
                    >
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            background:
                              appearance.background,
                            color:
                              appearance.color,
                            border: `1px solid ${appearance.border}`,
                          }}
                        >
                          <span
                            style={
                              styles.badgeIcon
                            }
                          >
                            {appearance.icon}
                          </span>

                          {formatAction(
                            log.action,
                          )}
                        </span>
                      </td>

                      <td style={styles.td}>
                        <span
                          style={
                            styles.entityTypeBadge
                          }
                        >
                          {formatEntityType(
                            log.entity_type,
                          )}
                        </span>
                      </td>

                      <td style={styles.td}>
                        <div
                          style={
                            styles.entityName
                          }
                        >
                          {getEntityName(log)}
                        </div>
                      </td>

                      <td
                        style={
                          styles.detailsCell
                        }
                      >
                        <div
                          style={
                            styles.detailSummary
                          }
                        >
                          <span
                            style={{
                              ...styles.detailIcon,
                              background:
                                appearance.accent,
                            }}
                          >
                            {appearance.icon}
                          </span>

                          <span>
                            {getFriendlyDetail(
                              log,
                            )}
                          </span>
                        </div>

                        {safeDetails.length >
                          0 && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLogId(
                                  isExpanded
                                    ? null
                                    : log.id,
                                )
                              }
                              style={
                                styles.detailsToggle
                              }
                            >
                              {isExpanded
                                ? 'Hide details'
                                : 'View details'}
                            </button>

                            {isExpanded && (
                              <dl
                                style={
                                  styles.detailsList
                                }
                              >
                                {safeDetails.map(
                                  ([
                                    key,
                                    value,
                                  ]) => (
                                    <div
                                      key={key}
                                      style={
                                        styles.detailsItem
                                      }
                                    >
                                      <dt
                                        style={
                                          styles.detailsKey
                                        }
                                      >
                                        {humaniseKey(
                                          key,
                                        )}
                                      </dt>

                                      <dd
                                        style={
                                          styles.detailsValue
                                        }
                                      >
                                        {formatDetailValue(
                                          value,
                                        )}
                                      </dd>
                                    </div>
                                  ),
                                )}
                              </dl>
                            )}
                          </>
                        )}
                      </td>

                      <td style={styles.td}>
                        <div
                          style={
                            styles.userCell
                          }
                        >
                          <span
                            style={
                              styles.userAvatar
                            }
                          >
                            {String(
                              userEmail || 'S',
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </span>

                          <span
                            style={
                              styles.userIdentity
                            }
                          >
                            <span>
                              {userEmail ||
                                'System'}
                            </span>

                            {isCurrentUser && (
                              <span
                                style={
                                  styles.youBadge
                                }
                              >
                                You
                              </span>
                            )}
                          </span>
                        </div>
                      </td>

                      <td style={styles.td}>
                        {formatDate(
                          log.created_at,
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  meta,
  value,
  active,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.statCard,
        ...(active
          ? styles.statCardActive
          : {}),
      }}
    >
      <span
        style={{
          ...styles.statIcon,
          background: meta.accent,
        }}
      >
        {meta.icon}
      </span>

      <span style={styles.statText}>
        <strong style={styles.statValue}>
          {value}
        </strong>

        <span style={styles.statTitle}>
          {meta.label}
        </span>

        <span
          style={styles.statDescription}
        >
          {meta.description}
        </span>
      </span>
    </button>
  )
}

const styles = {
  page: {
    padding: '32px',
    color: '#ffffff',
    background: '#020617',
    minHeight: 'calc(100vh - 72px)',
  },

  eyebrow: {
    marginBottom: '8px',
    color: '#60a5fa',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.14em',
  },

  pageTitle: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: '28px',
  },

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '24px',
  },

  subText: {
    maxWidth: '720px',
    color: '#94a3b8',
    lineHeight: 1.65,
    marginTop: '8px',
    marginBottom: 0,
  },

  refreshButton: {
    padding: '12px 16px',
    border: 'none',
    borderRadius: '9px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 800,
    cursor: 'pointer',
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.6,
  },

  errorBanner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '20px',
    padding: '14px 16px',
    border: '1px solid #991b1b',
    borderRadius: '10px',
    background: '#450a0a',
    color: '#fecaca',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },

  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
    minHeight: '112px',
    padding: '18px',
    textAlign: 'left',
    background: '#0f172a',
    color: '#ffffff',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    cursor: 'pointer',
  },

  statCardActive: {
    border: '1px solid #60a5fa',
    boxShadow:
      '0 0 0 1px rgba(96, 165, 250, 0.2)',
  },

  statIcon: {
    width: '48px',
    height: '48px',
    flex: '0 0 48px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50%',
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 800,
  },

  statText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },

  statValue: {
    fontSize: '22px',
    lineHeight: 1.1,
  },

  statTitle: {
    marginTop: '4px',
    fontWeight: 800,
  },

  statDescription: {
    marginTop: '3px',
    color: '#94a3b8',
    fontSize: '12px',
  },

  legendCard: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(220px, 0.7fr) minmax(360px, 1.3fr)',
    gap: '22px',
    alignItems: 'center',
    marginBottom: '24px',
    padding: '20px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
  },

  sectionTitle: {
    margin: 0,
    fontSize: '18px',
  },

  sectionText: {
    marginTop: '6px',
    marginBottom: 0,
    color: '#94a3b8',
    lineHeight: 1.55,
  },

  legendGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(155px, 1fr))',
    gap: '10px',
  },

  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '11px',
    textAlign: 'left',
    background: '#020617',
    color: '#ffffff',
    border: '1px solid #334155',
    borderRadius: '10px',
    cursor: 'pointer',
  },

  legendItemActive: {
    borderColor: '#60a5fa',
    background: '#0b1730',
  },

  legendIcon: {
    width: '30px',
    height: '30px',
    flex: '0 0 30px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50%',
    color: '#ffffff',
    fontWeight: 800,
  },

  legendLabel: {
    display: 'block',
    fontSize: '13px',
  },

  legendDescription: {
    display: 'block',
    marginTop: '2px',
    color: '#94a3b8',
    fontSize: '11px',
  },

  filterCard: {
    marginBottom: '18px',
    padding: '20px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
  },

  filterHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '14px',
    marginBottom: '16px',
  },

  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },

  searchWrapper: {
    position: 'relative',
    minWidth: '280px',
    flex: 1,
  },

  searchIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
    fontSize: '18px',
    pointerEvents: 'none',
  },

  searchInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px 14px 14px 42px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
    fontSize: '14px',
  },

  filterSelect: {
    minWidth: '190px',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
  },

  clearButton: {
    padding: 0,
    background: 'transparent',
    color: '#60a5fa',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
  },

  tableCard: {
    overflow: 'hidden',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
  },

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '1250px',
    borderCollapse: 'collapse',
  },

  tableRow: {
    background: '#020617',
  },

  th: {
    borderBottom: '1px solid #334155',
    borderRight: '1px solid #334155',
    padding: '13px',
    background: '#0f172a',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    fontSize: '13px',
  },

  td: {
    borderBottom: '1px solid #334155',
    borderRight: '1px solid #334155',
    padding: '13px',
    verticalAlign: 'top',
  },

  detailsCell: {
    minWidth: '320px',
    borderBottom: '1px solid #334155',
    borderRight: '1px solid #334155',
    padding: '13px',
    verticalAlign: 'top',
  },

  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },

  badgeIcon: {
    lineHeight: 1,
  },

  entityTypeBadge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    background: '#1e293b',
    color: '#cbd5e1',
    border: '1px solid #334155',
    fontSize: '12px',
    fontWeight: 700,
  },

  entityName: {
    fontWeight: 700,
  },

  detailSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    lineHeight: 1.45,
  },

  detailIcon: {
    width: '28px',
    height: '28px',
    flex: '0 0 28px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50%',
    color: '#ffffff',
    fontWeight: 800,
  },

  detailsToggle: {
    marginTop: '9px',
    padding: 0,
    background: 'transparent',
    color: '#60a5fa',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },

  detailsList: {
    display: 'grid',
    gap: '7px',
    marginTop: '10px',
    marginBottom: 0,
    padding: '10px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
  },

  detailsItem: {
    display: 'grid',
    gridTemplateColumns: '130px 1fr',
    gap: '10px',
    margin: 0,
  },

  detailsKey: {
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 700,
  },

  detailsValue: {
    margin: 0,
    color: '#e2e8f0',
    fontSize: '12px',
    overflowWrap: 'anywhere',
  },

  userCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
  },

  userIdentity: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px',
    overflowWrap: 'anywhere',
  },

  userAvatar: {
    width: '28px',
    height: '28px',
    flex: '0 0 28px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50%',
    background: '#2563eb',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 800,
  },

  youBadge: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '999px',
    border: '1px solid #1d4ed8',
    background: '#172554',
    color: '#bfdbfe',
    fontSize: '10px',
    fontWeight: 800,
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '42px 28px',
    border: '1px solid #334155',
    borderRadius: '14px',
    background: '#0f172a',
    color: '#cbd5e1',
    textAlign: 'center',
  },

  emptyIcon: {
    width: '48px',
    height: '48px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50%',
    background: '#1e293b',
    color: '#60a5fa',
    fontSize: '24px',
    fontWeight: 800,
  },

  emptySubText: {
    color: '#94a3b8',
    fontSize: '13px',
  },

  spinner: {
    width: '38px',
    height: '38px',
    border: '4px solid #1e293b',
    borderTopColor: '#3b82f6',
    borderRadius: '999px',
    animation:
      'trustera-dashboard-spin 0.8s linear infinite',
  },

  accessDeniedCard: {
    width: '100%',
    maxWidth: '580px',
    margin: '90px auto',
    padding: '32px',
    border: '1px solid #92400e',
    borderRadius: '16px',
    background: '#451a03',
    color: '#fde68a',
    textAlign: 'center',
  },

  accessDeniedIcon: {
    width: '52px',
    height: '52px',
    display: 'grid',
    placeItems: 'center',
    margin: '0 auto 16px',
    border: '1px solid #d97706',
    borderRadius: '50%',
    background: '#78350f',
    fontSize: '26px',
    fontWeight: 900,
  },

  accessDeniedTitle: {
    margin: '0 0 10px',
    color: '#ffffff',
    fontSize: '24px',
  },

  accessDeniedText: {
    margin: 0,
    color: '#fde68a',
    lineHeight: 1.65,
  },

  errorPanel: {
    maxWidth: '640px',
    margin: '80px auto',
    padding: '24px',
    border: '1px solid #7f1d1d',
    borderRadius: '12px',
    background: '#450a0a',
    color: '#fecaca',
    textAlign: 'center',
  },
}