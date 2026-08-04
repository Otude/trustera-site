// src/App.jsx

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Toaster } from 'react-hot-toast'

import { supabase } from './supabase'
import { can } from './utils/permissions'

import Header from './components/Header'

import Landing from './Pages/Landing'
import Login from './Pages/Login'
import Dashboard from './Pages/Dashboard'
import Workers from './Pages/Workers'
import AddWorker from './Pages/AddWorker'
import Documents from './Pages/Documents'
import Notifications from './Pages/Notifications'
import WorkerProfile from './Pages/WorkerProfile'
import AuditLogs from './Pages/AuditLogs'
import TeamManagement from './Pages/TeamManagement'
import PlatformAdmin from './Pages/PlatformAdmin'

const PROFILE_FIELDS = `
  id,
  company_id,
  email,
  full_name,
  role,
  created_at
`

const TRUSTERA_ROLES = [
  'platform_admin',
  'admin',
  'manager',
  'compliance_officer',
  'staff',
  'viewer',
  'worker',
]

function normaliseRole(role) {
  const value = String(role || '')
    .trim()
    .toLowerCase()

  return TRUSTERA_ROLES.includes(value)
    ? value
    : 'staff'
}

function getEmailPrefix(email) {
  const value = String(email || '').trim()

  if (!value) return ''

  return value.includes('@')
    ? value.split('@')[0]
    : value
}

