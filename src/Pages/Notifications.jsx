import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchNotifications()

    const channel = supabase
      .channel('notification_logs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_logs',
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new?.message) {
            toast.error(payload.new.message)
          }

          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchNotifications() {
    setLoading(true)

    const { data, error } = await supabase
      .from('notification_logs')
      .select(`
        id,
        message,
        document_type,
        expiry_date,
        status,
        sent_at,
        is_read,
        read_at
      `)
      .order('sent_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setNotifications(data || [])
    setLoading(false)
  }

  async function markAsRead(id) {
    const readTime = new Date().toISOString()

    const { error } = await supabase
      .from('notification_logs')
      .update({
        is_read: true,
        read_at: readTime,
      })
      .eq('id', id)

    if (error) {
      toast.error(error.message)
      return
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              is_read: true,
              read_at: readTime,
            }
          : item
      )
    )

    toast.success('Notification marked as read.')
  }

  async function markAllAsRead() {
    const unreadIds = notifications
      .filter((item) => !item.is_read)
      .map((item) => item.id)

    if (unreadIds.length === 0) {
      toast.success('All notifications are already read.')
      return
    }

    const readTime = new Date().toISOString()

    const { error } = await supabase
      .from('notification_logs')
      .update({
        is_read: true,
        read_at: readTime,
      })
      .in('id', unreadIds)

    if (error) {
      toast.error(error.message)
      return
    }

    setNotifications((current) =>
      current.map((item) =>
        unreadIds.includes(item.id)
          ? {
              ...item,
              is_read: true,
              read_at: readTime,
            }
          : item
      )
    )

    toast.success('All notifications marked as read.')
  }

  async function deleteNotification(id) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this notification?'
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('notification_logs')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error(error.message)
      return
    }

    setNotifications((current) => current.filter((item) => item.id !== id))

    toast.success('Notification deleted.')
  }

  function getStatusStyle(status) {
    if (status === 'expired') {
      return { background: '#7f1d1d', color: '#fecaca' }
    }

    if (status === 'expiring soon') {
      return { background: '#78350f', color: '#fde68a' }
    }

    return { background: '#064e3b', color: '#bbf7d0' }
  }

  function formatDate(dateValue) {
    if (!dateValue) return '-'
    return new Date(dateValue).toLocaleString()
  }

  const unreadCount = notifications.filter((item) => !item.is_read).length
  const readCount = notifications.filter((item) => item.is_read).length

  const expiredCount = notifications.filter(
    (item) => item.status === 'expired'
  ).length

  const expiringSoonCount = notifications.filter(
    (item) => item.status === 'expiring soon'
  ).length

  const filteredNotifications = notifications.filter((item) => {
    const term = search.toLowerCase()

    const matchesSearch =
      item.message?.toLowerCase().includes(term) ||
      item.document_type?.toLowerCase().includes(term) ||
      item.status?.toLowerCase().includes(term) ||
      item.expiry_date?.toLowerCase().includes(term)

    const matchesFilter =
      filter === 'all' ||
      (filter === 'unread' && !item.is_read) ||
      (filter === 'read' && item.is_read) ||
      item.status === filter

    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <div style={styles.page}>
        <h1>Notification Center</h1>
        <p style={styles.emptyText}>Loading notifications...</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1>Notification Center</h1>
          <p style={styles.subText}>
            {unreadCount} unread · {readCount} read · {notifications.length}{' '}
            total
          </p>
        </div>

        <button onClick={markAllAsRead} style={styles.primaryButton}>
          Mark All As Read
        </button>
      </div>

      <div style={styles.statsGrid}>
        <StatCard title="Unread" value={unreadCount} />
        <StatCard title="Read" value={readCount} />
        <StatCard title="Expired" value={expiredCount} />
        <StatCard title="Expiring Soon" value={expiringSoonCount} />
      </div>

      <div style={styles.filterRow}>
        <input
          type="text"
          placeholder="Search notifications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="all">All Notifications</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="expired">Expired</option>
          <option value="expiring soon">Expiring Soon</option>
        </select>
      </div>

      {filteredNotifications.length === 0 ? (
        <p style={styles.emptyText}>No matching notifications found.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Read</th>
              <th style={styles.th}>Message</th>
              <th style={styles.th}>Document</th>
              <th style={styles.th}>Expiry Date</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Logged At</th>
              <th style={styles.th}>Read At</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredNotifications.map((item) => (
              <tr
                key={item.id}
                style={item.is_read ? styles.readRow : styles.unreadRow}
              >
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.badge,
                      ...(item.is_read ? styles.readBadge : styles.unreadBadge),
                    }}
                  >
                    {item.is_read ? 'read' : 'unread'}
                  </span>
                </td>

                <td style={styles.td}>{item.message || '-'}</td>
                <td style={styles.td}>{item.document_type || '-'}</td>
                <td style={styles.td}>{item.expiry_date || '-'}</td>

                <td style={styles.td}>
                  <span
                    style={{
                      ...getStatusStyle(item.status),
                      ...styles.badge,
                    }}
                  >
                    {item.status || 'unknown'}
                  </span>
                </td>

                <td style={styles.td}>{formatDate(item.sent_at)}</td>
                <td style={styles.td}>{formatDate(item.read_at)}</td>

                <td style={styles.td}>
                  {!item.is_read && (
                    <button
                      onClick={() => markAsRead(item.id)}
                      style={styles.readButton}
                    >
                      Mark Read
                    </button>
                  )}

                  <button
                    onClick={() => deleteNotification(item.id)}
                    style={styles.deleteButton}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    gap: '20px',
    marginBottom: '24px',
  },

  subText: {
    color: '#94a3b8',
    marginTop: '8px',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },

  statCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '18px',
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

  emptyText: {
    color: '#94a3b8',
  },

  primaryButton: {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 16px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  table: {
    width: '100%',
    marginTop: '30px',
    borderCollapse: 'collapse',
  },

  th: {
    border: '1px solid #334155',
    padding: '12px',
    background: '#0f172a',
    textAlign: 'left',
  },

  td: {
    border: '1px solid #334155',
    padding: '12px',
  },

  unreadRow: {
    background: '#111827',
  },

  readRow: {
    background: '#020617',
    opacity: 0.75,
  },

  badge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
    display: 'inline-block',
  },

  unreadBadge: {
    background: '#1d4ed8',
    color: '#dbeafe',
  },

  readBadge: {
    background: '#334155',
    color: '#cbd5e1',
  },

  readButton: {
    background: '#2563eb',
    border: 'none',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginRight: '8px',
  },

  deleteButton: {
    background: '#dc2626',
    border: 'none',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}