import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)

  useEffect(() => {
    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    setSession(session)
    setLoading(false)
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#020817',
          color: 'white',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" />
  }

  return children
}