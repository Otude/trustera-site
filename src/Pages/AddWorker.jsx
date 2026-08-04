import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'
import { can } from '../utils/permissions'

const INITIAL_FORM = {
  fullName: '',
  role: '',
  site: '',
  status: 'active',
}

export default function AddWorker({ profile }) {
  const [formData, setFormData] =
    useState(INITIAL_FORM)

  const [localProfile, setLocalProfile] =
    useState(null)

  const [profileLoading, setProfileLoading] =
    useState(!profile)

  const [submitting, setSubmitting] =
    useState(false)

  const activeProfile = profile || localProfile

  /*
   * Prefer the granular addWorkers permission.
   *
   * manageWorkers remains as a temporary fallback while the
   * permissions configuration is being migrated.
   */
  const legacyCanManageWorkers = can(
    activeProfile,
    'manageWorkers',
  )

  const canAddWorker =
    can(activeProfile, 'addWorkers') ||
    legacyCanManageWorkers

  const companyId =
    activeProfile?.company_id || null

  const canSubmit = useMemo(() => {
    return Boolean(
      canAddWorker &&
        companyId &&
        formData.fullName.trim() &&
        formData.role.trim() &&
        formData.site.trim() &&
        ['active', 'inactive'].includes(
          formData.status,
        ) &&
        !submitting,
    )
  }, [
    canAddWorker,
    companyId,
    formData.fullName,
    formData.role,
    formData.site,
    formData.status,
    submitting,
  ])

  useEffect(() => {
    if (profile) {
      setLocalProfile(null)
      setProfileLoading(false)
      return undefined
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
          throw new Error(
            'You must be signed in to add a worker.',
          )
        }

        const { data, error } = await supabase
          .from('profiles')
          .select(`
            id,
            company_id,
            email,
            full_name,
            role
          `)
          .eq('id', user.id)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (!data) {
          throw new Error(
            'Your Trustera user profile could not be found.',
          )
        }

        if (!data.company_id) {
          throw new Error(
            'Your user profile is not assigned to a company.',
          )
        }

        if (isMounted) {
          setLocalProfile(data)
        }
      } catch (error) {
        console.error(
          'Unable to load profile:',
          error,
        )

        if (isMounted) {
          setLocalProfile(null)

          toast.error(
            error?.message ||
              'Unable to load your user profile.',
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

  function resetForm() {
    setFormData(INITIAL_FORM)
  }

  function requireCompanyId() {
    if (!companyId) {
      throw new Error(
        'Your profile is not assigned to a company.',
      )
    }

    return companyId
  }

  async function getAuthenticatedUser() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      throw error
    }

    if (!user) {
      throw new Error(
        'Your session has expired. Sign in again.',
      )
    }

    return user
  }

  async function createAuditLog({
    action,
    entityId,
    entityName,
    details,
  }) {
    const currentCompanyId =
      requireCompanyId()

    const user = await getAuthenticatedUser()

    const auditRecord = {
      company_id: currentCompanyId,
      user_id: user.id,
      user_email:
        user.email ||
        activeProfile?.email ||
        null,
      action,
      entity_type: 'worker',
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

    if (!canAddWorker) {
      toast.error(
        'Your role does not allow you to add workers.',
      )
      return
    }

    let currentCompanyId

    try {
      currentCompanyId = requireCompanyId()
    } catch (error) {
      toast.error(error.message)
      return
    }

    const fullName =
      formData.fullName.trim()

    const workerRole =
      formData.role.trim()

    const workerSite =
      formData.site.trim()

    const workerStatus =
      String(formData.status || '')
        .trim()
        .toLowerCase()

    if (!fullName) {
      toast.error(
        'Enter the worker’s full name.',
      )
      return
    }

    if (!workerRole) {
      toast.error(
        'Enter the worker’s role.',
      )
      return
    }

    if (!workerSite) {
      toast.error(
        'Enter the worker’s site.',
      )
      return
    }

    if (
      !['active', 'inactive'].includes(
        workerStatus,
      )
    ) {
      toast.error(
        'Select a valid worker status.',
      )
      return
    }

    try {
      setSubmitting(true)

      const authenticatedUser =
        await getAuthenticatedUser()

      if (
        activeProfile?.id &&
        authenticatedUser.id !== activeProfile.id
      ) {
        throw new Error(
          'The signed-in account does not match the loaded user profile.',
        )
      }

      const workerRecord = {
        company_id: currentCompanyId,
        full_name: fullName,
        role: workerRole,
        site: workerSite,
        status: workerStatus,
      }

      const {
        data: worker,
        error: workerError,
      } = await supabase
        .from('workers')
        .insert([workerRecord])
        .select(`
          id,
          company_id,
          full_name,
          role,
          site,
          status,
          created_at
        `)
        .maybeSingle()

      if (workerError) {
        throw workerError
      }

      if (!worker) {
        throw new Error(
          'The worker record could not be created.',
        )
      }

      if (
        worker.company_id !== currentCompanyId
      ) {
        throw new Error(
          'The created worker was not assigned to the correct company.',
        )
      }

      try {
        await createAuditLog({
          action: 'worker_created',
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
        console.error(
          'Worker created, but audit logging failed:',
          auditError,
        )

        toast.error(
          'Worker was added, but the audit entry could not be recorded.',
        )
      }

      resetForm()

      toast.success(
        'Worker added successfully.',
      )
    } catch (error) {
      console.error(
        'Unable to add worker:',
        error,
      )

      let message =
        error?.message ||
        'Unable to add the worker. Please try again.'

      if (
        error?.code === '42501' ||
        message
          .toLowerCase()
          .includes('row-level security')
      ) {
        message =
          'Your account is not permitted to add workers for this company.'
      }

      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (profileLoading) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.heading}>
            Add Worker
          </h1>

          <div style={styles.loadingPanel}>
            Loading your profile...
          </div>
        </section>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.heading}>
              Add Worker
            </h1>

            <p style={styles.description}>
              Create a worker record for your
              organisation.
            </p>
          </div>

          {companyId && (
            <span style={styles.companyBadge}>
              Company assigned
            </span>
          )}
        </div>

        {!activeProfile && (
          <div style={styles.errorNotice}>
            Your user profile could not be loaded.
            Sign out and sign in again before trying
            to add a worker.
          </div>
        )}

        {activeProfile && !companyId && (
          <div style={styles.errorNotice}>
            Your profile is not assigned to a
            company. A company must be assigned
            before workers can be created.
          </div>
        )}

        {activeProfile &&
          companyId &&
          !canAddWorker && (
            <div style={styles.warningNotice}>
              You are signed in as{' '}
              <strong>
                {activeProfile.role || 'staff'}
              </strong>
              . Your role does not allow you to add
              workers.
            </div>
          )}

        {canAddWorker && companyId && (
          <form
            onSubmit={handleSubmit}
            style={styles.form}
          >
            <div style={styles.field}>
              <label
                htmlFor="fullName"
                style={styles.label}
              >
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
              <label
                htmlFor="role"
                style={styles.label}
              >
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
              <label
                htmlFor="site"
                style={styles.label}
              >
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
              <label
                htmlFor="status"
                style={styles.label}
              >
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
                <option value="active">
                  Active
                </option>

                <option value="inactive">
                  Inactive
                </option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...styles.button,
                ...(!canSubmit
                  ? styles.disabledButton
                  : {}),
              }}
            >
              {submitting
                ? 'Adding worker...'
                : 'Add Worker'}
            </button>

            <Link
              to="/workers"
              style={styles.backLink}
            >
              Return to workers
            </Link>
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
    boxSizing: 'border-box',
  },

  card: {
    width: '100%',
    maxWidth: '640px',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
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

  loadingPanel: {
    marginTop: '24px',
    padding: '20px',
    borderRadius: '10px',
    background: '#0f172a',
    border: '1px solid #334155',
    color: '#94a3b8',
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

  backLink: {
    display: 'block',
    marginTop: '18px',
    color: '#60a5fa',
    textDecoration: 'none',
    textAlign: 'center',
    fontWeight: 600,
  },
}