function resolveProfileName(profileData, user) {
  return (
    String(profileData?.full_name || '').trim() ||
    String(user?.user_metadata?.full_name || '').trim() ||
    String(user?.user_metadata?.name || '').trim() ||
    getEmailPrefix(user?.email || profileData?.email)
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)

  const [
    isPlatformAdmin,
    setIsPlatformAdmin,
  ] = useState(false)

  const [loading, setLoading] = useState(true)

  const [
    profileError,
    setProfileError,
  ] = useState('')

  /*
   * Remains available across renders and records
   * whether App is still mounted.
   *
   * This prevents delayed authentication/database
   * requests from trying to update state after the
   * component has unmounted.
   */
  const mountedRef = useRef(false)

  /*
   * Every access-context request receives a unique
   * sequence number.
   *
   * Only the most recent request is allowed to update
   * profile state. This prevents an older Supabase auth
   * event from overwriting a newer session.
   */
  const accessRequestIdRef = useRef(0)

  /*
   * Stores the timeout created inside
   * onAuthStateChange so that it can be cancelled
   * during cleanup or before scheduling another one.
   */
  const authTimeoutRef = useRef(null)

  /*
   * Stores the latest authenticated user ID.
   *
   * This provides an additional safeguard against
   * applying profile information belonging to a user
   * who is no longer the active session.
   */
  const activeUserIdRef = useRef(null)

  const clearScheduledAuthTimeout = useCallback(() => {
    if (authTimeoutRef.current !== null) {
      window.clearTimeout(authTimeoutRef.current)
      authTimeoutRef.current = null
    }
  }, [])

  const clearAccessState = useCallback(() => {
    /*
     * Invalidate any currently running access request.
     */
    accessRequestIdRef.current += 1
    activeUserIdRef.current = null

    if (!mountedRef.current) return

    setProfile(null)
    setIsPlatformAdmin(false)
    setProfileError('')
  }, [])

  const markInvitationAsAccepted = useCallback(
    async (userId) => {
      if (!userId) return

      const acceptedAt = new Date().toISOString()

      const { error } = await supabase
        .from('company_invitations')
        .update({
          status: 'accepted',
          auth_user_id: userId,
          accepted_at: acceptedAt,
          updated_at: acceptedAt,
        })
        .eq('auth_user_id', userId)
        .eq('status', 'pending')

      if (error) {
        /*
         * Invitation acceptance must not block
         * an otherwise valid user from signing in.
         */
        console.error(
          'Unable to mark invitation as accepted:',
          error,
        )
      }
    },
    [],
  )

  const fetchAccessContext = useCallback(
    async (user) => {
      if (!user?.id) {
        if (mountedRef.current) {
          setProfile(null)
          setIsPlatformAdmin(false)

          setProfileError(
            'The authenticated Trustera user could not be identified.',
          )
        }

        return null
      }

      /*
       * Start a new request and remember the user for
       * whom the request was created.
       */
      const requestId =
        accessRequestIdRef.current + 1

      accessRequestIdRef.current = requestId
      activeUserIdRef.current = user.id

      function requestIsCurrent() {
        return (
          mountedRef.current &&
          accessRequestIdRef.current === requestId &&
          activeUserIdRef.current === user.id
        )
      }

      try {
        if (requestIsCurrent()) {
          setProfileError('')
        }

        const [
          profileResponse,
          platformAdminResponse,
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select(PROFILE_FIELDS)
            .eq('id', user.id)
            .maybeSingle(),

          supabase
            .from('platform_admins')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle(),
        ])

        /*
         * Another authentication request may have
         * started while the database queries were
         * running.
         */
        if (!requestIsCurrent()) {
          return null
        }

        if (profileResponse.error) {
          throw profileResponse.error
        }

        if (platformAdminResponse.error) {
          throw platformAdminResponse.error
        }

        const platformAdmin = Boolean(
          platformAdminResponse.data?.user_id,
        )

        const profileData =
          profileResponse.data || null

        /*
         * A user must have either:
         *
         * 1. A company profile, or
         * 2. A record in platform_admins.
         */
        if (!profileData && !platformAdmin) {
          throw new Error(
            'Your Trustera user profile could not be found. Contact your organisation administrator.',
          )
        }

        /*
         * Normal company users use their profile
         * record.
         *
         * A platform administrator can still sign
         * in even if no company profile exists.
         */
        const normalisedProfile = profileData
          ? {
              ...profileData,

              email:
                profileData.email ||
                user.email ||
                '',

              full_name: resolveProfileName(
                profileData,
                user,
              ),

              role: normaliseRole(
                profileData.role,
              ),

              is_platform_admin:
                platformAdmin,
            }
          : {
              id: user.id,
              company_id: null,
              email: user.email || '',

              full_name: resolveProfileName(
                null,
                user,
              ),

              role: 'platform_admin',

              created_at:
                user.created_at || null,

              is_platform_admin: true,
            }

        /*
         * Ordinary company users must belong to
         * a company.
         *
         * Platform administrators are allowed to
         * exist without a company assignment.
         */
        if (
          !normalisedProfile.company_id &&
          !platformAdmin
        ) {
          throw new Error(
            'Your Trustera user profile is not assigned to a company.',
          )
        }

        /*
         * Once authentication and access validation
         * succeed, mark any matching pending
         * invitation as accepted.
         *
         * This operation is intentionally
         * non-blocking for authentication.
         */
        try {
          await markInvitationAsAccepted(
            user.id,
          )
        } catch (invitationError) {
          console.error(
            'Invitation lifecycle update failed:',
            invitationError,
          )
        }

        /*
         * Recheck after the invitation operation
         * because the active session may have changed
         * while it was running.
         */
        if (!requestIsCurrent()) {
          return null
        }

        setProfile(normalisedProfile)

        setIsPlatformAdmin(
          platformAdmin,
        )

        setProfileError('')

        return {
          profile: normalisedProfile,
          isPlatformAdmin: platformAdmin,
        }
      } catch (error) {
        console.error(
          'Unable to load Trustera access context:',
          error,
        )

        /*
         * Do not show an error from an obsolete
         * authentication request.
         */
        if (!requestIsCurrent()) {
          return null
        }

        setProfile(null)
        setIsPlatformAdmin(false)

        setProfileError(
          error?.message ||
            'Unable to load your Trustera user profile.',
        )

        return null
      }
    },
    [markInvitationAsAccepted],
  )

  useEffect(() => {
    mountedRef.current = true

    async function initialiseAuth() {
      try {
        const {
          data: {
            session: currentSession,
          },
          error,
        } =
          await supabase.auth.getSession()

        if (error) {
          throw error
        }

        if (!mountedRef.current) {
          return
        }

        setSession(currentSession)

        if (currentSession?.user) {
          activeUserIdRef.current =
            currentSession.user.id

          await fetchAccessContext(
            currentSession.user,
          )
        } else {
          clearAccessState()
        }
      } catch (error) {
        console.error(
          'Unable to initialise authentication:',
          error,
        )

        if (!mountedRef.current) {
          return
        }

        accessRequestIdRef.current += 1
        activeUserIdRef.current = null

        setSession(null)
        setProfile(null)
        setIsPlatformAdmin(false)

        setProfileError(
          error?.message ||
            'Unable to initialise your Trustera session.',
        )
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }

    initialiseAuth()

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, updatedSession) => {
          if (!mountedRef.current) {
            return
          }

          /*
           * Cancel an earlier deferred callback before
           * scheduling a new one.
           */
          clearScheduledAuthTimeout()

          /*
           * Invalidate any access request created by
           * an earlier authentication event.
           */
          accessRequestIdRef.current += 1

          setSession(updatedSession)

          if (updatedSession?.user) {
            activeUserIdRef.current =
              updatedSession.user.id

            setLoading(true)
            setProfileError('')

            /*
             * Defer database queries until Supabase
             * completes its internal authentication
             * state processing.
             */
            authTimeoutRef.current =
              window.setTimeout(
                async () => {
                  authTimeoutRef.current = null

                  if (!mountedRef.current) {
                    return
                  }

                  const expectedUserId =
                    updatedSession.user.id

                  /*
                   * Do not load the profile if another
                   * auth event has already replaced this
                   * user.
                   */
                  if (
                    activeUserIdRef.current !==
                    expectedUserId
                  ) {
                    return
                  }

                  await fetchAccessContext(
                    updatedSession.user,
                  )

                  if (
                    mountedRef.current &&
                    activeUserIdRef.current ===
                      expectedUserId
                  ) {
                    setLoading(false)
                  }
                },
                0,
              )
          } else {
            activeUserIdRef.current = null
            clearAccessState()
            setLoading(false)
          }
        },
      )

    return () => {
      mountedRef.current = false

      /*
       * Invalidate all unresolved profile requests.
       */
      accessRequestIdRef.current += 1
      activeUserIdRef.current = null

      clearScheduledAuthTimeout()
      subscription.unsubscribe()
    }
  }, [
    clearAccessState,
    clearScheduledAuthTimeout,
    fetchAccessContext,
  ])

  if (loading) {
    return (
      <LoadingScreen message="Loading Trustera..." />
    )
  }

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,

          style: {
            background: '#0f172a',
            color: '#ffffff',
            border: '1px solid #334155',
          },

          success: {
            iconTheme: {
              primary: '#22c55e',
              secondary: '#ffffff',
            },
          },

          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
        }}
      />

      {!session ? (
        <PublicApp />
      ) : !profile ? (
        <ProfileErrorScreen
          message={
            profileError ||
            'Your Trustera profile could not be loaded.'
          }
        />
      ) : (
        <AuthenticatedApp
          profile={profile}
          session={session}
          isPlatformAdmin={
            isPlatformAdmin
          }
        />
      )}
    </BrowserRouter>
  )
}

