import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

export default function AuditLogs({ profile }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  useEffect(() => {
    fetchLogs()

    const channel = supabase
      .channel('audit_logs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audit_logs',
        },
        () => {
          fetchLogs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchLogs() {
    setLoading(true)

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setLogs(data || [])
    setLoading(false)
  }

  function formatDate(dateValue) {
    if (!dateValue) return '-'

    return new Date(dateValue).toLocaleString()
  }

  function getActionStyle(action) {
    const normalized = action?.toLowerCase()

    if (normalized?.includes('delete')) {
      return {
        background: '#7f1d1d',
        color: '#fecaca',
      }
    }

    if (
      normalized?.includes('update') ||
      normalized?.includes('edit')
    ) {
      return {
        background: '#78350f',
        color: '#fde68a',
      }
    }

    if (
      normalized?.includes('create') ||
      normalized?.includes('upload') ||
      normalized?.includes('add')
    ) {
      return {
        background: '#064e3b',
        color: '#bbf7d0',
      }
    }

    return {
      background: '#1e293b',
      color: '#cbd5e1',
    }
  }

  const filteredLogs = logs.filter((log) => {
    const term = search.toLowerCase()

    const matchesSearch =
      log.action?.toLowerCase().includes(term) ||
      log.table_name?.toLowerCase().includes(term) ||
      log.user_email?.toLowerCase().includes(term) ||
      log.description?.toLowerCase().includes(term)

    const matchesFilter =
      actionFilter === 'all' ||
      log.action?.toLowerCase().includes(actionFilter)

    return matchesSearch && matchesFilter
  })

  const createCount = logs.filter(
    (log) =>
      log.action?.toLowerCase().includes('create') ||
      log.action?.toLowerCase().includes('upload') ||
      log.action?.toLowerCase().includes('add')
  ).length

  const updateCount = logs.filter(
    (log) =>
      log.action?.toLowerCase().includes('update') ||
      log.action?.toLowerCase().includes('edit')
  ).length

  const deleteCount = logs.filter((log) =>
    log.action?.toLowerCase().includes('delete')
  ).length

  if (loading) {
    return (
      <div style={styles.page}>
        <h1>Audit Logs</h1>
        <p style={styles.emptyText}>Loading audit logs...</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1>Audit Logs</h1>

          <p style={styles.subText}>
            Track system activity and administrative actions.
          </p>
        </div>
      </div>

      <div style={styles.statsGrid}>
        <StatCard title="Total Logs" value={logs.length} />
        <StatCard title="Create Actions" value={createCount} />
        <StatCard title="Update Actions" value={updateCount} />
        <StatCard title="Delete Actions" value={deleteCount} />
      </div>

      <div style={styles.filterRow}>
        <input
          type="text"
          placeholder="Search audit logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="all">All Actions</option>
          <option value="create">Create</option>
          <option value="upload">Upload</option>
          <option value="update">Update</option>
          <option value="edit">Edit</option>
          <option value="delete">Delete</option>
        </select>
      </div>

      {filteredLogs.length === 0 ? (
        <p style={styles.emptyText}>No audit logs found.</p>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Table</th>
                <th style={styles.th}>Description</th>
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
                      {log.action || '-'}
                    </span>
                  </td>

                  <td style={styles.td}>
                    {log.table_name || '-'}
                  </td>

                  <td style={styles.td}>
                    {log.description || '-'}
                  </td>

                  <td style={styles.td}>
                    {log.user_email || '-'}
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
      <h2>{value}</h2>
      <p>{title}</p>
    </div>
  )
}

const styles = {
  page: {
    padding: '40px',
    color: 'white',
    background: '#020617',
    minHeight: '100vh',
  },

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },

  subText: {
    color: '#94a3b8',
    marginTop: '8px',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },

  statCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '22px',
  },

  filterRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
  },

  searchInput: {
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
  },

  filterSelect: {
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
  },

  tableWrapper: {
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },

  th: {
    border: '1px solid #334155',
    padding: '14px',
    background: '#0f172a',
    textAlign: 'left',
  },

  td: {
    border: '1px solid #334155',
    padding: '14px',
    verticalAlign: 'top',
  },

  badge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
    display: 'inline-block',
    textTransform: 'capitalize',
  },

  emptyText: {
    color: '#94a3b8',
  },
}