import { useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function createAuditLog({ action, entityName, details }) {
    await supabase.from('audit_logs').insert([
      {
        user_email: email || null,
        action,
        entity_type: 'auth',
        entity_name: entityName || null,
        details,
      },
    ])
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: 'http://localhost:5173',
      },
    })

    setLoading(false)

    if (error) {
      await createAuditLog({
        action: 'login_magic_link_failed',
        entityName: email,
        details: `Magic link request failed for ${email}. Error: ${error.message}`,
      })

      toast.error(error.message)
      return
    }

    await createAuditLog({
      action: 'login_magic_link_requested',
      entityName: email,
      details: `Magic login link requested for ${email}.`,
    })

    toast.success('Magic login link sent. Check your email.')
    setEmail('')
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Trustera Login</h1>

        <p style={{ color: '#94a3b8' }}>
          Enter your email to receive a secure login link.
        </p>

        <form onSubmit={handleLogin} style={{ marginTop: '24px' }}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#020817',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    width: '400px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '32px',
  },

  input: {
    width: '100%',
    padding: '14px',
    marginBottom: '16px',
    background: '#1e293b',
    border: '1px solid #334155',
    color: 'white',
    borderRadius: '8px',
  },

  button: {
    width: '100%',
    padding: '14px',
    background: '#2563eb',
    border: 'none',
    color: 'white',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}