function PublicApp() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Landing />}
      />

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  )
}

function AuthenticatedApp({
  profile,
  session,
  isPlatformAdmin,
}) {
  const hasCompany = Boolean(
    profile?.company_id,
  )

  const canManageTeam =
    hasCompany &&
    can(profile, 'manageTeam')

  const canViewAuditLogs =
    hasCompany &&
    can(profile, 'viewAuditLogs')

  const canAddWorkers =
    hasCompany &&
    can(profile, 'manageWorkers')

  const canViewNotifications =
    hasCompany &&
    can(profile, 'viewNotifications')

  /*
   * A platform administrator without a company
   * opens the platform administration page.
   *
   * A platform administrator who also belongs to
   * a company opens the company dashboard by
   * default but may still visit /platform-admin.
   */
  const defaultAuthenticatedRoute =
    isPlatformAdmin && !hasCompany
      ? '/platform-admin'
      : '/dashboard'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#ffffff',
      }}
    >
      <Header
        profile={profile}
        session={session}
        isPlatformAdmin={
          isPlatformAdmin
        }
      />

      <Routes>
        <Route
          path="/"
          element={
            <Navigate
              to={
                defaultAuthenticatedRoute
              }
              replace
            />
          }
        />

        <Route
          path="/login"
          element={
            <Navigate
              to={
                defaultAuthenticatedRoute
              }
              replace
            />
          }
        />

        <Route
          path="/platform-admin"
          element={
            isPlatformAdmin ? (
              <PlatformAdmin
                profile={{
                  ...profile,
                  role: 'platform_admin',
                }}
                isPlatformAdmin
              />
            ) : (
              <Navigate
                to={
                  hasCompany
                    ? '/dashboard'
                    : '/'
                }
                replace
              />
            )
          }
        />

        <Route
          path="/dashboard"
          element={
            hasCompany ? (
              <Dashboard
                profile={profile}
              />
            ) : isPlatformAdmin ? (
              <Navigate
                to="/platform-admin"
                replace
              />
            ) : (
              <Navigate
                to="/"
                replace
              />
            )
          }
        />

        <Route
          path="/workers"
          element={
            hasCompany ? (
              <Workers
                profile={profile}
              />
            ) : isPlatformAdmin ? (
              <Navigate
                to="/platform-admin"
                replace
              />
            ) : (
              <Navigate
                to="/"
                replace
              />
            )
          }
        />

        <Route
          path="/workers/:id"
          element={
            hasCompany ? (
              <WorkerProfile
                profile={profile}
              />
            ) : isPlatformAdmin ? (
              <Navigate
                to="/platform-admin"
                replace
              />
            ) : (
              <Navigate
                to="/"
                replace
              />
            )
          }
        />

        <Route
          path="/add-worker"
          element={
            canAddWorkers ? (
              <AddWorker
                profile={profile}
              />
            ) : (
              <Navigate
                to={
                  hasCompany
                    ? '/workers'
                    : isPlatformAdmin
                      ? '/platform-admin'
                      : '/'
                }
                replace
              />
            )
          }
        />

        <Route
          path="/documents"
          element={
            hasCompany ? (
              <Documents
                profile={profile}
              />
            ) : isPlatformAdmin ? (
              <Navigate
                to="/platform-admin"
                replace
              />
            ) : (
              <Navigate
                to="/"
                replace
              />
            )
          }
        />

        <Route
          path="/notifications"
          element={
            canViewNotifications ? (
              <Notifications
                profile={profile}
              />
            ) : (
              <Navigate
                to={
                  hasCompany
                    ? '/dashboard'
                    : isPlatformAdmin
                      ? '/platform-admin'
                      : '/'
                }
                replace
              />
            )
          }
        />

        <Route
          path="/audit-logs"
          element={
            canViewAuditLogs ? (
              <AuditLogs
                profile={profile}
                session={session}
              />
            ) : (
              <Navigate
                to={
                  hasCompany
                    ? '/dashboard'
                    : isPlatformAdmin
                      ? '/platform-admin'
                      : '/'
                }
                replace
              />
            )
          }
        />

        <Route
          path="/team"
          element={
            canManageTeam ? (
              <TeamManagement
                profile={profile}
                session={session}
              />
            ) : (
              <Navigate
                to={
                  hasCompany
                    ? '/dashboard'
                    : isPlatformAdmin
                      ? '/platform-admin'
                      : '/'
                }
                replace
              />
            )
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to={
                defaultAuthenticatedRoute
              }
              replace
            />
          }
        />
      </Routes>
    </div>
  )
}

