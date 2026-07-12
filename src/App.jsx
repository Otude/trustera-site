import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { Toaster } from 'react-hot-toast'

import Header from './components/Header'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Workers from './pages/Workers'
import AddWorker from './pages/AddWorker'
import Documents from './pages/Documents'
import Notifications from './pages/Notifications'
import WorkerProfile from './pages/WorkerProfile'
import AuditLogs from './pages/AuditLogs'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)

      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    setSession(session)

    if (session?.user) {
      await fetchProfile(session.user.id)
    }

    setLoading(false)
  }

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error) {
      setProfile(data)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020617',
          color: 'white',
          fontSize: '18px',
        }}
      >
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <BrowserRouter>
      <div
        style={{
          minHeight: '100vh',
          background: '#020617',
        }}
      >
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0f172a',
              color: 'white',
              border: '1px solid #334155',
            },
            success: {
              iconTheme: {
                primary: '#22c55e',
                secondary: 'white',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: 'white',
              },
            },
          }}
        />

        <Header profile={profile} />

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" />} />

          <Route path="/dashboard" element={<Dashboard profile={profile} />} />

          <Route path="/workers" element={<Workers profile={profile} />} />

          <Route
            path="/workers/:id"
            element={<WorkerProfile profile={profile} />}
          />

          <Route
            path="/add-worker"
            element={<AddWorker profile={profile} />}
          />

          <Route path="/documents" element={<Documents profile={profile} />} />

          <Route
            path="/notifications"
            element={<Notifications profile={profile} />}
          />

          <Route
            path="/audit-logs"
            element={
              profile?.role === 'admin' ? (
                <AuditLogs profile={profile} />
              ) : (
                <Navigate to="/dashboard" />
              )
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}