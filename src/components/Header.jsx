// src/components/Header.jsx

import {
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'
import {
  can,
  getRoleLabel,
  isPlatformAdmin as profileIsPlatformAdmin,
} from '../utils/permissions'

const RECENT_ALERT_LIMIT = 5

function normaliseStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
}

function getSafeEmail(session, profile) {
  return String(
    session?.user?.email ||
      profile?.email ||
      '',
  ).trim()
}

function getEmailPrefix(email) {
  const value = String(email || '').trim()

  if (!value) return ''

  return value.includes('@')
    ? value.split('@')[0]
    : value
}

export default function Header({
  profile,
  session,
  isPlatformAdmin = false,
}) {
  const [alerts, setAlerts] = useState(0)

  const [email, setEmail] = useState(() =>
    getSafeEmail(session, profile),
  )

  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false)

  const [
    dropdownOpen,
    setDropdownOpen,
  ] = useState(false)

  const [
    recentAlerts,
    setRecentAlerts,
  ] = useState([])

  const [
    alertsLoading,
    setAlertsLoading,
  ] = useState(false)

  const [
    signingOut,
    setSigningOut,
  ] = useState(false)

  const [
    markingAllRead,
    setMarkingAllRead,
  ] = useState(false)

  const [
    markingReadId,
    setMarkingReadId,
  ] = useState(null)

  const dropdownRef = useRef(null)
  const mobileMenuRef = useRef(null)
  const mountedRef = useRef(false)
  const alertRequestIdRef = useRef(0)

  const navigate = useNavigate()
  const location = useLocation()

  const companyId =
    profile?.company_id || null

  const hasCompany = Boolean(companyId)

  const hasPlatformAccess =
    Boolean(isPlatformAdmin) ||
    Boolean(profile?.is_platform_admin) ||
    profileIsPlatformAdmin(profile)

  const canViewWorkers =
    hasCompany &&
    can(profile, 'viewWorkers')

  const canAddWorkers =
    hasCompany &&
    can(profile, 'addWorkers')

  const canViewDocuments =
    hasCompany &&
    can(profile, 'viewDocuments')

  const canViewNotifications =
    hasCompany &&
    can(profile, 'viewNotifications')

  const canViewAuditLogs =
    hasCompany &&
    can(profile, 'viewAuditLogs')

  const canManageTeam =
    hasCompany &&
    can(profile, 'manageTeam')

  const canManagePlatform =
    hasPlatformAccess &&
    can(profile, 'managePlatform')

  const defaultHomeRoute =
    hasPlatformAccess && !hasCompany
      ? '/platform-admin'
      : '/dashboard'

  const getAlerts = useCallback(
    async (requestId) => {
      if (
        !companyId ||
        !canViewNotifications
      ) {
        if (
          mountedRef.current &&
          alertRequestIdRef.current === requestId
        ) {
          setAlerts(0)
        }

        return
      }

      const { count, error } = await supabase
        .from('notification_logs')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('company_id', companyId)
        .eq('is_read', false)

      if (
        !mountedRef.current ||
        alertRequestIdRef.current !== requestId
      ) {
        return
      }

      if (error) {
        console.error(
          'Unable to load unread alert count:',
          error,
        )

        return
      }

      setAlerts(count || 0)
    },
    [
      canViewNotifications,
      companyId,
    ],
  )

  const getRecentAlerts = useCallback(
    async (requestId) => {
      if (
        !companyId ||
        !canViewNotifications
      ) {
        if (
          mountedRef.current &&
          alertRequestIdRef.current === requestId
        ) {
          setRecentAlerts([])
        }

        return
      }

      const { data, error } = await supabase
        .from('notification_logs')
        .select(`
          id,
          company_id,
          message,
          document_type,
          expiry_date,
          status,
          severity,
          sent_at,
          is_read,
          read_at
        `)
        .eq('company_id', companyId)
        .eq('is_read', false)
        .order('sent_at', {
          ascending: false,
          nullsFirst: false,
        })
        .limit(RECENT_ALERT_LIMIT)

      if (
        !mountedRef.current ||
        alertRequestIdRef.current !== requestId
      ) {
        return
      }

      if (error) {
        console.error(
          'Unable to load recent alerts:',
          error,
        )

        return
      }

      setRecentAlerts(data || [])
    },
    [
      canViewNotifications,
      companyId,
    ],
  )

  const refreshAlerts = useCallback(
    async ({
      showLoading = true,
    } = {}) => {
      const requestId =
        alertRequestIdRef.current + 1

      alertRequestIdRef.current = requestId

      if (
        !companyId ||
        !canViewNotifications
      ) {
        if (mountedRef.current) {
          setAlerts(0)
          setRecentAlerts([])
          setAlertsLoading(false)
        }

        return
      }

      if (
        showLoading &&
        mountedRef.current
      ) {
        setAlertsLoading(true)
      }

      try {
        await Promise.all([
          getAlerts(requestId),
          getRecentAlerts(requestId),
        ])
      } finally {
        if (
          mountedRef.current &&
          alertRequestIdRef.current === requestId
        ) {
          setAlertsLoading(false)
        }
      }
    },
    [
      canViewNotifications,
      companyId,
      getAlerts,
      getRecentAlerts,
    ],
  )

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      alertRequestIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    setEmail(
      getSafeEmail(session, profile),
    )
  }, [
    profile?.email,
    session?.user?.email,
  ])

  useEffect(() => {
    if (
      !companyId ||
      !canViewNotifications
    ) {
      alertRequestIdRef.current += 1
      setAlerts(0)
      setRecentAlerts([])
      setAlertsLoading(false)

      return undefined
    }

    void refreshAlerts({
      showLoading: true,
    })

    const channel = supabase
      .channel(
        `header-notifications-${companyId}`,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_logs',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          void refreshAlerts({
            showLoading: false,
          })

          if (
            payload.eventType === 'INSERT' &&
            payload.new?.message
          ) {
            toast.error(
              payload.new.message,
              {
                duration: 5000,
              },
            )
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(
            'Unable to subscribe to header notifications.',
          )
        }
      })

    return () => {
      alertRequestIdRef.current += 1

      void supabase.removeChannel(channel)
    }
  }, [
    canViewNotifications,
    companyId,
    refreshAlerts,
  ])

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(
          event.target,
        )
      ) {
        setDropdownOpen(false)
      }

      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(
          event.target,
        )
      ) {
        setMobileMenuOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setDropdownOpen(false)
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener(
      'mousedown',
      handleClickOutside,
    )

    document.addEventListener(
      'keydown',
      handleEscape,
    )

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside,
      )

      document.removeEventListener(
        'keydown',
        handleEscape,
      )
    }
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
    setDropdownOpen(false)
  }, [location.pathname])

  async function markAlertAsRead(id) {
    if (
      !companyId ||
      !canViewNotifications ||
      !id ||
      markingReadId
    ) {
      return
    }

    const readTime =
      new Date().toISOString()

    setMarkingReadId(id)

    try {
      const { error } = await supabase
        .from('notification_logs')
        .update({
          is_read: true,
          read_at: readTime,
        })
        .eq('id', id)
        .eq('company_id', companyId)
        .eq('is_read', false)

      if (error) {
        throw error
      }

      setRecentAlerts((current) =>
        current.filter(
          (item) => item.id !== id,
        ),
      )

      setAlerts((current) =>
        Math.max(current - 1, 0),
      )

      toast.success(
        'Notification marked as read.',
      )
    } catch (error) {
      console.error(
        'Unable to mark notification as read:',
        error,
      )

      toast.error(
        error?.message ||
          'Unable to mark notification as read.',
      )
    } finally {
      setMarkingReadId(null)
    }
  }

  async function markAllAlertsAsRead() {
    if (
      !companyId ||
      !canViewNotifications ||
      markingAllRead
    ) {
      return
    }

    if (alerts === 0) {
      toast.success('No unread alerts.')
      return
    }

    const readTime =
      new Date().toISOString()

    setMarkingAllRead(true)

    try {
      const { error } = await supabase
        .from('notification_logs')
        .update({
          is_read: true,
          read_at: readTime,
        })
        .eq('company_id', companyId)
        .eq('is_read', false)

      if (error) {
        throw error
      }

      setRecentAlerts([])
      setAlerts(0)

      toast.success(
        'All alerts marked as read.',
      )
    } catch (error) {
      console.error(
        'Unable to mark all alerts as read:',
        error,
      )

      toast.error(
        error?.message ||
          'Unable to mark all alerts as read.',
      )
    } finally {
      setMarkingAllRead(false)
    }
  }

  async function handleLogout() {
    if (signingOut) return

    setSigningOut(true)
    setDropdownOpen(false)
    setMobileMenuOpen(false)

    try {
      const { error } =
        await supabase.auth.signOut()

      if (error) {
        throw error
      }

      navigate('/', {
        replace: true,
      })
    } catch (error) {
      console.error(
        'Unable to sign out:',
        error,
      )

      toast.error(
        error?.message ||
          'Unable to sign out. Please try again.',
      )

      setSigningOut(false)
    }
  }

  function isActive(
    path,
    { exact = false } = {},
  ) {
    if (exact) {
      return location.pathname === path
    }

    return (
      location.pathname === path ||
      location.pathname.startsWith(
        `${path}/`,
      )
    )
  }

  function formatDate(dateValue) {
    if (!dateValue) return '-'

    const date = new Date(dateValue)

    if (Number.isNaN(date.getTime())) {
      return '-'
    }

    return date.toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  function formatExpiryDate(
    dateValue,
  ) {
    if (!dateValue) return '-'

    const rawValue =
      String(dateValue).trim()

    const date = rawValue.includes('T')
      ? new Date(rawValue)
      : new Date(`${rawValue}T00:00:00`)

    if (Number.isNaN(date.getTime())) {
      return rawValue
    }

    return date.toLocaleDateString(
      'en-GB',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      },
    )
  }

  function getStatusStyle(status) {
    const normalisedStatus =
      normaliseStatus(status)

    if (
      normalisedStatus === 'expired'
    ) {
      return styles.statusExpired
    }

    if (
      normalisedStatus ===
      'expiring_soon'
    ) {
      return styles.statusSoon
    }

    return styles.statusValid
  }

  function getUserInitial() {
    const source = String(
      profile?.full_name ||
        email ||
        'T',
    ).trim()

    return (
      source.charAt(0).toUpperCase() ||
      'T'
    )
  }

  function getDisplayName() {
    const profileName = String(
      profile?.full_name || '',
    ).trim()

    if (profileName) {
      return profileName
    }

    return (
      getEmailPrefix(email) ||
      'Trustera user'
    )
  }

  function toggleAlertDropdown() {
    if (!canViewNotifications) {
      return
    }

    setDropdownOpen(
      (current) => !current,
    )

    setMobileMenuOpen(false)

    if (!dropdownOpen) {
      void refreshAlerts({
        showLoading: false,
      })
    }
  }

  function toggleMobileMenu() {
    setMobileMenuOpen(
      (current) => !current,
    )

    setDropdownOpen(false)
  }

  return (
    <>
      <header style={styles.header}>
        <div
          ref={mobileMenuRef}
          style={styles.leftSection}
        >
          <Link
            to={defaultHomeRoute}
            style={styles.logoLink}
            aria-label="Go to Trustera home"
          >
            <span style={styles.logoMark}>
              T
            </span>

            <span style={styles.logoText}>
              Trustera
            </span>
          </Link>

          <button
            type="button"
            className="trustera-mobile-menu-button"
            style={styles.mobileButton}
            onClick={toggleMobileMenu}
            aria-label={
              mobileMenuOpen
                ? 'Close navigation menu'
                : 'Open navigation menu'
            }
            aria-expanded={
              mobileMenuOpen
            }
            aria-controls="trustera-main-navigation"
          >
            {mobileMenuOpen
              ? '✕'
              : '☰'}
          </button>

          <nav
            id="trustera-main-navigation"
            className={`trustera-main-navigation ${
              mobileMenuOpen
                ? 'trustera-main-navigation-open'
                : ''
            }`}
            style={styles.nav}
            aria-label="Trustera navigation"
          >
            {hasCompany && (
              <HeaderNavLink
                to="/dashboard"
                label="Dashboard"
                active={isActive(
                  '/dashboard',
                  {
                    exact: true,
                  },
                )}
              />
            )}

            {canViewWorkers && (
              <HeaderNavLink
                to="/workers"
                label="Workers"
                active={isActive(
                  '/workers',
                )}
              />
            )}

            {canAddWorkers && (
              <HeaderNavLink
                to="/add-worker"
                label="Add Worker"
                active={isActive(
                  '/add-worker',
                  {
                    exact: true,
                  },
                )}
              />
            )}

            {canViewDocuments && (
              <HeaderNavLink
                to="/documents"
                label="Documents"
                active={isActive(
                  '/documents',
                )}
              />
            )}

            {canViewNotifications && (
              <HeaderNavLink
                to="/notifications"
                label="Notifications"
                active={isActive(
                  '/notifications',
                )}
                badge={alerts}
              />
            )}

            {canViewAuditLogs && (
              <HeaderNavLink
                to="/audit-logs"
                label="Audit Logs"
                active={isActive(
                  '/audit-logs',
                )}
              />
            )}

            {canManageTeam && (
              <HeaderNavLink
                to="/team"
                label="Team"
                active={isActive(
                  '/team',
                )}
              />
            )}

            {canManagePlatform && (
              <HeaderNavLink
                to="/platform-admin"
                label="Platform"
                active={isActive(
                  '/platform-admin',
                )}
              />
            )}
          </nav>
        </div>

        <div style={styles.rightSection}>
          {canViewNotifications && (
            <div
              style={styles.alertWrapper}
              ref={dropdownRef}
            >
              <button
                type="button"
                onClick={
                  toggleAlertDropdown
                }
                style={{
                  ...styles.alertButton,
                  ...(alerts > 0
                    ? styles.alertActive
                    : styles.alertInactive),
                }}
                aria-label={`${alerts} unread compliance alert${
                  alerts === 1 ? '' : 's'
                }`}
                aria-expanded={
                  dropdownOpen
                }
                aria-haspopup="dialog"
              >
                <span aria-hidden="true">
                  🔔
                </span>

                <span>
                  {alertsLoading
                    ? 'Loading...'
                    : `Alerts: ${alerts}`}
                </span>
              </button>

              {dropdownOpen && (
                <div
                  style={
                    styles.alertDropdown
                  }
                  role="dialog"
                  aria-label="Unread compliance alerts"
                >
                  <div
                    style={
                      styles.dropdownHeader
                    }
                  >
                    <div>
                      <strong
                        style={
                          styles.dropdownTitle
                        }
                      >
                        Unread Alerts
                      </strong>

                      <p
                        style={
                          styles.dropdownSubText
                        }
                      >
                        {alerts} unread
                        notification
                        {alerts === 1
                          ? ''
                          : 's'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={
                        markAllAlertsAsRead
                      }
                      disabled={
                        alerts === 0 ||
                        markingAllRead
                      }
                      style={{
                        ...styles.smallButton,
                        ...(alerts === 0 ||
                        markingAllRead
                          ? styles.disabledButton
                          : {}),
                      }}
                    >
                      {markingAllRead
                        ? 'Marking...'
                        : 'Mark all read'}
                    </button>
                  </div>

                  {alertsLoading ? (
                    <p
                      style={
                        styles.emptyDropdown
                      }
                    >
                      Loading alerts...
                    </p>
                  ) : recentAlerts.length ===
                    0 ? (
                    <p
                      style={
                        styles.emptyDropdown
                      }
                    >
                      No unread alerts.
                    </p>
                  ) : (
                    <div
                      style={styles.alertList}
                    >
                      {recentAlerts.map(
                        (item) => {
                          const isMarking =
                            markingReadId ===
                            item.id

                          return (
                            <article
                              key={item.id}
                              style={
                                styles.alertItem
                              }
                            >
                              <div
                                style={
                                  styles.alertItemTop
                                }
                              >
                                <strong
                                  style={
                                    styles.alertMessage
                                  }
                                >
                                  {item.message ||
                                    'Compliance notification'}
                                </strong>

                                <span
                                  style={{
                                    ...styles.statusBadge,
                                    ...getStatusStyle(
                                      item.status,
                                    ),
                                  }}
                                >
                                  {item.status ||
                                    'Notification'}
                                </span>
                              </div>

                              <p
                                style={
                                  styles.alertMeta
                                }
                              >
                                <strong>
                                  Document:
                                </strong>{' '}
                                {item.document_type ||
                                  '-'}
                              </p>

                              <p
                                style={
                                  styles.alertMeta
                                }
                              >
                                <strong>
                                  Expiry:
                                </strong>{' '}
                                {formatExpiryDate(
                                  item.expiry_date,
                                )}
                              </p>

                              <p
                                style={
                                  styles.alertMeta
                                }
                              >
                                <strong>
                                  Logged:
                                </strong>{' '}
                                {formatDate(
                                  item.sent_at,
                                )}
                              </p>

                              <button
                                type="button"
                                onClick={() =>
                                  markAlertAsRead(
                                    item.id,
                                  )
                                }
                                disabled={
                                  Boolean(
                                    markingReadId,
                                  )
                                }
                                style={{
                                  ...styles.markReadButton,
                                  ...(isMarking
                                    ? styles.disabledButton
                                    : {}),
                                }}
                              >
                                {isMarking
                                  ? 'Marking...'
                                  : 'Mark read'}
                              </button>
                            </article>
                          )
                        },
                      )}
                    </div>
                  )}

                  {alerts >
                    RECENT_ALERT_LIMIT && (
                    <p
                      style={
                        styles.moreAlertsText
                      }
                    >
                      Showing the five most
                      recent unread alerts.
                    </p>
                  )}

                  <Link
                    to="/notifications"
                    onClick={() =>
                      setDropdownOpen(
                        false,
                      )
                    }
                    style={
                      styles.viewAllLink
                    }
                  >
                    View Notification Center
                  </Link>
                </div>
              )}
            </div>
          )}

          <div
            className="trustera-header-user-box"
            style={styles.userBox}
          >
            <div
              style={styles.avatar}
              aria-hidden="true"
            >
              {getUserInitial()}
            </div>

            <div
              style={styles.userDetails}
            >
              <span
                style={styles.userName}
              >
                {getDisplayName()}
              </span>

              {email && (
                <span
                  style={styles.email}
                >
                  {email}
                </span>
              )}

              <span
                style={styles.role}
              >
                {getRoleLabel(
                  hasPlatformAccess
                    ? 'platform_admin'
                    : profile?.role,
                )}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            style={{
              ...styles.logoutButton,
              ...(signingOut
                ? styles.logoutButtonDisabled
                : {}),
            }}
          >
            {signingOut
              ? 'Signing out...'
              : 'Logout'}
          </button>
        </div>
      </header>

      <style>
        {`
          .trustera-mobile-menu-button {
            display: none !important;
          }

          .trustera-main-navigation {
            display: flex;
          }

          @media (max-width: 1180px) {
            .trustera-mobile-menu-button {
              display: inline-flex !important;
              align-items: center;
              justify-content: center;
            }

            .trustera-main-navigation {
              display: none !important;
              position: absolute;
              top: calc(100% + 13px);
              left: 0;
              min-width: min(340px, calc(100vw - 32px));
              flex-direction: column;
              align-items: stretch !important;
              gap: 6px !important;
              padding: 14px;
              border: 1px solid #1e293b;
              border-radius: 0 0 12px 12px;
              background: #020817;
              box-shadow: 0 18px 35px rgba(0, 0, 0, 0.35);
              z-index: 2100;
            }

            .trustera-main-navigation-open {
              display: flex !important;
            }

            .trustera-main-navigation a {
              width: 100%;
              box-sizing: border-box;
              justify-content: flex-start !important;
            }
          }

          @media (max-width: 760px) {
            .trustera-header-user-box {
              display: none !important;
            }
          }

          @media (max-width: 520px) {
            .trustera-main-navigation {
              position: fixed;
              top: 72px;
              left: 0;
              right: 0;
              width: auto;
              min-width: 0;
              border-left: 0;
              border-right: 0;
              border-radius: 0;
            }
          }
        `}
      </style>
    </>
  )
}