function LoadingScreen({ message }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '24px',
        background: '#020617',
        color: '#ffffff',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '42px',
          height: '42px',
          border: '4px solid #334155',
          borderTopColor: '#2563eb',
          borderRadius: '50%',
          animation:
            'trustera-spin 0.8s linear infinite',
        }}
      />

      <div
        role="status"
        aria-live="polite"
        style={{
          fontSize: '18px',
          color: '#cbd5e1',
        }}
      >
        {message}
      </div>

      <style>
        {`
          @keyframes trustera-spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  )
}

function ProfileErrorScreen({
  message,
}) {
  const [
    signingOut,
    setSigningOut,
  ] = useState(false)

  const [
    signOutError,
    setSignOutError,
  ] = useState('')

  async function handleSignOut() {
    if (signingOut) return

    setSigningOut(true)
    setSignOutError('')

    try {
      const { error } =
        await supabase.auth.signOut()

      if (error) {
        throw error
      }

      window.location.replace('/')
    } catch (error) {
      console.error(
        'Unable to sign out:',
        error,
      )

      setSignOutError(
        error?.message ||
          'Unable to sign out. Please refresh the page and try again.',
      )

      setSigningOut(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#020617',
        color: '#ffffff',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '28px',
          border:
            '1px solid #334155',
          borderRadius: '16px',
          background: '#0f172a',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '52px',
            height: '52px',
            margin:
              '0 auto 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            borderRadius: '50%',
            background:
              'rgba(239, 68, 68, 0.12)',
            border:
              '1px solid rgba(239, 68, 68, 0.35)',
            color: '#fca5a5',
            fontSize: '24px',
            fontWeight: 700,
          }}
        >
          !
        </div>

        <h1
          style={{
            marginTop: 0,
            marginBottom: '12px',
            fontSize: '24px',
          }}
        >
          Profile unavailable
        </h1>

        <p
          style={{
            marginBottom: '24px',
            color: '#cbd5e1',
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>

        {signOutError && (
          <div
            role="alert"
            style={{
              marginBottom: '18px',
              padding: '12px',
              borderRadius: '10px',
              border:
                '1px solid rgba(239, 68, 68, 0.35)',
              background:
                'rgba(239, 68, 68, 0.10)',
              color: '#fecaca',
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          >
            {signOutError}
          </div>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            minHeight: '44px',
            padding: '12px 20px',
            border: 0,
            borderRadius: '10px',

            background: signingOut
              ? '#475569'
              : '#2563eb',

            color: '#ffffff',
            fontWeight: 700,

            cursor: signingOut
              ? 'not-allowed'
              : 'pointer',
          }}
        >
          {signingOut
            ? 'Signing out...'
            : 'Sign out'}
        </button>
      </div>
    </div>
  )
}