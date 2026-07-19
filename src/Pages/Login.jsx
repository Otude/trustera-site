import { useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

const REDIRECT_URL =
  import.meta.env.MODE === 'development'
    ? 'http://localhost:5173'
    : 'https://trust.jemadi.co.uk'

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('Please enter your email address.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: REDIRECT_URL,
        },
      })

      if (error) {
        throw error
      }

      toast.success(
        'Magic login link sent. Please check your email.'
      )

      setEmail('')
    } catch (error) {
      console.error('Login error:', error)

      toast.error(
        error?.message ||
          'Unable to send login link. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <h1 style={styles.title}>Trustera</h1>

          <p style={styles.subtitle}>
            Compliance Management Platform
          </p>
        </div>

        <h2 style={styles.heading}>Sign in</h2>

        <p style={styles.description}>
          Enter your work email address and we'll send you a secure
          magic link.
        </p>

        <form onSubmit={handleLogin} style={styles.form}>
          <input
            type="email"
            placeholder="Email address"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
          >
            {loading
              ? 'Sending login link...'
              : 'Send Magic Link'}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Secure passwordless authentication powered by
            Supabase.
          </p>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#020617',
    padding: '24px',
  },

  card: {
    width: '100%',
    maxWidth: '430px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '18px',
    padding: '40px',
    boxSizing: 'border-box',
  },

  logo: {
    textAlign: 'center',
    marginBottom: '30px',
  },

  title: {
    margin: 0,
    color: '#ffffff',
    fontSize: '34px',
    fontWeight: 700,
  },

  subtitle: {
    marginTop: '8px',
    color: '#94a3b8',
    fontSize: '14px',
  },

  heading: {
    color: '#ffffff',
    marginBottom: '8px',
  },

  description: {
    color: '#94a3b8',
    lineHeight: 1.6,
    marginBottom: '24px',
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  input: {
    padding: '15px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
  },

  button: {
    padding: '15px',
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    transition: '0.2s',
  },

  buttonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },

  footer: {
    marginTop: '28px',
    textAlign: 'center',
  },

  footerText: {
    color: '#64748b',
    fontSize: '13px',
    margin: 0,
  },
}