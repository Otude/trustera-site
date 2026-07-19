import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

export default function Header({ profile }) {
  const [alerts, setAlerts] = useState(0)
  const [email, setEmail] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [recentAlerts, setRecentAlerts] = useState([])

  const dropdownRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    getUser()
    getAlerts()
    getRecentAlerts()

    const channel = supabase
      .channel('header-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_logs',
        },
        (payload) => {
          getAlerts()
          getRecentAlerts()

          if (payload.eventType === 'INSERT' && payload.new?.message) {
            toast.error(payload.new.message)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  async function getUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      setEmail(user.email)
    }
  }

  async function getAlerts() {
    const { count, error } = await supabase
      .from('notification_logs')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)

    if (error) {
      console.log(error.message)
      return
    }

    setAlerts(count || 0)
  }

  async function getRecentAlerts() {
    const { data, error } = await supabase
      .from('notification_logs')
      .select(`
        id,
        message,
        document_type,
        expiry_date,
        status,
        sent_at,
        is_read
      `)
      .eq('is_read', false)
      .order('sent_at', { ascending: false })
      .limit(5)

    if (error) {
      console.log(error.message)
      return
    }

    setRecentAlerts(data || [])
  }

  async function markAlertAsRead(id) {
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

    setRecentAlerts((current) => current.filter((item) => item.id !== id))
    setAlerts((current) => Math.max(current - 1, 0))

    toast.success('Notification marked as read.')
  }

  async function markAllAlertsAsRead() {
    if (recentAlerts.length === 0) {
      toast.success('No unread alerts.')
      return
    }

    const unreadIds = recentAlerts.map((item) => item.id)
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

    setRecentAlerts([])
    setAlerts(0)

    toast.success('Alerts marked as read.')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function isActive(path) {
    return location.pathname === path
  }

  function formatDate(dateValue) {
    if (!dateValue) return '-'
    return new Date(dateValue).toLocaleString()
  }

  function getStatusStyle(status) {
    if (status === 'expired') {
      return styles.statusExpired
    }

    if (status === 'expiring soon') {
      return styles.statusSoon
    }

    return styles.statusValid
  }

  return (
    <header style={styles.header}>
      <div style={styles.leftSection}>
        <h2 style={styles.logo}>Trustera</h2>

        <button
          style={styles.mobileButton}
          onClick={() => setMobileMenu(!mobileMenu)}
        >
          ☰
        </button>

        <nav
          style={{
            ...styles.nav,
            ...(mobileMenu ? styles.mobileNavOpen : {}),
          }}
        >
          <NavLink to="/" label="Dashboard" active={isActive('/')} />

          <NavLink
            to="/workers"
            label="Workers"
            active={isActive('/workers')}
          />

          {profile?.role === 'admin' && (
            <NavLink
              to="/add-worker"
              label="Add Worker"
              active={isActive('/add-worker')}
            />
          )}

          <NavLink
            to="/documents"
            label="Documents"
            active={isActive('/documents')}
          />

          <NavLink
            to="/notifications"
            label="Notifications"
            active={isActive('/notifications')}
          />

          {profile?.role === 'admin' && (
            <NavLink
              to="/audit-logs"
              label="Audit Logs"
              active={isActive('/audit-logs')}
            />
          )}
        </nav>
      </div>

      <div style={styles.rightSection}>
        <div style={styles.alertWrapper} ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              ...styles.alertButton,
              ...(alerts > 0 ? styles.alertActive : styles.alertInactive),
            }}
          >
            🔔 Alerts: {alerts}
          </button>

          {dropdownOpen && (
            <div style={styles.alertDropdown}>
              <div style={styles.dropdownHeader}>
                <div>
                  <strong>Unread Alerts</strong>
                  <p style={styles.dropdownSubText}>
                    {alerts} unread notification(s)
                  </p>
                </div>

                <button
                  onClick={markAllAlertsAsRead}
                  style={styles.smallButton}
                >
                  Mark all read
                </button>
              </div>

              {recentAlerts.length === 0 ? (
                <p style={styles.emptyDropdown}>No unread alerts.</p>
              ) : (
                <div style={styles.alertList}>
                  {recentAlerts.map((item) => (
                    <div key={item.id} style={styles.alertItem}>
                      <div style={styles.alertItemTop}>
                        <strong>{item.message || '-'}</strong>

                        <span
                          style={{
                            ...styles.statusBadge,
                            ...getStatusStyle(item.status),
                          }}
                        >
                          {item.status || 'unknown'}
                        </span>
                      </div>

                      <p style={styles.alertMeta}>
                        {item.document_type || '-'} · Expiry:{' '}
                        {item.expiry_date || '-'}
                      </p>

                      <p style={styles.alertMeta}>
                        Logged: {formatDate(item.sent_at)}
                      </p>

                      <button
                        onClick={() => markAlertAsRead(item.id)}
                        style={styles.markReadButton}
                      >
                        Mark read
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Link
                to="/notifications"
                onClick={() => setDropdownOpen(false)}
                style={styles.viewAllLink}
              >
                View Notification Center
              </Link>
            </div>
          )}
        </div>

        <div style={styles.userBox}>
          <div style={styles.avatar}>{email?.charAt(0)?.toUpperCase()}</div>

          <div style={styles.userDetails}>
            <span style={styles.email}>{email}</span>

            <span style={styles.role}>{profile?.role || 'user'}</span>
          </div>
        </div>

        <button onClick={handleLogout} style={styles.logoutButton}>
          Logout
        </button>
      </div>
    </header>
  )
}

function NavLink({ to, label, active }) {
  return (
    <Link
      to={to}
      style={{
        ...styles.link,
        ...(active ? styles.activeLink : {}),
      }}
    >
      {label}
    </Link>
  )
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 24px',
    borderBottom: '1px solid #1e293b',
    background: '#020817',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    flexWrap: 'wrap',
    gap: '20px',
  },

  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '30px',
  },

  logo: {
    color: 'white',
    margin: 0,
    fontSize: '24px',
  },

  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },

  link: {
    color: '#cbd5e1',
    textDecoration: 'none',
    fontWeight: '600',
    padding: '10px 14px',
    borderRadius: '8px',
    transition: '0.2s ease',
  },

  activeLink: {
    background: '#1e293b',
    color: 'white',
  },

  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },

  alertWrapper: {
    position: 'relative',
  },

  alertButton: {
    padding: '12px 18px',
    borderRadius: '10px',
    textDecoration: 'none',
    fontWeight: 'bold',
    transition: '0.2s ease',
    border: 'none',
    cursor: 'pointer',
  },

  alertActive: {
    background: '#991b1b',
    color: 'white',
  },

  alertInactive: {
    background: '#14532d',
    color: '#bbf7d0',
  },

  alertDropdown: {
    position: 'absolute',
    top: '54px',
    right: 0,
    width: '380px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '14px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
    padding: '16px',
    zIndex: 2000,
  },

  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start',
    borderBottom: '1px solid #334155',
    paddingBottom: '12px',
    marginBottom: '12px',
    color: 'white',
  },

  dropdownSubText: {
    color: '#94a3b8',
    margin: '4px 0 0',
    fontSize: '13px',
  },

  smallButton: {
    background: '#2563eb',
    border: 'none',
    color: 'white',
    padding: '8px 10px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px',
  },

  emptyDropdown: {
    color: '#94a3b8',
    margin: '14px 0',
  },

  alertList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '360px',
    overflowY: 'auto',
  },

  alertItem: {
    background: '#020617',
    border: '1px solid #1e293b',
    borderRadius: '10px',
    padding: '12px',
    color: 'white',
  },

  alertItemTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    alignItems: 'flex-start',
  },

  statusBadge: {
    padding: '5px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },

  statusExpired: {
    background: '#7f1d1d',
    color: '#fecaca',
  },

  statusSoon: {
    background: '#78350f',
    color: '#fde68a',
  },

  statusValid: {
    background: '#064e3b',
    color: '#bbf7d0',
  },

  alertMeta: {
    color: '#94a3b8',
    margin: '6px 0',
    fontSize: '13px',
  },

  markReadButton: {
    background: '#2563eb',
    border: 'none',
    color: 'white',
    padding: '8px 10px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginTop: '6px',
  },

  viewAllLink: {
    display: 'block',
    marginTop: '14px',
    textAlign: 'center',
    color: '#93c5fd',
    textDecoration: 'none',
    fontWeight: 'bold',
  },

  userBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '10px 14px',
  },

  avatar: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    background: '#2563eb',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '18px',
  },

  userDetails: {
    display: 'flex',
    flexDirection: 'column',
  },

  email: {
    color: '#93c5fd',
    fontSize: '14px',
  },

  role: {
    color: '#94a3b8',
    fontSize: '12px',
    textTransform: 'capitalize',
  },

  logoutButton: {
    background: '#ef4444',
    border: 'none',
    color: 'white',
    padding: '12px 18px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  mobileButton: {
    display: 'none',
    background: '#1e293b',
    border: 'none',
    color: 'white',
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '18px',
  },

  mobileNavOpen: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    marginTop: '16px',
    alignItems: 'flex-start',
  },
}