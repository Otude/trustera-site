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
  useState,
} from 'react'
import { Toaster } from 'react-hot-toast'

import { supabase } from './supabase'

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
  status,
  created_at,
  updated_at
`

const COMPANY_ROLES = [
  'admin',
  'manager',
  'compliance_officer',
  'staff',
  'viewer',
  'worker',
]

const BLOCKED_ACCOUNT_STATUSES = [
  'suspended',
  'inactive',
  'disabled',
]

function normaliseRole(role) {
  const value = String(role || '')
    .trim()
    .toLowerCase()

  return COMPANY_ROLES.includes(value)
    ? value
    : 'staff'
}

function normaliseStatus(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase()

  return value || 'active'
}

function isBlockedStatus(status) {
  return BLOCKED_ACCOUNT_STATUSES.includes(
    normaliseStatus(status),
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

  const clearAccessState = useCallback(() => {
    setProfile(null)
    setIsPlatformAdmin(false)
    setProfileError('')
  }, [])

  const markInvitationAsAccepted =
    useCallback(async (userId) => {
      if (!userId) return

      const acceptedAt =
        new Date().toISOString()

      const { error } = await supabase
        .from('company_invitations')
        .update({
          status: 'accepted',
          accepted_at: acceptedAt,
        })
        .eq('auth_user_id', userId)
        .eq('status', 'pending')

      if (error) {
        /*
         * Invitation acceptance should not block
         * an otherwise valid user from signing in.
         */
        console.error(
          'Unable to mark invitation as accepted:',
          error,
        )
      }
    }, [])

  const fetchAccessContext = useCallback(
    async (user, isMounted = true) => {
      try {
        if (!user?.id) {
          throw new Error(
            'The authenticated Trustera user could not be identified.',
          )
        }

        if (isMounted) {
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

        if (!profileData && !platformAdmin) {
          throw new Error(
            'Your Trustera user profile could not be found. Contact your organisation administrator.',
          )
        }

        const normalisedProfile = profileData
          ? {
              ...profileData,

              role: normaliseRole(
                profileData.role,
              ),

              status: normaliseStatus(
                profileData.status,
              ),

              is_platform_admin:
                platformAdmin,
            }
          : {
              id: user.id,
              company_id: null,
              email: user.email || '',

              full_name:
                user.user_metadata
                  ?.full_name || '',

              role: 'staff',
              status: 'active',

              created_at:
                user.created_at || null,

              updated_at: null,

              is_platform_admin: true,
            }

        if (
          isBlockedStatus(
            normalisedProfile.status,
          )
        ) {
          throw new Error(
            'Your Trustera account is currently suspended. Contact your company administrator.',
          )
        }

        /*
         * Ordinary company users must belong to
         * a company.
         *
         * A platform administrator may exist
         * without a company assignment.
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
         * Once authentication and profile validation
         * are successful, mark any pending invitation
         * linked to this auth user as accepted.
         *
         * This is intentionally non-blocking.
         */
        await markInvitationAsAccepted(
          user.id,
        )

        if (isMounted) {
          setProfile(normalisedProfile)
          setIsPlatformAdmin(
            platformAdmin,
          )
        }

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

        if (isMounted) {
          setProfile(null)
          setIsPlatformAdmin(false)

          setProfileError(
            error?.message ||
              'Unable to load your Trustera user profile.',
          )
        }

        return null
      }
    },
    [markInvitationAsAccepted],
  )

  useEffect(() => {
    let isMounted = true

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

        if (!isMounted) return

        setSession(currentSession)

        if (currentSession?.user) {
          await fetchAccessContext(
            currentSession.user,
            isMounted,
          )
        } else {
          clearAccessState()
        }
      } catch (error) {
        console.error(
          'Unable to initialise authentication:',
          error,
        )

        if (isMounted) {
          setSession(null)
          setProfile(null)
          setIsPlatformAdmin(false)

          setProfileError(
            error?.message ||
              'Unable to initialise your Trustera session.',
          )
        }
      } finally {
        if (isMounted) {
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
          if (!isMounted) return

          setSession(updatedSession)

          if (updatedSession?.user) {
            setLoading(true)

            /*
             * Deferring this prevents conflicts
             * with Supabase auth state processing.
             */
            window.setTimeout(
              async () => {
                if (!isMounted) return

                await fetchAccessContext(
                  updatedSession.user,
                  isMounted,
                )

                if (isMounted) {
                  setLoading(false)
                }
              },
              0,
            )
          } else {
            clearAccessState()
            setLoading(false)
          }
        },
      )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [
    clearAccessState,
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
  const role =
    normaliseRole(profile?.role)

  const hasCompany = Boolean(
    profile?.company_id,
  )

  const canManageTeam =
    hasCompany && role === 'admin'

  const canViewAuditLogs =
    hasCompany &&
    [
      'admin',
      'compliance_officer',
    ].includes(role)

  const canAddWorkers =
    hasCompany &&
    [
      'admin',
      'manager',
      'compliance_officer',
    ].includes(role)

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
              />
            ) : (
              <Navigate
                to="/dashboard"
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
            ) : (
              <Navigate
                to="/platform-admin"
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
            ) : (
              <Navigate
                to="/platform-admin"
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
            ) : (
              <Navigate
                to="/platform-admin"
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
                    : '/platform-admin'
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
            ) : (
              <Navigate
                to="/platform-admin"
                replace
              />
            )
          }
        />

        <Route
          path="/notifications"
          element={
            hasCompany ? (
              <Notifications
                profile={profile}
              />
            ) : (
              <Navigate
                to="/platform-admin"
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
              />
            ) : (
              <Navigate
                to={
                  hasCompany
                    ? '/dashboard'
                    : '/platform-admin'
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
                    : '/platform-admin'
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