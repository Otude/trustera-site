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

async function readFunctionError(
  error,
  fallbackMessage,
) {
  let message =
    error?.message ||
    fallbackMessage

  const context = error?.context

  if (!context) {
    return message
  }

  try {
    const body =
      await context.clone().json()

    if (body?.error) {
      message = body.error
    } else if (body?.message) {
      message = body.message
    }
  } catch {
    try {
      const text =
        await context.clone().text()

      if (text) {
        message = text
      }
    } catch {
      // Preserve the original function error.
    }
  }

  return message
}

function sessionsMatch(
  previousSession,
  nextSession,
) {
  if (previousSession === nextSession) {
    return true
  }

  if (!previousSession && !nextSession) {
    return true
  }

  if (!previousSession || !nextSession) {
    return false
  }

  return (
    previousSession.user?.id ===
      nextSession.user?.id &&
    previousSession.access_token ===
      nextSession.access_token &&
    previousSession.expires_at ===
      nextSession.expires_at
  )
}

function profilesMatch(
  previousProfile,
  nextProfile,
) {
  if (previousProfile === nextProfile) {
    return true
  }

  if (!previousProfile || !nextProfile) {
    return false
  }

  return (
    previousProfile.id === nextProfile.id &&
    previousProfile.company_id ===
      nextProfile.company_id &&
    previousProfile.email ===
      nextProfile.email &&
    previousProfile.full_name ===
      nextProfile.full_name &&
    previousProfile.role ===
      nextProfile.role &&
    previousProfile.created_at ===
      nextProfile.created_at &&
    previousProfile.is_platform_admin ===
      nextProfile.is_platform_admin
  )
}

