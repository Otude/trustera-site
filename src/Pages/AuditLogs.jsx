import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'

export default function AuditLogs({ profile }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  const companyId = profile?.company_id || null

  const fetchLogs = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!companyId) {
        setLogs([])
        setLoading(false)
        return
      }

      if (showLoading) {
        setLoading(true)
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
        if (showLoading) {
          setLoading(false)
        }
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

    if (!normalised) return '-'

    return normalised
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

  function formatDetails(details) {
    if (!details) return '-'

    if (typeof details === 'object') {
      return JSON.stringify(details, null, 2)
    }

    const text = String(details)

    try {
      const parsed = JSON.parse(text)

      if (typeof parsed === 'object' && parsed !== null) {
        return JSON.stringify(parsed, null, 2)
      }
    } catch {
      // The value is plain text rather than JSON.
    }

    return text
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
      normalised.includes('download')
    ) {
      return 'access'
    }

    return 'other'
  }

  function getActionStyle(action) {
    const category = getActionCategory(action)

    if (category === 'delete') {
      return {
        background: '#7f1d1d',
        color: '#fecaca',
      }
    }

    if (category === 'update') {
      return {
        background: '#78350f',
        color: '#fde68a',
      }
    }

    if (category === 'create') {
      return {
        background: '#064e3b',
        color: '#bbf7d0',
      }
    }

    if (category === 'access') {
      return {
        background: '#1e3a8a',
        color: '#dbeafe',
      }
    }

    return {
      background: '#1e293b',
      color: '#cbd5e1',
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
      const details = formatDetails(log.details).toLowerCase()

      const matchesSearch =
        !term ||
        action.includes(term) ||
        entityType.includes(term) ||
        entityName.includes(term) ||
        userEmail.includes(term) ||
        details.includes(term)

      const matchesFilter =
        actionFilter === 'all' ||
        getActionCategory(log.action) === actionFilter

      return matchesSearch && matchesFilter
    })
  }, [actionFilter, logs, search])

  const createCount = useMemo(
    () =>
      logs.filter(
        (log) => getActionCategory(log.action) === 'create',
      ).length,
    [logs],
  )

  const updateCount = useMemo(
    () =>
      logs.filter(
        (log) => getActionCategory(log.action) === 'update',
      ).length,
    [logs],
  )

  const deleteCount = useMemo(
    () =>
      logs.filter(
        (log) => getActionCategory(log.action) === 'delete',
      ).length,
    [logs],
  )

  const accessCount = useMemo(
    () =>
      logs.filter(
        (log) => getActionCategory(log.action) === 'access',
      ).length,
    [logs],
  )

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
          <h1 style={styles.pageTitle}>Audit Logs</h1>

          <p style={styles.subText}>
            Review system activity and administrative actions for
            your organisation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchLogs()}
          style={styles.refreshButton}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={styles.statsGrid}>
        <StatCard title="Total Logs" value={logs.length} />
        <StatCard title="Create Actions" value={createCount} />
        <StatCard title="Update Actions" value={updateCount} />
        <StatCard title="Delete Actions" value={deleteCount} />
        <StatCard title="Access Actions" value={accessCount} />
      </div>

      <div style={styles.filterRow}>
        <input
          type="text"
          placeholder="Search by action, entity, user, or details..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={styles.searchInput}
        />

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

      {loading ? (
        <div style={styles.emptyState}>
          Loading audit logs...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div style={styles.emptyState}>
          No matching audit logs found.
        </div>
      ) : (
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
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        ...getActionStyle(log.action),
                      }}
                    >
                      {formatAction(log.action)}
                    </span>
                  </td>

                  <td style={styles.td}>
                    {log.entity_type || '-'}
                  </td>

                  <td style={styles.td}>
                    <div style={styles.entityName}>
                      {log.entity_name || '-'}
                    </div>

                    {log.entity_id && (
                      <div style={styles.entityId}>
                        ID: {log.entity_id}
                      </div>
                    )}
                  </td>

                  <td style={styles.td}>
                    <pre style={styles.detailsText}>
                      {formatDetails(log.details)}
                    </pre>
                  </td>

                  <td style={styles.td}>
                    <div>{log.user_email || '-'}</div>

                    {log.user_id && (
                      <div style={styles.userId}>
                        ID: {log.user_id}
                      </div>
                    )}
                  </td>

                  <td style={styles.td}>
                    {formatDate(log.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div style={styles.statCard}>
      <h2 style={styles.statValue}>{value}</h2>
      <p style={styles.statTitle}>{title}</p>
    </div>
  )
}

const styles = {
  page: {
    padding: '40px',
    color: '#ffffff',
    background: '#020617',
    minHeight: '100vh',
  },

  pageTitle: {
    marginTop: 0,
    marginBottom: 0,
  },

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '24px',
  },

  subText: {
    color: '#94a3b8',
    marginTop: '8px',
    marginBottom: 0,
  },

  refreshButton: {
    padding: '12px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '30px',
  },

  statCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '22px',
  },

  statValue: {
    marginTop: 0,
    marginBottom: '8px',
  },

  statTitle: {
    margin: 0,
  },

  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    marginBottom: '24px',
  },

  searchInput: {
    minWidth: '280px',
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
  },

  filterSelect: {
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
  },

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '1200px',
    borderCollapse: 'collapse',
  },

  th: {
    border: '1px solid #334155',
    padding: '14px',
    background: '#0f172a',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },

  td: {
    border: '1px solid #334155',
    padding: '14px',
    verticalAlign: 'top',
  },

  badge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },

  entityName: {
    fontWeight: 600,
  },

  entityId: {
    marginTop: '6px',
    color: '#64748b',
    fontSize: '11px',
    overflowWrap: 'anywhere',
  },

  userId: {
    marginTop: '6px',
    color: '#64748b',
    fontSize: '11px',
    overflowWrap: 'anywhere',
  },

  detailsText: {
    margin: 0,
    maxWidth: '420px',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontFamily: 'inherit',
    color: '#cbd5e1',
  },

  emptyState: {
    padding: '28px',
    border: '1px solid #334155',
    borderRadius: '12px',
    background: '#0f172a',
    color: '#94a3b8',
    textAlign: 'center',
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