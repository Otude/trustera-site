import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'
import { can } from '../utils/permissions'

const STATUS_META = {
  unread: {
    label: 'Unread',
    description: 'Requires your attention',
    icon: '✉',
    accent: '#2563eb',
    background: '#172554',
    foreground: '#dbeafe',
  },
  read: {
    label: 'Read',
    description: 'Already reviewed',
    icon: '✓',
    accent: '#16a34a',
    background: '#052e16',
    foreground: '#bbf7d0',
  },
  expired: {
    label: 'Expired',
    description: 'Requires immediate action',
    icon: '!',
    accent: '#dc2626',
    background: '#450a0a',
    foreground: '#fecaca',
  },
  'expiring soon': {
    label: 'Expiring Soon',
    description: 'Within 30 days',
    icon: '◷',
    accent: '#d97706',
    background: '#451a03',
    foreground: '#fde68a',
  },
}

export default function Notifications({ profile }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [markingId, setMarkingId] = useState(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const companyId = profile?.company_id || null
  const role = String(profile?.role || '')
    .trim()
    .toLowerCase()

  const canViewNotifications = can(
    profile,
    'viewNotifications',
  )

  const canDeleteNotifications = [
    'admin',
    'manager',
    'compliance_officer',
  ].includes(role)

  const fetchNotifications = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!companyId || !canViewNotifications) {
        setNotifications([])
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
        setLoading(false)
        setRefreshing(false)
      }
    },
    [canViewNotifications, companyId],
  )

  useEffect(() => {
    if (!companyId || !canViewNotifications) {
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
                normaliseStatus(payload.new.status) === 'expired'
                  ? '🚨'
                  : normaliseStatus(payload.new.status) === 'expiring soon'
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
  }, [canViewNotifications, companyId, fetchNotifications])

  function requireCompanyId() {
    if (!companyId) {
      throw new Error('Your profile is not assigned to a company.')
    }

    return companyId
  }

  async function markAsRead(notification) {
    if (
      !canViewNotifications ||
      markingId ||
      notification.is_read
    ) {
      return
    }

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
    if (!canViewNotifications || markingAll) return

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
    if (!canDeleteNotifications) {
      toast.error(
        'Your role does not allow notification deletion.',
      )
      return
    }

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

  function getStatusMeta(status) {
    return (
      STATUS_META[normaliseStatus(status)] || {
        label: normaliseStatus(status) || 'Unknown',
        description: 'Status unavailable',
        icon: '•',
        accent: '#475569',
        background: '#1e293b',
        foreground: '#e2e8f0',
      }
    )
  }

  function getSeverityStyle(severity) {
    const value = String(severity || '').toLowerCase()

    if (value === 'critical' || value === 'high') {
      return {
        background: '#7f1d1d',
        color: '#fecaca',
        border: '1px solid #991b1b',
      }
    }

    if (value === 'warning' || value === 'medium') {
      return {
        background: '#78350f',
        color: '#fde68a',
        border: '1px solid #92400e',
      }
    }

    return {
      background: '#1e3a8a',
      color: '#dbeafe',
      border: '1px solid #1d4ed8',
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
        String(item.message || '').toLowerCase().includes(searchTerm) ||
        String(item.worker_name || '').toLowerCase().includes(searchTerm) ||
        String(item.document_type || '').toLowerCase().includes(searchTerm) ||
        status.includes(searchTerm) ||
        String(item.expiry_date || '').toLowerCase().includes(searchTerm) ||
        String(item.severity || '').toLowerCase().includes(searchTerm)

      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && item.is_read !== true) ||
        (filter === 'read' && item.is_read === true) ||
        status === filter

      return matchesSearch && matchesFilter
    })
  }, [filter, notifications, search])

  const activeFilterLabel = useMemo(() => {
    if (filter === 'all') return 'All notifications'
    if (filter === 'unread') return 'Unread notifications'
    if (filter === 'read') return 'Read notifications'

    return getStatusMeta(filter).label
  }, [filter])

  if (!canViewNotifications) {
    return (
      <div style={styles.page}>
        <div style={styles.accessDeniedPanel}>
          <h1 style={styles.accessDeniedTitle}>
            Notification access restricted
          </h1>

          <p style={styles.accessDeniedText}>
            Your current Trustera role does not allow access to
            organisation notifications.
          </p>
        </div>
      </div>
    )
  }

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
          <div style={styles.eyebrow}>COMPLIANCE ALERTS</div>
          <h1 style={styles.pageTitle}>Notification Center</h1>

          <p style={styles.subText}>
            Review expiry warnings, critical document alerts and
            notification history for your organisation.
          </p>
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            onClick={() =>
              fetchNotifications({ showLoading: false })
            }
            style={{
              ...styles.secondaryButton,
              ...(refreshing ? styles.disabledButton : {}),
            }}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

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
      </div>

      {!canDeleteNotifications && (
        <div style={styles.permissionNotice}>
          You can review and mark notifications as read, but your
          role cannot permanently delete notification records.
        </div>
      )}

      <div style={styles.statsGrid}>
        <StatCard
          meta={STATUS_META.unread}
          value={unreadCount}
          active={filter === 'unread'}
          onClick={() => setFilter('unread')}
        />

        <StatCard
          meta={STATUS_META.read}
          value={readCount}
          active={filter === 'read'}
          onClick={() => setFilter('read')}
        />

        <StatCard
          meta={STATUS_META.expired}
          value={expiredCount}
          active={filter === 'expired'}
          onClick={() => setFilter('expired')}
        />

        <StatCard
          meta={STATUS_META['expiring soon']}
          value={expiringSoonCount}
          active={filter === 'expiring soon'}
          onClick={() => setFilter('expiring soon')}
        />
      </div>

      <div style={styles.legendCard}>
        <div>
          <h2 style={styles.sectionTitle}>Notification status guide</h2>
          <p style={styles.sectionText}>
            Colours indicate whether a notification is unread,
            reviewed, expired or approaching expiry.
          </p>
        </div>

        <div style={styles.legendGrid}>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                ...styles.legendItem,
                ...(filter === key ? styles.legendItemActive : {}),
              }}
            >
              <span
                style={{
                  ...styles.legendDot,
                  background: meta.accent,
                }}
              />

              <span>
                <strong style={styles.legendLabel}>
                  {meta.label}
                </strong>
                <span style={styles.legendDescription}>
                  {meta.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={styles.filterCard}>
        <div style={styles.filterHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Notification history</h2>
            <p style={styles.sectionText}>
              Showing {filteredNotifications.length} of{' '}
              {notifications.length} records · {activeFilterLabel}
            </p>
          </div>

          {(filter !== 'all' || search) && (
            <button
              type="button"
              onClick={() => {
                setFilter('all')
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
              placeholder="Search by worker, document, status or message..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={styles.searchInput}
            />
          </div>

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
      </div>

      {loading ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>◌</div>
          <strong>Loading notifications...</strong>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>✓</div>
          <strong>No matching notifications found.</strong>
          <span style={styles.emptySubText}>
            Try changing the selected filter or search term.
          </span>
        </div>
      ) : (
        <div style={styles.tableCard}>
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
                  const statusMeta = getStatusMeta(itemStatus)
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
                          <span style={styles.badgeIcon}>
                            {item.is_read ? '✓' : '●'}
                          </span>
                          {item.is_read ? 'Read' : 'Unread'}
                        </span>
                      </td>

                      <td style={styles.messageCell}>
                        <div style={styles.messageContent}>
                          <span
                            style={{
                              ...styles.messageIndicator,
                              background: statusMeta.accent,
                            }}
                          />

                          <span>{item.message || '-'}</span>
                        </div>
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
                            background: statusMeta.background,
                            color: statusMeta.foreground,
                            border: `1px solid ${statusMeta.accent}`,
                          }}
                        >
                          <span style={styles.badgeIcon}>
                            {statusMeta.icon}
                          </span>
                          {statusMeta.label}
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

                          {canDeleteNotifications && (
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
                          )}
                        </div>
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

  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },

  subText: {
    maxWidth: '720px',
    color: '#94a3b8',
    lineHeight: 1.65,
    marginTop: '8px',
    marginBottom: 0,
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
    transition: 'border-color 0.2s ease, transform 0.2s ease',
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
    fontSize: '22px',
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
      'minmax(220px, 0.75fr) minmax(320px, 1.25fr)',
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
      'repeat(auto-fit, minmax(150px, 1fr))',
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

  legendDot: {
    width: '11px',
    height: '11px',
    flex: '0 0 11px',
    borderRadius: '50%',
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

  primaryButton: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '9px',
    padding: '12px 16px',
    cursor: 'pointer',
    fontWeight: 800,
  },

  secondaryButton: {
    background: '#1e293b',
    color: '#ffffff',
    border: '1px solid #334155',
    borderRadius: '9px',
    padding: '12px 16px',
    cursor: 'pointer',
    fontWeight: 800,
  },

  clearButton: {
    padding: 0,
    background: 'transparent',
    color: '#60a5fa',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.6,
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
    minWidth: '1420px',
    borderCollapse: 'collapse',
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
    verticalAlign: 'middle',
  },

  messageCell: {
    minWidth: '340px',
    borderBottom: '1px solid #334155',
    borderRight: '1px solid #334155',
    padding: '13px',
    verticalAlign: 'middle',
  },

  messageContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    lineHeight: 1.5,
  },

  messageIndicator: {
    width: '4px',
    minHeight: '34px',
    flex: '0 0 4px',
    borderRadius: '999px',
  },

  unreadRow: {
    background: '#111827',
  },

  readRow: {
    background: '#020617',
    opacity: 0.82,
  },

  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  },

  badgeIcon: {
    lineHeight: 1,
  },

  unreadBadge: {
    background: '#1d4ed8',
    color: '#dbeafe',
    border: '1px solid #2563eb',
  },

  readBadge: {
    background: '#334155',
    color: '#cbd5e1',
    border: '1px solid #475569',
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
    borderRadius: '7px',
    cursor: 'pointer',
    fontWeight: 800,
  },

  deleteButton: {
    background: '#dc2626',
    border: 'none',
    color: '#ffffff',
    padding: '8px 12px',
    borderRadius: '7px',
    cursor: 'pointer',
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

  permissionNotice: {
    maxWidth: '760px',
    marginBottom: '20px',
    padding: '14px 16px',
    border: '1px solid #92400e',
    borderRadius: '10px',
    background: '#78350f',
    color: '#fde68a',
    lineHeight: 1.5,
  },

  accessDeniedPanel: {
    maxWidth: '640px',
    margin: '80px auto',
    padding: '28px',
    border: '1px solid #92400e',
    borderRadius: '14px',
    background: '#451a03',
    color: '#fde68a',
    textAlign: 'center',
  },

  accessDeniedTitle: {
    margin: '0 0 10px',
    color: '#ffffff',
    fontSize: '24px',
  },

  accessDeniedText: {
    margin: 0,
    lineHeight: 1.6,
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