import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'

const DEFAULT_REDIRECT_URL =
  'https://trust.jemadi.co.uk/login'

function getRedirectUrl() {
  if (
    typeof window === 'undefined' ||
    !window.location?.origin
  ) {
    return DEFAULT_REDIRECT_URL
  }

  return `${window.location.origin}/login`
}

function normaliseEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getLoginErrorMessage(error) {
  const message = String(
    error?.message || '',
  ).toLowerCase()

  if (
    message.includes('email rate limit exceeded') ||
    message.includes('rate limit')
  ) {
    return 'Too many login links have been requested. Please wait a few minutes before trying again.'
  }

  if (
    message.includes('signups not allowed') ||
    message.includes('signup is disabled') ||
    message.includes('user not found') ||
    message.includes('no user found')
  ) {
    return 'This email is not registered for Trustera. Ask your company administrator to invite you.'
  }

  if (
    message.includes('invalid email') ||
    message.includes('email address is invalid')
  ) {
    return 'Enter a valid work email address.'
  }

  if (
    message.includes('network') ||
    message.includes('failed to fetch')
  ) {
    return 'Trustera could not connect to the authentication service. Check your internet connection and try again.'
  }

  return (
    error?.message ||
    'Unable to send the login link. Please try again.'
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [submittedEmail, setSubmittedEmail] =
    useState('')
  const [loading, setLoading] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  const normalisedEmail = useMemo(
    () => normaliseEmail(email),
    [email],
  )

  async function sendMagicLink(
    targetEmail,
    {
      showSuccessToast = true,
    } = {},
  ) {
    const { error } =
      await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          emailRedirectTo: getRedirectUrl(),
          shouldCreateUser: false,
        },
      })

    if (error) {
      throw error
    }

    setSubmittedEmail(targetEmail)
    setLinkSent(true)

    if (showSuccessToast) {
      toast.success(
        'Secure login link sent. Check your email inbox.',
      )
    }
  }

  async function handleLogin(event) {
    event.preventDefault()

    if (loading) return

    if (!normalisedEmail) {
      toast.error(
        'Please enter your work email address.',
      )
      return
    }

    if (!isValidEmail(normalisedEmail)) {
      toast.error(
        'Please enter a valid work email address.',
      )
      return
    }

    setLoading(true)

    try {
      await sendMagicLink(normalisedEmail)
      setEmail('')
    } catch (error) {
      console.error(
        'Unable to send Trustera login link:',
        error,
      )

      toast.error(
        getLoginErrorMessage(error),
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleResendLink() {
    if (loading || !submittedEmail) return

    setLoading(true)

    try {
      await sendMagicLink(
        submittedEmail,
        {
          showSuccessToast: false,
        },
      )

      toast.success(
        `A new login link has been sent to ${submittedEmail}.`,
      )
    } catch (error) {
      console.error(
        'Unable to resend Trustera login link:',
        error,
      )

      toast.error(
        getLoginErrorMessage(error),
      )
    } finally {
      setLoading(false)
    }
  }

  function handleUseDifferentEmail() {
    if (loading) return

    setEmail(submittedEmail)
    setSubmittedEmail('')
    setLinkSent(false)
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brandSection}>
          <Link
            to="/"
            style={styles.brandLink}
            aria-label="Return to Trustera home"
          >
            <span
              style={styles.logoMark}
              aria-hidden="true"
            >
              T
            </span>

            <span style={styles.brandName}>
              Trustera
            </span>
          </Link>

          <p style={styles.subtitle}>
            Workforce Compliance Management
          </p>
        </div>

        {!linkSent ? (
          <>
            <div style={styles.contentHeader}>
              <h1 style={styles.heading}>
                Sign in to Trustera
              </h1>

              <p style={styles.description}>
                Enter your registered work email
                address. We will send you a secure,
                passwordless login link.
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              style={styles.form}
              noValidate
            >
              <div style={styles.formGroup}>
                <label
                  htmlFor="login-email"
                  style={styles.label}
                >
                  Work email address
                </label>

                <input
                  id="login-email"
                  name="email"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck="false"
                  required
                  autoFocus
                  disabled={loading}
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  style={{
                    ...styles.input,
                    ...(loading
                      ? styles.disabledControl
                      : {}),
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  ...styles.primaryButton,
                  ...(loading
                    ? styles.disabledButton
                    : {}),
                }}
              >
                {loading
                  ? 'Sending secure link...'
                  : 'Send Magic Link'}
              </button>
            </form>

            <div style={styles.invitationNotice}>
              <div
                style={styles.noticeIcon}
                aria-hidden="true"
              >
                ✉
              </div>

              <div>
                <strong style={styles.noticeTitle}>
                  Invitation-only access
                </strong>

                <p style={styles.noticeText}>
                  Trustera accounts are created by
                  invitation. Contact your company
                  administrator if your email has not
                  yet been registered.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div
            role="status"
            aria-live="polite"
            style={styles.successSection}
          >
            <div
              style={styles.successIcon}
              aria-hidden="true"
            >
              ✓
            </div>

            <h1 style={styles.heading}>
              Check your email
            </h1>

            <p style={styles.description}>
              We sent a secure Trustera login link
              to:
            </p>

            <div style={styles.sentEmail}>
              {submittedEmail}
            </div>

            <p style={styles.helpText}>
              Open the email and select the login
              link. The link may take a minute to
              arrive. Check your spam or junk folder
              if it is not visible.
            </p>

            <button
              type="button"
              onClick={handleResendLink}
              disabled={loading}
              style={{
                ...styles.primaryButton,
                ...(loading
                  ? styles.disabledButton
                  : {}),
              }}
            >
              {loading
                ? 'Resending link...'
                : 'Resend Login Link'}
            </button>

            <button
              type="button"
              onClick={handleUseDifferentEmail}
              disabled={loading}
              style={{
                ...styles.secondaryButton,
                ...(loading
                  ? styles.disabledControl
                  : {}),
              }}
            >
              Use a different email address
            </button>
          </div>
        )}

        <div style={styles.homeSection}>
          <Link to="/" style={styles.homeLink}>
            ← Return to Trustera home
          </Link>
        </div>

        <footer style={styles.footer}>
          <div style={styles.securityRow}>
            <span aria-hidden="true">🔒</span>

            <span>
              Secure passwordless authentication
              powered by Supabase
            </span>
          </div>

          <p style={styles.footerText}>
            Never share your Trustera login link
            with another person.
          </p>
        </footer>
      </section>
    </main>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
    background:
      'radial-gradient(circle at top, #172554 0%, #020617 48%, #020617 100%)',
    color: '#ffffff',
  },

  card: {
    width: '100%',
    maxWidth: '460px',
    padding: '38px',
    boxSizing: 'border-box',
    border: '1px solid #1e293b',
    borderRadius: '20px',
    background: 'rgba(15, 23, 42, 0.96)',
    boxShadow:
      '0 28px 80px rgba(0, 0, 0, 0.45)',
  },

  brandSection: {
    marginBottom: '30px',
    textAlign: 'center',
  },

  brandLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '11px',
    color: '#ffffff',
    textDecoration: 'none',
  },

  logoMark: {
    width: '42px',
    height: '42px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    background:
      'linear-gradient(135deg, #2563eb, #06b6d4)',
    color: '#ffffff',
    fontSize: '21px',
    fontWeight: 800,
    boxShadow:
      '0 10px 26px rgba(37, 99, 235, 0.3)',
  },

  brandName: {
    fontSize: '30px',
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },

  subtitle: {
    margin: '10px 0 0',
    color: '#94a3b8',
    fontSize: '13px',
  },

  contentHeader: {
    marginBottom: '24px',
  },

  heading: {
    margin: '0 0 10px',
    color: '#ffffff',
    fontSize: '23px',
    lineHeight: 1.25,
    textAlign: 'center',
  },

  description: {
    margin: 0,
    color: '#94a3b8',
    fontSize: '14px',
    lineHeight: 1.65,
    textAlign: 'center',
  },

  form: {
    display: 'grid',
    gap: '18px',
  },

  formGroup: {
    display: 'grid',
    gap: '8px',
  },

  label: {
    color: '#e2e8f0',
    fontSize: '14px',
    fontWeight: 700,
  },

  input: {
    width: '100%',
    minHeight: '50px',
    padding: '13px 15px',
    boxSizing: 'border-box',
    border: '1px solid #334155',
    borderRadius: '11px',
    background: '#020617',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
    transition:
      'border-color 0.2s ease, box-shadow 0.2s ease',
  },

  primaryButton: {
    width: '100%',
    minHeight: '50px',
    padding: '13px 18px',
    border: 'none',
    borderRadius: '11px',
    background: '#2563eb',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 800,
    cursor: 'pointer',
    transition:
      'background 0.2s ease, opacity 0.2s ease',
  },

  secondaryButton: {
    width: '100%',
    minHeight: '46px',
    marginTop: '11px',
    padding: '11px 18px',
    border: '1px solid #475569',
    borderRadius: '11px',
    background: '#1e293b',
    color: '#e2e8f0',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },

  disabledButton: {
    background: '#475569',
    cursor: 'not-allowed',
    opacity: 0.7,
  },

  disabledControl: {
    cursor: 'not-allowed',
    opacity: 0.65,
  },

  invitationNotice: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    marginTop: '22px',
    padding: '15px',
    border: '1px solid #1e40af',
    borderRadius: '12px',
    background: 'rgba(30, 64, 175, 0.18)',
  },

  noticeIcon: {
    width: '34px',
    height: '34px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '9px',
    background: '#1d4ed8',
    color: '#ffffff',
  },

  noticeTitle: {
    display: 'block',
    color: '#dbeafe',
    fontSize: '13px',
  },

  noticeText: {
    margin: '5px 0 0',
    color: '#bfdbfe',
    fontSize: '12px',
    lineHeight: 1.55,
  },

  successSection: {
    textAlign: 'center',
  },

  successIcon: {
    width: '58px',
    height: '58px',
    margin: '0 auto 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #10b981',
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#6ee7b7',
    fontSize: '27px',
    fontWeight: 800,
  },

  sentEmail: {
    margin: '16px 0',
    padding: '12px',
    border: '1px solid #334155',
    borderRadius: '10px',
    background: '#020617',
    color: '#93c5fd',
    fontSize: '14px',
    fontWeight: 700,
    overflowWrap: 'anywhere',
  },

  helpText: {
    margin: '0 0 22px',
    color: '#94a3b8',
    fontSize: '13px',
    lineHeight: 1.65,
  },

  homeSection: {
    marginTop: '24px',
    textAlign: 'center',
  },

  homeLink: {
    color: '#60a5fa',
    fontSize: '14px',
    fontWeight: 700,
    textDecoration: 'none',
  },

  footer: {
    marginTop: '28px',
    paddingTop: '20px',
    borderTop: '1px solid #1e293b',
    textAlign: 'center',
  },

  securityRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: 1.5,
  },

  footerText: {
    margin: '8px 0 0',
    color: '#64748b',
    fontSize: '11px',
    lineHeight: 1.5,
  },
}