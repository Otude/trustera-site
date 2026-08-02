// src/components/ProtectedRoute.jsx

import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)

  useEffect(() => {
    let mounted = true

    async function initialiseSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          throw error
        }

        if (!mounted) return

        setSession(session)
      } catch (error) {
        console.error(
          'Unable to initialise authentication:',
          error,
        )

        if (mounted) {
          setSession(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initialiseSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, updatedSession) => {
        if (!mounted) return

        setSession(updatedSession)
        setLoading(false)
      },
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#020617',
          color: '#ffffff',
          fontSize: '18px',
          fontWeight: 500,
        }}
      >
        Loading Trustera...
      </div>
    )
  }

  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
      />
    )
  }

  return children
}