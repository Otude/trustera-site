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

async function readFunctionError(error, fallbackMessage) {
  let message =
    error?.message ||
    fallbackMessage

  const context = error?.context

  if (!context) {
    return message
  }

  try {
    const body = await context.clone().json()

    if (body?.error) {
      message = body.error
    } else if (body?.message) {
      message = body.message
    }
  } catch {
    try {
      const text = await context.clone().text()

      if (text) {
        message = text
      }
    } catch {
      // Keep the original function error.
    }
  }

  return message
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
   * Tracks whether App is still mounted so delayed
   * asynchronous operations cannot update state after
   * unmounting.
   */
  const mountedRef = useRef(false)

  /*
   * Each access-context request receives a sequence ID.
   * Only the newest request may update React state.
   */
  const accessRequestIdRef = useRef(0)

  /*
   * Stores the deferred authentication callback created
   * by onAuthStateChange.
   */
  const authTimeoutRef = useRef(null)

  /*
   * Stores the ID of the user belonging to the current
   * authenticated session.
   */
  const activeUserIdRef = useRef(null)

  /*
   * Prevents the invitation acceptance function from
   * being called repeatedly for token refresh events
   * during the same browser session.
   */
  const invitationAttemptedForUserRef = useRef(null)

  const clearScheduledAuthTimeout = useCallback(() => {
    if (authTimeoutRef.current !== null) {
      window.clearTimeout(authTimeoutRef.current)
      authTimeoutRef.current = null
    }
  }, [])

  const clearAccessState = useCallback(() => {
    accessRequestIdRef.current += 1
    activeUserIdRef.current = null
    invitationAttemptedForUserRef.current = null

    if (!mountedRef.current) return

    setProfile(null)
    setIsPlatformAdmin(false)
    setProfileError('')
  }, [])

  /*
   * Invitation acceptance must be completed by the
   * authenticated Edge Function.
   *
   * App.jsx must not directly update company_invitations
   * because the acceptance process also needs to verify
   * the invitation and create or synchronise the profile.
   */
  const acceptPendingInvitation = useCallback(
    async (user) => {
      if (!user?.id) {
        return {
          attempted: false,
          accepted: false,
        }
      }

      if (
        invitationAttemptedForUserRef.current ===
        user.id
      ) {
        return {
          attempted: false,
          accepted: false,
        }
      }

      invitationAttemptedForUserRef.current = user.id

      const invitationId = String(
        user.user_metadata?.invitation_id || '',
      ).trim()

      const companyId = String(
        user.user_metadata?.company_id || '',
      ).trim()

      /*
       * A normal existing user does not need the
       * invitation function.
       */
      if (!invitationId && !companyId) {
        return {
          attempted: false,
          accepted: false,
        }
      }

      try {
        const { data, error } =
          await supabase.functions.invoke(
            'accept-company-invitation',
            {
              body: invitationId
                ? {
                    invitationId,
                  }
                : {},
            },
          )

        if (error) {
          throw new Error(
            await readFunctionError(
              error,
              'The company invitation could not be accepted.',
            ),
          )
        }

        if (data?.error) {
          throw new Error(data.error)
        }

        return {
          attempted: true,
          accepted: Boolean(
            data?.accepted ??
              data?.success,
          ),
          data,
        }
      } catch (error) {
        /*
         * Allow access-context loading to continue.
         *
         * Existing users may have invitation metadata
         * left in auth even though their invitation was
         * already accepted.
         */
        console.error(
          'Invitation acceptance failed:',
          error,
        )

        return {
          attempted: true,
          accepted: false,
          error,
        }
      }
    },
    [],
  )

  const fetchProfileRecord = useCallback(
    async (userId) => {
      return supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .eq('id', userId)
        .maybeSingle()
    },
    [],
  )

  const fetchPlatformAdminRecord = useCallback(
    async (userId) => {
      return supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
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

        /*
         * Check platform access first. A platform
         * administrator may legitimately have no company
         * profile.
         */
        const platformAdminResponse =
          await fetchPlatformAdminRecord(user.id)

        if (!requestIsCurrent()) {
          return null
        }

        if (platformAdminResponse.error) {
          throw platformAdminResponse.error
        }

        const platformAdmin = Boolean(
          platformAdminResponse.data?.user_id,
        )

        /*
         * Read the profile before running invitation
         * acceptance. Existing users should not make an
         * unnecessary Edge Function request.
         */
        let profileResponse =
          await fetchProfileRecord(user.id)

        if (!requestIsCurrent()) {
          return null
        }

        if (profileResponse.error) {
          throw profileResponse.error
        }

        let profileData =
          profileResponse.data || null

        /*
         * An invited user may not have a profile until
         * accept-company-invitation verifies the pending
         * invitation and creates it.
         */
        if (!profileData && !platformAdmin) {
          const acceptanceResult =
            await acceptPendingInvitation(user)

          if (!requestIsCurrent()) {
            return null
          }

          /*
           * Whether the function reported a new acceptance
           * or an idempotent already-accepted result, query
           * the profile again.
           */
          if (acceptanceResult.attempted) {
            profileResponse =
              await fetchProfileRecord(user.id)

            if (!requestIsCurrent()) {
              return null
            }

            if (profileResponse.error) {
              throw profileResponse.error
            }

            profileData =
              profileResponse.data || null
          }
        }

        if (!profileData && !platformAdmin) {
          throw new Error(
            'Your Trustera user profile could not be found. The invitation may be invalid, expired or not yet completed. Contact your organisation administrator.',
          )
        }

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

        if (
          !normalisedProfile.company_id &&
          !platformAdmin
        ) {
          throw new Error(
            'Your Trustera user profile is not assigned to a company.',
          )
        }

        if (!requestIsCurrent()) {
          return null
        }

        setProfile(normalisedProfile)
        setIsPlatformAdmin(platformAdmin)
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
    [
      acceptPendingInvitation,
      fetchPlatformAdminRecord,
      fetchProfileRecord,
    ],
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
        invitationAttemptedForUserRef.current = null

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
        (event, updatedSession) => {
          if (!mountedRef.current) {
            return
          }

          clearScheduledAuthTimeout()

          /*
           * A signed-out event invalidates every unresolved
           * access request immediately.
           */
          if (
            event === 'SIGNED_OUT' ||
            !updatedSession?.user
          ) {
            setSession(null)
            clearAccessState()
            setLoading(false)
            return
          }

          const previousUserId =
            activeUserIdRef.current

          const nextUserId =
            updatedSession.user.id

          /*
           * Reset invitation processing when a different
           * user signs in.
           */
          if (
            previousUserId &&
            previousUserId !== nextUserId
          ) {
            invitationAttemptedForUserRef.current =
              null
          }

          accessRequestIdRef.current += 1
          activeUserIdRef.current = nextUserId

          setSession(updatedSession)
          setProfileError('')

          /*
           * TOKEN_REFRESHED and USER_UPDATED events should
           * not blank an already-loaded screen.
           */
          const shouldShowLoading =
            event === 'SIGNED_IN' ||
            event === 'INITIAL_SESSION' ||
            !profile

          if (shouldShowLoading) {
            setLoading(true)
          }

          authTimeoutRef.current =
            window.setTimeout(
              async () => {
                authTimeoutRef.current = null

                if (!mountedRef.current) {
                  return
                }

                if (
                  activeUserIdRef.current !==
                  nextUserId
                ) {
                  return
                }

                await fetchAccessContext(
                  updatedSession.user,
                )

                if (
                  mountedRef.current &&
                  activeUserIdRef.current ===
                    nextUserId
                ) {
                  setLoading(false)
                }
              },
              0,
            )
        },
      )

    return () => {
      mountedRef.current = false

      accessRequestIdRef.current += 1
      activeUserIdRef.current = null
      invitationAttemptedForUserRef.current = null

      clearScheduledAuthTimeout()
      subscription.unsubscribe()
    }
  }, [
    clearAccessState,
    clearScheduledAuthTimeout,
    fetchAccessContext,
    profile,
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