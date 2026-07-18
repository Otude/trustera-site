import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'

export default function Notifications({ profile }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [markingId, setMarkingId] = useState(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const companyId = profile?.company_id || null

  const fetchNotifications = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!companyId) {
        setNotifications([])
        setLoading(false)
        return
      }

      if (showLoading) {
        setLoading(true)
      }

      try {
        const { data, error } = await supabase
          .from('notification_logs')
          .select(`
            id,
            company_id,
            document_id,
            worker_name,
            document_type,
            expiry_date,
            status,
            message,
            sent_to,
            sent_at,
            is_read,
            read_at,
            severity
          `)
          .eq('company_id', companyId)
          .order('sent_at', { ascending: false })

        if (error) {
          throw error
        }

        setNotifications(data || [])
      } catch (error) {
        console.error('Unable to load notifications:', error)
        toast.error(error?.message || 'Unable to load notifications.')
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
      setNotifications([])
      setLoading(false)
      return undefined
    }

    fetchNotifications()

    const channel = supabase
      .channel(`notification-logs-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_logs',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          if (
            payload.eventType === 'INSERT' &&
            payload.new?.company_id === companyId &&
            payload.new?.message
          ) {
            toast(payload.new.message, {
              icon:
                payload.new.status === 'expired'
                  ? '🚨'
                  : payload.new.status === 'expiring soon'
                    ? '⚠️'
                    : '🔔',
            })
          }

          fetchNotifications({ showLoading: false })
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Notification Realtime channel failed.')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, fetchNotifications])

  function requireCompanyId() {
    if (!companyId) {
      throw new Error('Your profile is not assigned to a company.')
    }

    return companyId
  }

  async function markAsRead(notification) {
    if (markingId || notification.is_read) return

    try {
      const currentCompanyId = requireCompanyId()
      const readTime = new Date().toISOString()

      if (notification.company_id !== currentCompanyId) {
        throw new Error(
          'You cannot update another company’s notification.',
        )
      }

      setMarkingId(notification.id)

      const { data, error } = await supabase
        .from('notification_logs')
        .update({
          is_read: true,
          read_at: readTime,
        })
        .eq('id', notification.id)
        .eq('company_id', currentCompanyId)
        .select('id, is_read, read_at')
        .single()

      if (error) {
        throw error
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === data.id
            ? {
                ...item,
                is_read: data.is_read,
                read_at: data.read_at,
              }
            : item,
        ),
      )

      toast.success('Notification marked as read.')
    } catch (error) {
      console.error('Unable to mark notification as read:', error)
      toast.error(
        error?.message || 'Unable to mark the notification as read.',
      )
    } finally {
      setMarkingId(null)
    }
  }

  async function markAllAsRead() {
    if (markingAll) return

    const unreadIds = notifications
      .filter(
        (item) =>
          item.company_id === companyId &&
          item.is_read !== true,
      )
      .map((item) => item.id)

    if (unreadIds.length === 0) {
      toast.success('All notifications are already read.')
      return
    }

    try {
      const currentCompanyId = requireCompanyId()
      const readTime = new Date().toISOString()

      setMarkingAll(true)

      const { data, error } = await supabase
        .from('notification_logs')
        .update({
          is_read: true,
          read_at: readTime,
        })
        .eq('company_id', currentCompanyId)
        .in('id', unreadIds)
        .select('id, is_read, read_at')

      if (error) {
        throw error
      }

      const updatedNotifications = new Map(
        (data || []).map((item) => [item.id, item]),
      )

      setNotifications((current) =>
        current.map((item) => {
          const updatedItem = updatedNotifications.get(item.id)

          if (!updatedItem) {
            return item
          }

          return {
            ...item,
            is_read: updatedItem.is_read,
            read_at: updatedItem.read_at,
          }
        }),
      )

      toast.success('All notifications marked as read.')
    } catch (error) {
      console.error('Unable to mark all notifications as read:', error)
      toast.error(
        error?.message ||
          'Unable to mark all notifications as read.',
      )
    } finally {
      setMarkingAll(false)
    }
  }

  async function deleteNotification(notification) {
    if (deletingId) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this notification?',
    )

    if (!confirmed) return

    try {
      const currentCompanyId = requireCompanyId()

      if (notification.company_id !== currentCompanyId) {
        throw new Error(
          'You cannot delete another company’s notification.',
        )
      }

      setDeletingId(notification.id)

      const { data, error } = await supabase
        .from('notification_logs')
        .delete()
        .eq('id', notification.id)
        .eq('company_id', currentCompanyId)
        .select('id')
        .single()

      if (error) {
        throw error
      }

      setNotifications((current) =>
        current.filter((item) => item.id !== data.id),
      )

      toast.success('Notification deleted.')
    } catch (error) {
      console.error('Unable to delete notification:', error)
      toast.error(
        error?.message || 'Unable to delete the notification.',
      )
    } finally {
      setDeletingId(null)
    }
  }

  function normaliseStatus(status) {
    return String(status || '')
      .trim()
      .toLowerCase()
      .replaceAll('_', ' ')
  }

  function getStatusStyle(status) {
    const normalisedStatus = normaliseStatus(status)

    if (normalisedStatus === 'expired') {
      return {
        background: '#7f1d1d',
        color: '#fecaca',
      }
    }

    if (normalisedStatus === 'expiring soon') {
      return {
        background: '#78350f',
        color: '#fde68a',
      }
    }

    return {
      background: '#064e3b',
      color: '#bbf7d0',
    }
  }

  function getSeverityStyle(severity) {
    const value = String(severity || '').toLowerCase()

    if (value === 'critical' || value === 'high') {
      return {
        background: '#7f1d1d',
        color: '#fecaca',
      }
    }

    if (value === 'warning' || value === 'medium') {
      return {
        background: '#78350f',
        color: '#fde68a',
      }
    }

    return {
      background: '#1e3a8a',
      color: '#dbeafe',
    }
  }

  function formatDate(dateValue) {
    if (!dateValue) return '-'

    const date = new Date(dateValue)

    if (Number.isNaN(date.getTime())) {
      return '-'
    }

    return date.toLocaleString('en-GB')
  }

  const unreadCount = useMemo(
    () =>
      notifications.filter((item) => item.is_read !== true).length,
    [notifications],
  )

  const readCount = useMemo(
    () => notifications.filter((item) => item.is_read === true).length,
    [notifications],
  )

  const expiredCount = useMemo(
    () =>
      notifications.filter(
        (item) => normaliseStatus(item.status) === 'expired',
      ).length,
    [notifications],
  )

  const expiringSoonCount = useMemo(
    () =>
      notifications.filter(
        (item) =>
          normaliseStatus(item.status) === 'expiring soon',
      ).length,
    [notifications],
  )

  const filteredNotifications = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()

    return notifications.filter((item) => {
      const status = normaliseStatus(item.status)

      const matchesSearch =
        !searchTerm ||
        item.message?.toLowerCase().includes(searchTerm) ||
        item.worker_name?.toLowerCase().includes(searchTerm) ||
        item.document_type?.toLowerCase().includes(searchTerm) ||
        status.includes(searchTerm) ||
        item.expiry_date?.toLowerCase().includes(searchTerm) ||
        item.severity?.toLowerCase().includes(searchTerm)

      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && item.is_read !== true) ||
        (filter === 'read' && item.is_read === true) ||
        status === filter

      return matchesSearch && matchesFilter
    })
  }, [filter, notifications, search])

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
          <h1 style={styles.pageTitle}>Notification Center</h1>

          <p style={styles.subText}>
            {unreadCount} unread · {readCount} read ·{' '}
            {notifications.length} total
          </p>
        </div>

        <button
          type="button"
          onClick={markAllAsRead}
          style={{
            ...styles.primaryButton,
            ...(markingAll || unreadCount === 0
              ? styles.disabledButton
              : {}),
          }}
          disabled={markingAll || unreadCount === 0}
        >
          {markingAll ? 'Marking...' : 'Mark All As Read'}
        </button>
      </div>

      <div style={styles.statsGrid}>
        <StatCard title="Unread" value={unreadCount} />
        <StatCard title="Read" value={readCount} />
        <StatCard title="Expired" value={expiredCount} />
        <StatCard
          title="Expiring Soon"
          value={expiringSoonCount}
        />
      </div>

      <div style={styles.filterRow}>
        <input
          type="text"
          placeholder="Search notifications..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={styles.searchInput}
        />

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          style={styles.filterSelect}
        >
          <option value="all">All Notifications</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="expired">Expired</option>
          <option value="expiring soon">Expiring Soon</option>
        </select>
      </div>

      {loading ? (
        <div style={styles.emptyState}>
          Loading notifications...
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div style={styles.emptyState}>
          No matching notifications found.
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Read</th>
                <th style={styles.th}>Message</th>
                <th style={styles.th}>Worker</th>
                <th style={styles.th}>Document</th>
                <th style={styles.th}>Expiry Date</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Severity</th>
                <th style={styles.th}>Logged At</th>
                <th style={styles.th}>Read At</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredNotifications.map((item) => {
                const itemStatus = normaliseStatus(item.status)
                const isMarking = markingId === item.id
                const isDeleting = deletingId === item.id

                return (
                  <tr
                    key={item.id}
                    style={
                      item.is_read
                        ? styles.readRow
                        : styles.unreadRow
                    }
                  >
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...(item.is_read
                            ? styles.readBadge
                            : styles.unreadBadge),
                        }}
                      >
                        {item.is_read ? 'read' : 'unread'}
                      </span>
                    </td>

                    <td style={styles.td}>
                      {item.message || '-'}
                    </td>

                    <td style={styles.td}>
                      {item.worker_name || '-'}
                    </td>

                    <td style={styles.td}>
                      {item.document_type || '-'}
                    </td>

                    <td style={styles.td}>
                      {item.expiry_date || '-'}
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...getStatusStyle(itemStatus),
                        }}
                      >
                        {itemStatus || 'unknown'}
                      </span>
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...getSeverityStyle(item.severity),
                        }}
                      >
                        {item.severity || 'normal'}
                      </span>
                    </td>

                    <td style={styles.td}>
                      {formatDate(item.sent_at)}
                    </td>

                    <td style={styles.td}>
                      {formatDate(item.read_at)}
                    </td>

                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        {!item.is_read && (
                          <button
                            type="button"
                            onClick={() => markAsRead(item)}
                            style={{
                              ...styles.readButton,
                              ...(isMarking
                                ? styles.disabledButton
                                : {}),
                            }}
                            disabled={isMarking || isDeleting}
                          >
                            {isMarking
                              ? 'Marking...'
                              : 'Mark Read'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            deleteNotification(item)
                          }
                          style={{
                            ...styles.deleteButton,
                            ...(isDeleting
                              ? styles.disabledButton
                              : {}),
                          }}
                          disabled={isDeleting || isMarking}
                        >
                          {isDeleting
                            ? 'Deleting...'
                            : 'Delete'}
                        </button>
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

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },

  statCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '18px',
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
    minWidth: '260px',
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

  primaryButton: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 16px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.6,
  },

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '1300px',
    borderCollapse: 'collapse',
  },

  th: {
    border: '1px solid #334155',
    padding: '12px',
    background: '#0f172a',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },

  td: {
    border: '1px solid #334155',
    padding: '12px',
    verticalAlign: 'middle',
  },

  unreadRow: {
    background: '#111827',
  },

  readRow: {
    background: '#020617',
    opacity: 0.78,
  },

  badge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  },

  unreadBadge: {
    background: '#1d4ed8',
    color: '#dbeafe',
  },

  readBadge: {
    background: '#334155',
    color: '#cbd5e1',
  },

  actionButtons: {
    display: 'flex',
    gap: '8px',
    whiteSpace: 'nowrap',
  },

  readButton: {
    background: '#2563eb',
    border: 'none',
    color: '#ffffff',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  deleteButton: {
    background: '#dc2626',
    border: 'none',
    color: '#ffffff',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
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