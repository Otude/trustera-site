import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

export default function AddWorker({ profile }) {
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [site, setSite] = useState('')
  const [status, setStatus] = useState('active')
  const [localProfile, setLocalProfile] = useState(null)

  const activeProfile = profile || localProfile
  const isAdmin = activeProfile?.role === 'admin'

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('profiles')
      .select('id, company_id, role')
      .eq('id', user.id)
      .single()

    if (!error) {
      setLocalProfile(data)
    }
  }

  async function createAuditLog({
    action,
    entityType,
    entityId,
    entityName,
    details,
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    await supabase.from('audit_logs').insert([
      {
        company_id: activeProfile?.company_id || null,
        user_id: user?.id || null,
        user_email: user?.email || null,
        action,
        entity_type: entityType,
        entity_id: entityId || null,
        entity_name: entityName || null,
        details,
      },
    ])
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!isAdmin) {
      toast.error('Only admins can add workers.')
      return
    }

    if (!activeProfile?.company_id) {
      toast.error('No company profile found for this user.')
      return
    }

    try {
      const { data, error } = await supabase
        .from('workers')
        .insert([
          {
            full_name: fullName,
            role,
            site,
            status,
            company_id: activeProfile.company_id,
          },
        ])
        .select()
        .single()

      if (error) throw error

      await createAuditLog({
        action: 'worker_created',
        entityType: 'worker',
        entityId: data.id,
        entityName: data.full_name,
        details: `Worker ${data.full_name} was added with role ${data.role}, site ${data.site}, and status ${data.status}.`,
      })

      toast.success('Worker added successfully.')

      setFullName('')
      setRole('')
      setSite('')
      setStatus('active')
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div style={styles.page}>
      <h1>Add Worker</h1>

      {!isAdmin && (
        <div style={styles.notice}>
          You are signed in as <strong>{activeProfile?.role || 'staff'}</strong>.
          Only admins can add workers.
        </div>
      )}

      {isAdmin && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            style={styles.input}
          />

          <input
            type="text"
            placeholder="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            style={styles.input}
          />

          <input
            type="text"
            placeholder="Site"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            required
            style={styles.input}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            required
            style={styles.input}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button type="submit" style={styles.button}>
            Add Worker
          </button>
        </form>
      )}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#020617',
    color: 'white',
    padding: '40px',
  },

  form: {
    maxWidth: '500px',
    marginTop: '20px',
  },

  notice: {
    maxWidth: '700px',
    marginTop: '20px',
    marginBottom: '20px',
    background: '#78350f',
    color: '#fde68a',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #92400e',
  },

  input: {
    width: '100%',
    padding: '14px',
    marginBottom: '20px',
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