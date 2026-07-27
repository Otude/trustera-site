import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'

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

export default function AuditLogs({ profile }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [expandedLogId, setExpandedLogId] = useState(null)

  const companyId = profile?.company_id || null

  const fetchLogs = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!companyId) {
        setLogs([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (showLoading) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select(`
            id,
            company_id,
            user_id,
            user_email,
            action,
            entity_type,
            entity_id,
            entity_name,
            details,
            created_at
          `)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })

        if (error) {
          throw error
        }

        setLogs(data || [])
      } catch (error) {
        console.error('Unable to load audit logs:', error)
        toast.error(error?.message || 'Unable to load audit logs.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [companyId],
  )

  useEffect(() => {
    if (!companyId) {
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
        (payload) => {
          if (payload.new?.company_id !== companyId) {
            return
          }

          setLogs((current) => {
            const alreadyExists = current.some(
              (item) => item.id === payload.new.id,
            )

            if (alreadyExists) {
              return current
            }

            return [payload.new, ...current]
          })

          toast.success('A new audit event was recorded.')
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Audit log Realtime channel failed.')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, fetchLogs])

  function normaliseAction(action) {
    return String(action || '')
      .trim()
      .toLowerCase()
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
  }

  function formatAction(action) {
    const normalised = normaliseAction(action)

    if (!normalised) return 'Unknown Action'

    return normalised
      .split(' ')
      .filter(Boolean)
      .map(
        (word) =>
          word.charAt(0).toUpperCase() + word.slice(1),
      )
      .join(' ')
  }

  function formatEntityType(entityType) {
    const value = String(entityType || '')
      .trim()
      .toLowerCase()
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')

    if (!value) return '-'

    return value
      .split(' ')
      .filter(Boolean)
      .map(
        (word) =>
          word.charAt(0).toUpperCase() + word.slice(1),
      )
      .join(' ')
  }

  function formatDate(dateValue) {
    if (!dateValue) return '-'

    const date = new Date(dateValue)

    if (Number.isNaN(date.getTime())) {
      return '-'
    }

    return date.toLocaleString('en-GB')
  }

  function getActionCategory(action) {
    const normalised = normaliseAction(action)

    if (
      normalised.includes('delete') ||
      normalised.includes('remove')
    ) {
      return 'delete'
    }

    if (
      normalised.includes('update') ||
      normalised.includes('edit') ||
      normalised.includes('change') ||
      normalised.includes('mark')
    ) {
      return 'update'
    }

    if (
      normalised.includes('create') ||
      normalised.includes('upload') ||
      normalised.includes('add') ||
      normalised.includes('insert') ||
      normalised.includes('request')
    ) {
      return 'create'
    }

    if (
      normalised.includes('login') ||
      normalised.includes('sign in') ||
      normalised.includes('view') ||
      normalised.includes('download') ||
      normalised.includes('access')
    ) {
      return 'access'
    }

    return 'other'
  }

  function parseDetails(details) {
    if (!details) return {}

    if (typeof details === 'object' && !Array.isArray(details)) {
      return details
    }

    try {
      const parsed = JSON.parse(String(details))

      if (typeof parsed === 'object' && parsed !== null) {
        return parsed
      }
    } catch {
      return {
        message: String(details),
      }
    }

    return {}
  }

  function humaniseKey(key) {
    return String(key || '')
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  function isSensitiveDetailKey(key) {
    const value = String(key || '').toLowerCase()

    return (
      value === 'id' ||
      value.endsWith('_id') ||
      value.includes('uuid') ||
      value.includes('path') ||
      value.includes('token') ||
      value.includes('identifier')
    )
  }

  function getSafeDetailEntries(details) {
    return Object.entries(parseDetails(details))
      .filter(([key, value]) => {
        if (isSensitiveDetailKey(key)) return false
        if (value === null || value === undefined || value === '') {
          return false
        }

        return typeof value !== 'object'
      })
      .slice(0, 8)
  }

  function getFriendlyDetail(log) {
    const details = parseDetails(log.details)
    const category = getActionCategory(log.action)
    const entityName =
      log.entity_name ||
      details.worker_name ||
      details.document_type ||
      formatEntityType(log.entity_type)

    if (category === 'create') {
      if (normaliseAction(log.action).includes('upload')) {
        return `${entityName || 'Document'} uploaded successfully`
      }

      return `${entityName || 'Record'} created`
    }

    if (category === 'update') {
      return `${entityName || 'Record'} updated`
    }

    if (category === 'delete') {
      return `${entityName || 'Record'} deleted`
    }

    if (category === 'access') {
      if (normaliseAction(log.action).includes('login')) {
        return 'User signed in'
      }

      return `${entityName || 'Record'} accessed`
    }

    if (details.message) {
      return String(details.message)
    }

    return 'System activity recorded'
  }

  function getActionAppearance(action) {
    const category = getActionCategory(action)
    const meta = ACTION_META[category]

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
      category,
    }
  }

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase()

    return logs.filter((log) => {
      const action = normaliseAction(log.action)
      const entityType = String(
        log.entity_type || '',
      ).toLowerCase()
      const entityName = String(
        log.entity_name || '',
      ).toLowerCase()
      const userEmail = String(
        log.user_email || '',
      ).toLowerCase()
      const friendlyDetail =
        getFriendlyDetail(log).toLowerCase()
      const safeDetails = getSafeDetailEntries(log.details)
        .map(([key, value]) => `${key} ${value}`)
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
        getActionCategory(log.action) === actionFilter

      return matchesSearch && matchesFilter
    })
  }, [actionFilter, logs, search])

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
      const category = getActionCategory(log.action)
      counts[category] += 1
    })

    return counts
  }, [logs])

  const activeFilterLabel =
    ACTION_META[actionFilter]?.label || 'Audit Logs'

  if (!companyId) {
    return (
      <div style={styles.page}>
        <div style={styles.errorPanel}>
          Your account is not assigned to a company. Sign out and
          contact an administrator.
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.eyebrow}>ACCOUNTABILITY RECORD</div>

          <h1 style={styles.pageTitle}>Audit Logs</h1>

          <p style={styles.subText}>
            Review important system activity and administrative
            actions recorded for your organisation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchLogs({ showLoading: false })}
          style={{
            ...styles.refreshButton,
            ...(refreshing ? styles.disabledButton : {}),
          }}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={styles.statsGrid}>
        {['all', 'create', 'update', 'delete', 'access'].map(
          (category) => (
            <StatCard
              key={category}
              meta={ACTION_META[category]}
              value={categoryCounts[category]}
              active={actionFilter === category}
              onClick={() => setActionFilter(category)}
            />
          ),
        )}
      </div>

      <div style={styles.legendCard}>
        <div>
          <h2 style={styles.sectionTitle}>Action legend</h2>

          <p style={styles.sectionText}>
            Each colour identifies the type of activity recorded in
            the audit trail.
          </p>
        </div>

        <div style={styles.legendGrid}>
          {['create', 'update', 'delete', 'access', 'other'].map(
            (category) => {
              const meta = ACTION_META[category]

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActionFilter(category)}
                  style={{
                    ...styles.legendItem,
                    ...(actionFilter === category
                      ? styles.legendItemActive
                      : {}),
                  }}
                >
                  <span
                    style={{
                      ...styles.legendIcon,
                      background: meta.accent,
                    }}
                  >
                    {meta.icon}
                  </span>

                  <span>
                    <strong style={styles.legendLabel}>
                      {meta.label}
                    </strong>

                    <span style={styles.legendDescription}>
                      {meta.description}
                    </span>
                  </span>
                </button>
              )
            },
          )}
        </div>
      </div>

      <div style={styles.filterCard}>
        <div style={styles.filterHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Activity history</h2>

            <p style={styles.sectionText}>
              Showing {filteredLogs.length} of {logs.length} records ·{' '}
              {activeFilterLabel}
            </p>
          </div>

          {(actionFilter !== 'all' || search) && (
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
            <span style={styles.searchIcon}>⌕</span>

            <input
              type="text"
              placeholder="Search by action, entity, user or details..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={styles.searchInput}
            />
          </div>

          <select
            value={actionFilter}
            onChange={(event) =>
              setActionFilter(event.target.value)
            }
            style={styles.filterSelect}
          >
            <option value="all">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="access">Access</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>◌</div>
          <strong>Loading audit logs...</strong>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>✓</div>
          <strong>No matching audit logs found.</strong>
          <span style={styles.emptySubText}>
            Try changing the action filter or search term.
          </span>
        </div>
      ) : (
        <div style={styles.tableCard}>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Entity Type</th>
                  <th style={styles.th}>Entity</th>
                  <th style={styles.th}>Details</th>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Logged At</th>
                </tr>
              </thead>

              <tbody>
                {filteredLogs.map((log) => {
                  const appearance =
                    getActionAppearance(log.action)
                  const safeDetails = getSafeDetailEntries(
                    log.details,
                  )
                  const isExpanded = expandedLogId === log.id

                  return (
                    <tr key={log.id} style={styles.tableRow}>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            background: appearance.background,
                            color: appearance.color,
                            border: `1px solid ${appearance.border}`,
                          }}
                        >
                          <span style={styles.badgeIcon}>
                            {appearance.icon}
                          </span>

                          {formatAction(log.action)}
                        </span>
                      </td>

                      <td style={styles.td}>
                        <span style={styles.entityTypeBadge}>
                          {formatEntityType(log.entity_type)}
                        </span>
                      </td>

                      <td style={styles.td}>
                        <div style={styles.entityName}>
                          {log.entity_name || '-'}
                        </div>
                      </td>

                      <td style={styles.detailsCell}>
                        <div style={styles.detailSummary}>
                          <span
                            style={{
                              ...styles.detailIcon,
                              background: appearance.accent,
                            }}
                          >
                            {appearance.icon}
                          </span>

                          <span>{getFriendlyDetail(log)}</span>
                        </div>

                        {safeDetails.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLogId(
                                  isExpanded ? null : log.id,
                                )
                              }
                              style={styles.detailsToggle}
                            >
                              {isExpanded
                                ? 'Hide details'
                                : 'View details'}
                            </button>

                            {isExpanded && (
                              <dl style={styles.detailsList}>
                                {safeDetails.map(([key, value]) => (
                                  <div
                                    key={key}
                                    style={styles.detailsItem}
                                  >
                                    <dt style={styles.detailsKey}>
                                      {humaniseKey(key)}
                                    </dt>

                                    <dd style={styles.detailsValue}>
                                      {String(value)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </>
                        )}
                      </td>

                      <td style={styles.td}>
                        <div style={styles.userCell}>
                          <span style={styles.userAvatar}>
                            {String(
                              log.user_email || 'U',
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </span>

                          <span>{log.user_email || '-'}</span>
                        </div>
                      </td>

                      <td style={styles.td}>
                        {formatDate(log.created_at)}
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

function StatCard({ meta, value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.statCard,
        ...(active ? styles.statCardActive : {}),
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
        <strong style={styles.statValue}>{value}</strong>
        <span style={styles.statTitle}>{meta.label}</span>
        <span style={styles.statDescription}>
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
    minHeight: '100vh',
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
    boxShadow: '0 0 0 1px rgba(96, 165, 250, 0.2)',
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