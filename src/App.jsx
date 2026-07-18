import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'

import { supabase } from './supabase'

import Header from './components/Header'

import Login from './Pages/Login'
import Dashboard from './Pages/Dashboard'
import Workers from './Pages/Workers'
import AddWorker from './Pages/AddWorker'
import Documents from './Pages/Documents'
import Notifications from './Pages/Notifications'
import WorkerProfile from './Pages/WorkerProfile'
import AuditLogs from './Pages/AuditLogs'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function initialiseAuth() {
      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          throw error
        }

        if (!isMounted) return

        setSession(currentSession)

        if (currentSession?.user) {
          await fetchProfile(currentSession.user.id, isMounted)
        } else {
          setProfile(null)
          setProfileError('')
        }
      } catch (error) {
        console.error('Unable to initialise authentication:', error)

        if (isMounted) {
          setSession(null)
          setProfile(null)
          setProfileError(
            error?.message || 'Unable to initialise your session.',
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
    } = supabase.auth.onAuthStateChange((_event, updatedSession) => {
      if (!isMounted) return

      setSession(updatedSession)

      if (updatedSession?.user) {
        setLoading(true)

        setTimeout(async () => {
          if (!isMounted) return

          await fetchProfile(updatedSession.user.id, isMounted)

          if (isMounted) {
            setLoading(false)
          }
        }, 0)
      } else {
        setProfile(null)
        setProfileError('')
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId, isMounted = true) {
    try {
      setProfileError('')

      const { data, error } = await supabase
        .from('profiles')
        .select('id, company_id, email, role, created_at')
        .eq('id', userId)
        .single()

      if (error) {
        throw error
      }

      if (!data?.company_id) {
        throw new Error(
          'Your user profile is not assigned to a company.',
        )
      }

      if (isMounted) {
        setProfile(data)
      }

      return data
    } catch (error) {
      console.error('Unable to load user profile:', error)

      if (isMounted) {
        setProfile(null)
        setProfileError(
          error?.message || 'Unable to load your user profile.',
        )
      }

      return null
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading Trustera..." />
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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : !profile ? (
        <ProfileErrorScreen
          message={
            profileError ||
            'Your Trustera profile could not be loaded.'
          }
        />
      ) : (
        <AuthenticatedApp profile={profile} />
      )}
    </BrowserRouter>
  )
}

function AuthenticatedApp({ profile }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#ffffff',
      }}
    >
      <Header profile={profile} />

      <Routes>
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />

        <Route
          path="/login"
          element={<Navigate to="/dashboard" replace />}
        />

        <Route
          path="/dashboard"
          element={<Dashboard profile={profile} />}
        />

        <Route
          path="/workers"
          element={<Workers profile={profile} />}
        />

        <Route
          path="/workers/:id"
          element={<WorkerProfile profile={profile} />}
        />

        <Route
          path="/add-worker"
          element={<AddWorker profile={profile} />}
        />

        <Route
          path="/documents"
          element={<Documents profile={profile} />}
        />

        <Route
          path="/notifications"
          element={<Notifications profile={profile} />}
        />

        <Route
          path="/audit-logs"
          element={
            profile.role === 'admin' ? (
              <AuditLogs profile={profile} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />

        <Route
          path="*"
          element={<Navigate to="/dashboard" replace />}
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
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020617',
        color: '#ffffff',
        fontSize: '18px',
      }}
    >
      {message}
    </div>
  )
}

function ProfileErrorScreen({ message }) {
  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
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
          border: '1px solid #334155',
          borderRadius: '16px',
          background: '#0f172a',
          textAlign: 'center',
        }}
      >
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

        <button
          type="button"
          onClick={handleSignOut}
          style={{
            padding: '12px 20px',
            border: 0,
            borderRadius: '10px',
            background: '#2563eb',
            color: '#ffffff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}