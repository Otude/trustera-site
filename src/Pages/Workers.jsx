import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Workers({ profile }) {
  const [workers, setWorkers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  const [editingWorker, setEditingWorker] = useState(null)
  const [editFullName, setEditFullName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editSite, setEditSite] = useState('')
  const [editStatus, setEditStatus] = useState('active')

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    fetchWorkers()
  }, [])

  async function fetchWorkers() {
    const { data, error } = await supabase
      .from('workers')
      .select('id, full_name, role, site, status, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setWorkers(data || [])
  }

  function startEdit(worker) {
    if (!isAdmin) {
      alert('Only admins can edit workers.')
      return
    }

    setEditingWorker(worker)
    setEditFullName(worker.full_name || '')
    setEditRole(worker.role || '')
    setEditSite(worker.site || '')
    setEditStatus(worker.status || 'active')
  }

  async function saveEdit(e) {
    e.preventDefault()

    if (!isAdmin) {
      alert('Only admins can edit workers.')
      return
    }

    const { error } = await supabase
      .from('workers')
      .update({
        full_name: editFullName,
        role: editRole,
        site: editSite,
        status: editStatus,
      })
      .eq('id', editingWorker.id)

    if (error) {
      alert(error.message)
      return
    }

    alert('Worker updated successfully')

    setEditingWorker(null)
    setEditFullName('')
    setEditRole('')
    setEditSite('')
    setEditStatus('active')

    fetchWorkers()
  }

  async function deleteWorker(id) {
    if (!isAdmin) {
      alert('Only admins can delete workers.')
      return
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this worker?'
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    alert('Worker deleted successfully')
    fetchWorkers()
  }

  const filteredWorkers = workers.filter((worker) => {
    const search = searchTerm.toLowerCase()

    return (
      worker.full_name?.toLowerCase().includes(search) ||
      worker.role?.toLowerCase().includes(search) ||
      worker.site?.toLowerCase().includes(search) ||
      worker.status?.toLowerCase().includes(search)
    )
  })

  return (
    <div style={styles.page}>
      <h1>Workers</h1>

      {!isAdmin && (
        <div style={styles.notice}>
          You are signed in as <strong>{profile?.role || 'staff'}</strong>. You
          can view workers, but only admins can edit or delete them.
        </div>
      )}

      <input
        type="text"
        placeholder="Search workers..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={styles.search}
      />

      {filteredWorkers.length === 0 ? (
        <p style={styles.emptyText}>No workers found.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Site</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Profile</th>
              {isAdmin && <th style={styles.th}>Action</th>}
            </tr>
          </thead>

          <tbody>
            {filteredWorkers.map((worker) => (
              <tr key={worker.id}>
                <td style={styles.td}>{worker.full_name || '-'}</td>
                <td style={styles.td}>{worker.role || '-'}</td>
                <td style={styles.td}>{worker.site || '-'}</td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.badge,
                      ...(worker.status === 'active'
                        ? styles.activeBadge
                        : styles.inactiveBadge),
                    }}
                  >
                    {worker.status || 'unknown'}
                  </span>
                </td>

                <td style={styles.td}>
                  <Link to={`/workers/${worker.id}`} style={styles.linkButton}>
                    View
                  </Link>
                </td>

                {isAdmin && (
                  <td style={styles.td}>
                    <button
                      onClick={() => startEdit(worker)}
                      style={styles.editButton}
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteWorker(worker.id)}
                      style={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingWorker && isAdmin && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2>Edit Worker</h2>

            <form onSubmit={saveEdit}>
              <input
                type="text"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                required
                style={styles.input}
              />

              <input
                type="text"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                required
                style={styles.input}
              />

              <input
                type="text"
                value={editSite}
                onChange={(e) => setEditSite(e.target.value)}
                required
                style={styles.input}
              />

              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                required
                style={styles.input}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <div style={styles.modalButtons}>
                <button type="submit" style={styles.button}>
                  Save Changes
                </button>

                <button
                  type="button"
                  onClick={() => setEditingWorker(null)}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    padding: '40px',
    color: 'white',
    background: '#020617',
    minHeight: '100vh',
  },

  notice: {
    marginTop: '20px',
    marginBottom: '20px',
    background: '#78350f',
    color: '#fde68a',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #92400e',
    maxWidth: '700px',
  },

  search: {
    width: '100%',
    maxWidth: '500px',
    padding: '14px',
    marginTop: '20px',
    marginBottom: '30px',
    background: '#1e293b',
    border: '1px solid #334155',
    color: 'white',
    borderRadius: '8px',
  },

  emptyText: {
    color: '#94a3b8',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },

  th: {
    border: '1px solid #334155',
    padding: '12px',
    background: '#0f172a',
    textAlign: 'left',
  },

  td: {
    border: '1px solid #334155',
    padding: '12px',
  },

  badge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
  },

  activeBadge: {
    background: '#064e3b',
    color: '#bbf7d0',
  },

  inactiveBadge: {
    background: '#7f1d1d',
    color: '#fecaca',
  },

  linkButton: {
    color: '#60a5fa',
    textDecoration: 'none',
    fontWeight: 'bold',
  },

  editButton: {
    background: '#2563eb',
    border: 'none',
    color: 'white',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginRight: '10px',
  },

  deleteButton: {
    background: '#dc2626',
    border: 'none',
    color: 'white',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
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

  cancelButton: {
    width: '100%',
    padding: '14px',
    background: '#475569',
    border: 'none',
    color: 'white',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modal: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '30px',
    width: '420px',
  },

  modalButtons: {
    display: 'flex',
    gap: '12px',
  },
}