function HeaderNavLink({
  to,
  label,
  active,
  badge = 0,
}) {
  return (
    <Link
      to={to}
      aria-current={
        active ? 'page' : undefined
      }
      style={{
        ...styles.link,
        ...(active
          ? styles.activeLink
          : {}),
      }}
    >
      <span>{label}</span>

      {badge > 0 && (
        <span style={styles.navBadge}>
          {badge > 99
            ? '99+'
            : badge}
        </span>
      )}
    </Link>
  )
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: '72px',
    padding: '12px 20px',
    borderBottom: '1px solid #1e293b',
    background: '#020817',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    gap: '18px',
    boxSizing: 'border-box',
  },

  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    minWidth: 0,
    position: 'relative',
  },

  logoLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    color: '#ffffff',
    textDecoration: 'none',
    flexShrink: 0,
  },

  logoMark: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background:
      'linear-gradient(135deg, #2563eb, #06b6d4)',
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: 800,
    boxShadow:
      '0 8px 24px rgba(37, 99, 235, 0.25)',
  },

  logoText: {
    fontSize: '22px',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },

  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },

  link: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    minHeight: '42px',
    padding: '9px 12px',
    borderRadius: '9px',
    color: '#cbd5e1',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600,
    transition:
      'background 0.2s ease, color 0.2s ease',
    whiteSpace: 'nowrap',
  },

  activeLink: {
    background: '#1e293b',
    color: '#ffffff',
  },

  navBadge: {
    minWidth: '20px',
    height: '20px',
    padding: '0 5px',
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#dc2626',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 800,
    boxSizing: 'border-box',
  },

  rightSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
    minWidth: 0,
  },

  alertWrapper: {
    position: 'relative',
    flexShrink: 0,
  },

  alertButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minHeight: '44px',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 700,
    transition:
      'background 0.2s ease, border-color 0.2s ease',
    whiteSpace: 'nowrap',
  },

  alertActive: {
    background: '#991b1b',
    borderColor: '#b91c1c',
    color: '#ffffff',
  },

  alertInactive: {
    background: '#052e2b',
    borderColor: '#065f46',
    color: '#a7f3d0',
  },

  alertDropdown: {
    position: 'absolute',
    top: '54px',
    right: 0,
    width:
      'min(400px, calc(100vw - 32px))',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '14px',
    boxShadow:
      '0 20px 50px rgba(0, 0, 0, 0.5)',
    padding: '16px',
    zIndex: 2000,
    boxSizing: 'border-box',
  },

  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start',
    borderBottom: '1px solid #334155',
    paddingBottom: '12px',
    marginBottom: '12px',
  },

  dropdownTitle: {
    color: '#ffffff',
    fontSize: '15px',
  },

  dropdownSubText: {
    color: '#94a3b8',
    margin: '4px 0 0',
    fontSize: '13px',
  },

  smallButton: {
    minHeight: '34px',
    border: 'none',
    borderRadius: '8px',
    padding: '7px 10px',
    background: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.65,
  },

  emptyDropdown: {
    color: '#94a3b8',
    margin: '18px 0',
    textAlign: 'center',
    fontSize: '14px',
  },

  alertList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '360px',
    overflowY: 'auto',
    paddingRight: '3px',
  },

  alertItem: {
    background: '#020617',
    border: '1px solid #1e293b',
    borderRadius: '10px',
    padding: '12px',
    color: '#ffffff',
  },

  alertItemTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
  },

  alertMessage: {
    fontSize: '13px',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },

  statusBadge: {
    padding: '5px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    textTransform: 'capitalize',
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
    margin: '7px 0 0',
    fontSize: '12px',
    lineHeight: 1.45,
  },

  markReadButton: {
    minHeight: '34px',
    marginTop: '10px',
    border: 'none',
    borderRadius: '8px',
    padding: '7px 10px',
    background: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },

  moreAlertsText: {
    margin: '12px 0 0',
    color: '#64748b',
    textAlign: 'center',
    fontSize: '11px',
  },

  viewAllLink: {
    display: 'block',
    marginTop: '14px',
    paddingTop: '12px',
    borderTop: '1px solid #334155',
    color: '#93c5fd',
    textAlign: 'center',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: 700,
  },

  userBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    maxWidth: '280px',
    padding: '8px 12px',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    background: '#0f172a',
    minWidth: 0,
  },

  avatar: {
    width: '38px',
    height: '38px',
    flexShrink: 0,
    borderRadius: '50%',
    background: '#2563eb',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 800,
  },

  userDetails: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },

  userName: {
    color: '#e2e8f0',
    fontSize: '13px',
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  email: {
    color: '#93c5fd',
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  role: {
    color: '#94a3b8',
    fontSize: '11px',
  },

  logoutButton: {
    minHeight: '44px',
    padding: '10px 14px',
    border: 'none',
    borderRadius: '10px',
    background: '#ef4444',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },

  logoutButtonDisabled: {
    background: '#7f1d1d',
    cursor: 'not-allowed',
    opacity: 0.7,
  },

  mobileButton: {
    minWidth: '42px',
    minHeight: '42px',
    border: '1px solid #334155',
    borderRadius: '9px',
    background: '#1e293b',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '18px',
  },
}