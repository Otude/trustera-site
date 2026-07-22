import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

function getRedirectUrl() {
  if (typeof window === 'undefined') {
    return 'https://trust.jemadi.co.uk/login'
  }

  return `${window.location.origin}/login`
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event) {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      toast.error('Please enter your email address.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: getRedirectUrl(),
          shouldCreateUser: false,
        },
      })

      if (error) {
        throw error
      }

      toast.success(
        'Magic login link sent. Please check your email.',
      )

      setEmail('')
    } catch (error) {
      console.error('Login error:', error)

      const message = error?.message?.toLowerCase() || ''

      if (message.includes('email rate limit exceeded')) {
        toast.error(
          'Too many login links have been requested. Please wait a few minutes before trying again.',
        )
      } else if (
        message.includes('signups not allowed') ||
        message.includes('user not found')
      ) {
        toast.error(
          'This email is not registered for Trustera. Contact your administrator.',
        )
      } else {
        toast.error(
          error?.message ||
            'Unable to send the login link. Please try again.',
        )
      }
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
          Enter your work email address and we&apos;ll send you a
          secure magic link.
        </p>

        <form onSubmit={handleLogin} style={styles.form}>
          <label htmlFor="login-email" style={styles.label}>
            Work email address
          </label>

          <input
            id="login-email"
            name="email"
            type="email"
            placeholder="name@company.com"
            autoComplete="email"
            inputMode="email"
            required
            disabled={loading}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{
              ...styles.input,
              ...(loading ? styles.inputDisabled : {}),
            }}
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

        <div style={styles.homeSection}>
          <Link to="/" style={styles.homeLink}>
            Return to Trustera home
          </Link>
        </div>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Secure passwordless authentication powered by Supabase.
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
    boxSizing: 'border-box',
  },

  card: {
    width: '100%',
    maxWidth: '430px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '18px',
    padding: '40px',
    boxSizing: 'border-box',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.3)',
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
    marginBottom: 0,
    color: '#94a3b8',
    fontSize: '14px',
  },

  heading: {
    color: '#ffffff',
    marginTop: 0,
    marginBottom: '8px',
    fontSize: '21px',
  },

  description: {
    color: '#94a3b8',
    lineHeight: 1.6,
    marginTop: 0,
    marginBottom: '24px',
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },

  label: {
    color: '#e2e8f0',
    fontSize: '14px',
    fontWeight: 600,
  },

  input: {
    width: '100%',
    padding: '15px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  },

  inputDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },

  button: {
    width: '100%',
    padding: '15px',
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  },

  buttonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },

  homeSection: {
    marginTop: '22px',
    textAlign: 'center',
  },

  homeLink: {
    color: '#60a5fa',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
  },

  footer: {
    marginTop: '28px',
    textAlign: 'center',
  },

  footerText: {
    color: '#64748b',
    fontSize: '13px',
    lineHeight: 1.5,
    margin: 0,
  },
}