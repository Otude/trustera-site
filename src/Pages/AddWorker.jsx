import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'

const INITIAL_FORM = {
  fullName: '',
  role: '',
  site: '',
  status: 'active',
}

export default function AddWorker({ profile }) {
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [localProfile, setLocalProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(!profile)
  const [submitting, setSubmitting] = useState(false)

  const activeProfile = profile || localProfile
  const isAdmin = activeProfile?.role === 'admin'

  const canSubmit = useMemo(() => {
    return (
      isAdmin &&
      Boolean(activeProfile?.company_id) &&
      Boolean(formData.fullName.trim()) &&
      Boolean(formData.role.trim()) &&
      Boolean(formData.site.trim()) &&
      !submitting
    )
  }, [
    activeProfile?.company_id,
    formData.fullName,
    formData.role,
    formData.site,
    isAdmin,
    submitting,
  ])

  useEffect(() => {
    if (profile) {
      setLocalProfile(null)
      setProfileLoading(false)
      return
    }

    let isMounted = true

    async function loadProfile() {
      try {
        setProfileLoading(true)

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) {
          throw userError
        }

        if (!user) {
          throw new Error('You must be signed in to add a worker.')
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, company_id, email, role')
          .eq('id', user.id)
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
          setLocalProfile(data)
        }
      } catch (error) {
        console.error('Unable to load profile:', error)

        if (isMounted) {
          setLocalProfile(null)
          toast.error(
            error?.message || 'Unable to load your user profile.',
          )
        }
      } finally {
        if (isMounted) {
          setProfileLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      isMounted = false
    }
  }, [profile])

  function handleChange(event) {
    const { name, value } = event.target

    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function createAuditLog({
    action,
    entityType,
    entityId,
    entityName,
    details,
  }) {
    if (!activeProfile?.company_id) {
      throw new Error(
        'Cannot create an audit log without a company ID.',
      )
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      throw userError
    }

    if (!user) {
      throw new Error(
        'Cannot create an audit log without an authenticated user.',
      )
    }

    const auditRecord = {
      company_id: activeProfile.company_id,
      user_id: user.id,
      user_email: user.email || activeProfile.email || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      entity_name: entityName || null,
      details:
        typeof details === 'string'
          ? details
          : details
            ? JSON.stringify(details)
            : null,
    }

    const { error } = await supabase
      .from('audit_logs')
      .insert([auditRecord])

    if (error) {
      throw error
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (submitting) {
      return
    }

    if (!isAdmin) {
      toast.error('Only administrators can add workers.')
      return
    }

    if (!activeProfile?.company_id) {
      toast.error('Your profile is not assigned to a company.')
      return
    }

    const fullName = formData.fullName.trim()
    const workerRole = formData.role.trim()
    const workerSite = formData.site.trim()

    if (!fullName || !workerRole || !workerSite) {
      toast.error('Please complete all required fields.')
      return
    }

    try {
      setSubmitting(true)

      const workerRecord = {
        company_id: activeProfile.company_id,
        full_name: fullName,
        role: workerRole,
        site: workerSite,
        status: formData.status,
      }

      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .insert([workerRecord])
        .select(
          'id, company_id, full_name, role, site, status, created_at',
        )
        .single()

      if (workerError) {
        throw workerError
      }

      try {
        await createAuditLog({
          action: 'worker_created',
          entityType: 'worker',
          entityId: worker.id,
          entityName: worker.full_name,
          details: {
            full_name: worker.full_name,
            role: worker.role,
            site: worker.site,
            status: worker.status,
          },
        })
      } catch (auditError) {
        console.error('Worker audit log failed:', auditError)

        toast.error(
          'Worker was added, but the audit log could not be created.',
        )
      }

      setFormData(INITIAL_FORM)
      toast.success('Worker added successfully.')
    } catch (error) {
      console.error('Unable to add worker:', error)

      toast.error(
        error?.message || 'Unable to add the worker. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (profileLoading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Add Worker</h1>
          <p style={styles.mutedText}>Loading your profile...</p>
        </div>
      </div>
    )
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.heading}>Add Worker</h1>

            <p style={styles.description}>
              Create a worker record for your organisation.
            </p>
          </div>

          {activeProfile?.company_id && (
            <span style={styles.companyBadge}>
              Company assigned
            </span>
          )}
        </div>

        {!activeProfile && (
          <div style={styles.errorNotice}>
            Your user profile could not be loaded. Sign out and sign in
            again before trying to add a worker.
          </div>
        )}

        {activeProfile && !activeProfile.company_id && (
          <div style={styles.errorNotice}>
            Your profile is not assigned to a company. A company must be
            assigned before workers can be created.
          </div>
        )}

        {activeProfile && !isAdmin && (
          <div style={styles.warningNotice}>
            You are signed in as{' '}
            <strong>{activeProfile.role || 'staff'}</strong>. Only
            administrators can add workers.
          </div>
        )}

        {isAdmin && activeProfile?.company_id && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label htmlFor="fullName" style={styles.label}>
                Full name
              </label>

              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Enter the worker's full name"
                value={formData.fullName}
                onChange={handleChange}
                disabled={submitting}
                required
                autoComplete="name"
                maxLength={150}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="role" style={styles.label}>
                Role
              </label>

              <input
                id="role"
                name="role"
                type="text"
                placeholder="For example, Security Officer"
                value={formData.role}
                onChange={handleChange}
                disabled={submitting}
                required
                maxLength={100}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="site" style={styles.label}>
                Site
              </label>

              <input
                id="site"
                name="site"
                type="text"
                placeholder="Enter the worker's site"
                value={formData.site}
                onChange={handleChange}
                disabled={submitting}
                required
                maxLength={150}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="status" style={styles.label}>
                Status
              </label>

              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                disabled={submitting}
                required
                style={styles.input}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...styles.button,
                ...(!canSubmit ? styles.disabledButton : {}),
              }}
            >
              {submitting ? 'Adding worker...' : 'Add Worker'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

const styles = {
  page: {
    minHeight: 'calc(100vh - 80px)',
    background: '#020617',
    color: '#ffffff',
    padding: '40px',
  },

  card: {
    width: '100%',
    maxWidth: '640px',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '20px',
    marginBottom: '24px',
  },

  heading: {
    margin: 0,
    fontSize: '28px',
    lineHeight: 1.2,
  },

  description: {
    marginTop: '8px',
    marginBottom: 0,
    color: '#94a3b8',
    lineHeight: 1.6,
  },

  mutedText: {
    color: '#94a3b8',
  },

  companyBadge: {
    flexShrink: 0,
    padding: '7px 10px',
    borderRadius: '999px',
    background: '#064e3b',
    color: '#a7f3d0',
    border: '1px solid #047857',
    fontSize: '12px',
    fontWeight: 700,
  },

  form: {
    width: '100%',
    maxWidth: '500px',
  },

  field: {
    marginBottom: '20px',
  },

  label: {
    display: 'block',
    marginBottom: '8px',
    color: '#e2e8f0',
    fontWeight: 600,
  },

  warningNotice: {
    maxWidth: '700px',
    marginBottom: '24px',
    padding: '14px',
    border: '1px solid #92400e',
    borderRadius: '10px',
    background: '#78350f',
    color: '#fde68a',
    lineHeight: 1.5,
  },

  errorNotice: {
    maxWidth: '700px',
    marginBottom: '24px',
    padding: '14px',
    border: '1px solid #991b1b',
    borderRadius: '10px',
    background: '#7f1d1d',
    color: '#fecaca',
    lineHeight: 1.5,
  },

  input: {
    boxSizing: 'border-box',
    width: '100%',
    padding: '14px',
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#ffffff',
    borderRadius: '8px',
    outline: 'none',
    fontSize: '15px',
  },

  button: {
    width: '100%',
    padding: '14px',
    background: '#2563eb',
    border: 'none',
    color: '#ffffff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '15px',
  },

  disabledButton: {
    background: '#475569',
    cursor: 'not-allowed',
    opacity: 0.75,
  },
}