export default function App() {
  const [session, setSession] =
    useState(null)

  const [profile, setProfile] =
    useState(null)

  const [
    isPlatformAdmin,
    setIsPlatformAdmin,
  ] = useState(false)

  const [loading, setLoading] =
    useState(true)

  const [
    profileError,
    setProfileError,
  ] = useState('')

  /*
   * Tracks whether App remains mounted.
   */
  const mountedRef = useRef(false)

  /*
   * Only the newest access-context request may
   * update React state.
   */
  const accessRequestIdRef = useRef(0)

  /*
   * Stores the current authenticated user ID.
   */
  const activeUserIdRef = useRef(null)

  /*
   * Stores the user whose access context is already
   * loaded.
   */
  const loadedAccessUserIdRef = useRef(null)

  /*
   * Stores the user whose access context is currently
   * being requested.
   */
  const loadingAccessUserIdRef = useRef(null)

  /*
   * Stores the deferred authentication callback.
   */
  const authTimeoutRef = useRef(null)

  /*
   * Prevents repeated invitation acceptance requests
   * for the same authenticated user.
   */
  const invitationAttemptedForUserRef =
    useRef(null)

  /*
   * Indicates that the initial getSession request has
   * completed.
   */
  const initialAuthCompletedRef =
    useRef(false)

  const updateSessionState = useCallback(
    (nextSession) => {
      if (!mountedRef.current) return

      setSession((previousSession) =>
        sessionsMatch(
          previousSession,
          nextSession,
        )
          ? previousSession
          : nextSession,
      )
    },
    [],
  )

  const clearScheduledAuthTimeout =
    useCallback(() => {
      if (
        authTimeoutRef.current !== null
      ) {
        window.clearTimeout(
          authTimeoutRef.current,
        )

        authTimeoutRef.current = null
      }
    }, [])

  const clearAccessState = useCallback(
    ({ clearError = true } = {}) => {
      accessRequestIdRef.current += 1

      activeUserIdRef.current = null
      loadedAccessUserIdRef.current = null
      loadingAccessUserIdRef.current = null

      invitationAttemptedForUserRef.current =
        null

      if (!mountedRef.current) return

      setProfile(null)
      setIsPlatformAdmin(false)

      if (clearError) {
        setProfileError('')
      }
    },
    [],
  )

  /*
   * Invitation acceptance is completed by the
   * authenticated Edge Function.
   *
   * The browser must not update company_invitations
   * directly because the Edge Function also verifies
   * company membership, role and invitation ownership.
   */
  const acceptPendingInvitation =
    useCallback(async (user) => {
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

      const invitationId = String(
        user.user_metadata?.invitation_id ||
          '',
      ).trim()

      const companyId = String(
        user.user_metadata?.company_id ||
          '',
      ).trim()

      /*
       * Existing users with no invitation metadata
       * do not need to invoke the acceptance function.
       */
      if (!invitationId && !companyId) {
        return {
          attempted: false,
          accepted: false,
        }
      }

      invitationAttemptedForUserRef.current =
        user.id

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
         * Permit a future genuine sign-in event to retry.
         */
        invitationAttemptedForUserRef.current =
          null

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
    }, [])

  const fetchProfileRecord =
    useCallback(async (userId) => {
      return supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .eq('id', userId)
        .maybeSingle()
    }, [])

  const fetchPlatformAdminRecord =
    useCallback(async (userId) => {
      return supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
    }, [])

  const fetchAccessContext = useCallback(
    async (
      user,
      {
        showFullScreenLoader = false,
        synchroniseInvitation = true,
      } = {},
    ) => {
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

      const userId = user.id

      /*
       * Prevent a duplicate request for the same user
       * while one is already running.
       */
      if (
        loadingAccessUserIdRef.current ===
        userId
      ) {
        return null
      }

      const requestId =
        accessRequestIdRef.current + 1

      accessRequestIdRef.current =
        requestId

      activeUserIdRef.current =
        userId

      loadingAccessUserIdRef.current =
        userId

      function requestIsCurrent() {
        return (
          mountedRef.current &&
          accessRequestIdRef.current ===
            requestId &&
          activeUserIdRef.current ===
            userId
        )
      }

      if (
        showFullScreenLoader &&
        mountedRef.current
      ) {
        setLoading(true)
      }

      try {
        if (requestIsCurrent()) {
          setProfileError('')
        }

        /*
         * Platform administrators may legitimately
         * exist without a company profile.
         */
        const platformAdminResponse =
          await fetchPlatformAdminRecord(
            userId,
          )

        if (!requestIsCurrent()) {
          return null
        }

        if (
          platformAdminResponse.error
        ) {
          throw platformAdminResponse.error
        }

        const platformAdmin = Boolean(
          platformAdminResponse.data
            ?.user_id,
        )

        /*
         * Read the profile before attempting invitation
         * acceptance. Existing users should not invoke
         * the Edge Function unnecessarily.
         */
        let profileResponse =
          await fetchProfileRecord(
            userId,
          )

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
         * the invitation Edge Function creates or
         * synchronises it.
         */
        if (
          !profileData &&
          !platformAdmin &&
          synchroniseInvitation
        ) {
          const acceptanceResult =
            await acceptPendingInvitation(
              user,
            )

          if (!requestIsCurrent()) {
            return null
          }

          /*
           * Query the profile again after either a new
           * acceptance or an idempotent acceptance
           * response.
           */
          if (
            acceptanceResult.attempted
          ) {
            profileResponse =
              await fetchProfileRecord(
                userId,
              )

            if (!requestIsCurrent()) {
              return null
            }

            if (
              profileResponse.error
            ) {
              throw profileResponse.error
            }

            profileData =
              profileResponse.data || null
          }
        }

        if (
          !profileData &&
          !platformAdmin
        ) {
          throw new Error(
            'Your Trustera user profile could not be found. The invitation may be invalid, expired or not yet completed. Contact your organisation administrator.',
          )
        }

        const normalisedProfile =
          profileData
            ? {
                ...profileData,

                email:
                  profileData.email ||
                  user.email ||
                  '',

                full_name:
                  resolveProfileName(
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
                id: userId,
                company_id: null,
                email: user.email || '',

                full_name:
                  resolveProfileName(
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

        loadedAccessUserIdRef.current =
          userId

        setProfile(
          (previousProfile) =>
            profilesMatch(
              previousProfile,
              normalisedProfile,
            )
              ? previousProfile
              : normalisedProfile,
        )

        setIsPlatformAdmin(
          (previousValue) =>
            previousValue ===
            platformAdmin
              ? previousValue
              : platformAdmin,
        )

        setProfileError('')

        return {
          profile: normalisedProfile,
          isPlatformAdmin:
            platformAdmin,
        }
      } catch (error) {
        console.error(
          'Unable to load Trustera access context:',
          error,
        )

        if (!requestIsCurrent()) {
          return null
        }

        loadedAccessUserIdRef.current =
          null

        setProfile(null)
        setIsPlatformAdmin(false)

        setProfileError(
          error?.message ||
            'Unable to load your Trustera user profile.',
        )

        return null
      } finally {
        if (
          loadingAccessUserIdRef.current ===
          userId
        ) {
          loadingAccessUserIdRef.current =
            null
        }

        if (
          requestIsCurrent() &&
          showFullScreenLoader
        ) {
          setLoading(false)
        }
      }
    },
    [
      acceptPendingInvitation,
      fetchPlatformAdminRecord,
      fetchProfileRecord,
    ],
  )

  const scheduleAccessContextLoad =
    useCallback(
      (
        user,
        {
          showFullScreenLoader = false,
          synchroniseInvitation = true,
        } = {},
      ) => {
        if (!user?.id) return

        clearScheduledAuthTimeout()

        const expectedUserId =
          user.id

        authTimeoutRef.current =
          window.setTimeout(
            async () => {
              authTimeoutRef.current =
                null

              if (!mountedRef.current) {
                return
              }

              if (
                activeUserIdRef.current !==
                expectedUserId
              ) {
                return
              }

              await fetchAccessContext(
                user,
                {
                  showFullScreenLoader,
                  synchroniseInvitation,
                },
              )
            },
            0,
          )
      },
      [
        clearScheduledAuthTimeout,
        fetchAccessContext,
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

        updateSessionState(
          currentSession,
        )

        if (currentSession?.user) {
          const userId =
            currentSession.user.id

          activeUserIdRef.current =
            userId

          await fetchAccessContext(
            currentSession.user,
            {
              showFullScreenLoader:
                false,

              synchroniseInvitation:
                true,
            },
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
        loadedAccessUserIdRef.current =
          null

        loadingAccessUserIdRef.current =
          null

        invitationAttemptedForUserRef.current =
          null

        setSession(null)
        setProfile(null)
        setIsPlatformAdmin(false)

        setProfileError(
          error?.message ||
            'Unable to initialise your Trustera session.',
        )
      } finally {
        initialAuthCompletedRef.current =
          true

        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (event, updatedSession) => {
          if (!mountedRef.current) {
            return
          }

          updateSessionState(
            updatedSession,
          )

          if (
            event === 'SIGNED_OUT' ||
            !updatedSession?.user
          ) {
            clearScheduledAuthTimeout()
            clearAccessState()
            setLoading(false)
            return
          }

          const user =
            updatedSession.user

          const nextUserId =
            user.id

          const previousUserId =
            activeUserIdRef.current

          const userChanged =
            Boolean(previousUserId) &&
            previousUserId !==
              nextUserId

          if (userChanged) {
            accessRequestIdRef.current +=
              1

            loadedAccessUserIdRef.current =
              null

            loadingAccessUserIdRef.current =
              null

            invitationAttemptedForUserRef.current =
              null
          }

          activeUserIdRef.current =
            nextUserId

          /*
           * Token refresh events only update the token.
           * They must not reload the profile or replace
           * the current page with a loader.
           */
          if (
            event ===
            'TOKEN_REFRESHED'
          ) {
            return
          }

          /*
           * getSession frequently overlaps with
           * INITIAL_SESSION.
           */
          if (
            event ===
              'INITIAL_SESSION' &&
            (
              loadedAccessUserIdRef.current ===
                nextUserId ||
              loadingAccessUserIdRef.current ===
                nextUserId
            )
          ) {
            return
          }

          /*
           * Supabase may emit duplicate SIGNED_IN events
           * when a tab is restored or regains focus.
           */
          if (
            event === 'SIGNED_IN' &&
            !userChanged &&
            (
              loadedAccessUserIdRef.current ===
                nextUserId ||
              loadingAccessUserIdRef.current ===
                nextUserId
            )
          ) {
            return
          }

          /*
           * USER_UPDATED may contain changed metadata.
           * Refresh in the background without removing
           * the current screen.
           */
          if (
            event === 'USER_UPDATED'
          ) {
            scheduleAccessContextLoad(
              user,
              {
                showFullScreenLoader:
                  false,

                synchroniseInvitation:
                  false,
              },
            )

            return
          }

          const alreadyLoaded =
            loadedAccessUserIdRef.current ===
            nextUserId

          const alreadyLoading =
            loadingAccessUserIdRef.current ===
            nextUserId

          if (
            alreadyLoaded ||
            alreadyLoading
          ) {
            return
          }

          const shouldShowFullScreenLoader =
            userChanged ||
            !initialAuthCompletedRef.current ||
            !loadedAccessUserIdRef.current

          scheduleAccessContextLoad(
            user,
            {
              showFullScreenLoader:
                shouldShowFullScreenLoader,

              synchroniseInvitation:
                true,
            },
          )
        },
      )

    initialiseAuth()

    return () => {
      mountedRef.current = false

      accessRequestIdRef.current += 1

      activeUserIdRef.current = null
      loadedAccessUserIdRef.current =
        null

      loadingAccessUserIdRef.current =
        null

      invitationAttemptedForUserRef.current =
        null

      clearScheduledAuthTimeout()
      subscription.unsubscribe()
    }
  }, [
    clearAccessState,
    clearScheduledAuthTimeout,
    fetchAccessContext,
    scheduleAccessContextLoad,
    updateSessionState,
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
            border:
              '1px solid #334155',
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

  const canViewWorkers =
    hasCompany &&
    (
      isPlatformAdmin ||
      can(profile, 'viewWorkers')
    )

  const canAddWorkers =
    hasCompany &&
    (
      isPlatformAdmin ||
      can(profile, 'addWorkers')
    )

  const canViewDocuments =
    hasCompany &&
    (
      isPlatformAdmin ||
      can(profile, 'viewDocuments')
    )

  const canViewNotifications =
    hasCompany &&
    (
      isPlatformAdmin ||
      can(profile, 'viewNotifications')
    )

  const canViewAuditLogs =
    hasCompany &&
    (
      isPlatformAdmin ||
      can(profile, 'viewAuditLogs')
    )

  const canManageTeam =
    hasCompany &&
    (
      isPlatformAdmin ||
      can(profile, 'manageTeam')
    )

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
            canViewWorkers ? (
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
            canViewWorkers ? (
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
            canViewDocuments ? (
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
          border:
            '4px solid #334155',
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