import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'
import { can } from '../utils/permissions'

export default function Workers({ profile }) {
  const [workers, setWorkers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [editingWorker, setEditingWorker] =
    useState(null)
  const [editFullName, setEditFullName] =
    useState('')
  const [editRole, setEditRole] = useState('')
  const [editSite, setEditSite] = useState('')
  const [editStatus, setEditStatus] =
    useState('active')

  const [savingEdit, setSavingEdit] =
    useState(false)
  const [deletingId, setDeletingId] =
    useState(null)

  const companyId = profile?.company_id || null

  const normalisedRole = String(
    profile?.role || '',
  ).toLowerCase()

  /*
   * Granular permissions are preferred.
   *
   * The legacy manageWorkers permission is retained as a
   * fallback so the page continues to work while permissions.js
   * is being migrated.
   *
   * Under the legacy fallback:
   * - admin can add, edit and delete
   * - manager/compliance officer can add and edit
   * - other roles remain read-only
   */
  const legacyCanManageWorkers = can(
    profile,
    'manageWorkers',
  )

  const canAddWorker =
    can(profile, 'addWorkers') ||
    legacyCanManageWorkers

  const canEditWorker =
    can(profile, 'editWorkers') ||
    legacyCanManageWorkers

  const canDeleteWorker =
    can(profile, 'deleteWorkers') ||
    (legacyCanManageWorkers &&
      normalisedRole === 'admin')

  const fetchWorkers = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!companyId) {
        setWorkers([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (showLoading) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const { data, error } = await supabase
          .from('workers')
          .select(`
            id,
            company_id,
            full_name,
            role,
            site,
            status,
            created_at
          `)
          .eq('company_id', companyId)
          .order('created_at', {
            ascending: false,
          })

        if (error) {
          throw error
        }

        setWorkers(
          (data || []).filter(
            (worker) =>
              worker.company_id === companyId,
          ),
        )
      } catch (error) {
        console.error(
          'Unable to load workers:',
          error,
        )

        toast.error(
          error?.message ||
            'Unable to load workers.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [companyId],
  )

  useEffect(() => {
    fetchWorkers()
  }, [fetchWorkers])

  function requireCompanyId() {
    if (!companyId) {
      throw new Error(
        'Your profile is not assigned to a company.',
      )
    }

    return companyId
  }

  async function createAuditLog({
    action,
    entityId,
    entityName,
    details,
  }) {
    const currentCompanyId = requireCompanyId()

    if (!profile?.id) {
      throw new Error(
        'Your authenticated profile could not be identified.',
      )
    }

    const auditRecord = {
      company_id: currentCompanyId,
      user_id: profile.id,
      user_email: profile.email || null,
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

  function resetEditForm() {
    setEditingWorker(null)
    setEditFullName('')
    setEditRole('')
    setEditSite('')
    setEditStatus('active')
  }

  function startEdit(worker) {
    if (!canEditWorker) {
      toast.error(
        'Your role does not allow worker editing.',
      )
      return
    }

    if (worker.company_id !== companyId) {
      toast.error(
        'You cannot edit another company’s worker.',
      )
      return
    }

    setEditingWorker(worker)
    setEditFullName(worker.full_name || '')
    setEditRole(worker.role || '')
    setEditSite(worker.site || '')
    setEditStatus(worker.status || 'active')
  }

  function closeEditModal() {
    if (savingEdit) {
      return
    }

    resetEditForm()
  }

  async function saveEdit(event) {
    event.preventDefault()

    if (!canEditWorker) {
      toast.error(
        'Your role does not allow worker editing.',
      )
      return
    }

    if (!editingWorker || savingEdit) {
      return
    }

    try {
      const currentCompanyId =
        requireCompanyId()

      const trimmedFullName =
        editFullName.trim()
      const trimmedRole = editRole.trim()
      const trimmedSite = editSite.trim()

      if (
        editingWorker.company_id !==
        currentCompanyId
      ) {
        throw new Error(
          'You cannot edit another company’s worker.',
        )
      }

      if (!trimmedFullName) {
        throw new Error(
          'Worker name is required.',
        )
      }

      if (!trimmedRole) {
        throw new Error(
          'Worker role is required.',
        )
      }

      if (!trimmedSite) {
        throw new Error(
          'Worker site is required.',
        )
      }

      if (
        !['active', 'inactive'].includes(
          editStatus,
        )
      ) {
        throw new Error(
          'Select a valid worker status.',
        )
      }

      setSavingEdit(true)

      const previousWorker = {
        full_name: editingWorker.full_name,
        role: editingWorker.role,
        site: editingWorker.site,
        status: editingWorker.status,
      }

      const {
        data: updatedWorker,
        error,
      } = await supabase
        .from('workers')
        .update({
          full_name: trimmedFullName,
          role: trimmedRole,
          site: trimmedSite,
          status: editStatus,
        })
        .eq('id', editingWorker.id)
        .eq('company_id', currentCompanyId)
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

      if (error) {
        throw error
      }

      if (!updatedWorker) {
        throw new Error(
          'The worker could not be updated. The record may no longer exist or you may not have permission.',
        )
      }

      setWorkers((current) =>
        current.map((worker) =>
          worker.id === updatedWorker.id
            ? updatedWorker
            : worker,
        ),
      )

      try {
        await createAuditLog({
          action: 'worker_updated',
          entityId: updatedWorker.id,
          entityName:
            updatedWorker.full_name,
          details: {
            previous: previousWorker,
            updated: {
              full_name:
                updatedWorker.full_name,
              role: updatedWorker.role,
              site: updatedWorker.site,
              status: updatedWorker.status,
            },
          },
        })
      } catch (auditError) {
        console.error(
          'Worker updated, but audit log creation failed:',
          auditError,
        )

        toast.error(
          'Worker updated, but the audit entry could not be recorded.',
        )
      }

      toast.success(
        'Worker updated successfully.',
      )

      resetEditForm()
    } catch (error) {
      console.error(
        'Unable to update worker:',
        error,
      )

      toast.error(
        error?.message ||
          'Unable to update the worker.',
      )
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteWorker(worker) {
    if (!canDeleteWorker) {
      toast.error(
        'Your role does not allow worker deletion.',
      )
      return
    }

    if (deletingId) {
      return
    }

    if (worker.company_id !== companyId) {
      toast.error(
        'You cannot delete another company’s worker.',
      )
      return
    }

    const workerName =
      worker.full_name || 'this worker'

    const confirmed = window.confirm(
      `Are you sure you want to delete ${workerName}?`,
    )

    if (!confirmed) {
      return
    }

    try {
      const currentCompanyId =
        requireCompanyId()

      setDeletingId(worker.id)

      /*
       * Supabase may reject this operation when documents
       * reference the worker through a restrictive foreign key.
       * Those documents must then be removed first or the foreign
       * key must be configured with an appropriate cascade rule.
       */
      const {
        data: deletedWorker,
        error,
      } = await supabase
        .from('workers')
        .delete()
        .eq('id', worker.id)
        .eq('company_id', currentCompanyId)
        .select(`
          id,
          company_id,
          full_name,
          role,
          site,
          status
        `)
        .maybeSingle()

      if (error) {
        throw error
      }

      if (!deletedWorker) {
        throw new Error(
          'The worker could not be deleted. The record may no longer exist or you may not have permission.',
        )
      }

      setWorkers((current) =>
        current.filter(
          (item) =>
            item.id !== deletedWorker.id,
        ),
      )

      try {
        await createAuditLog({
          action: 'worker_deleted',
          entityId: deletedWorker.id,
          entityName:
            deletedWorker.full_name,
          details: {
            role: deletedWorker.role,
            site: deletedWorker.site,
            status: deletedWorker.status,
          },
        })
      } catch (auditError) {
        console.error(
          'Worker deleted, but audit log creation failed:',
          auditError,
        )

        toast.error(
          'Worker deleted, but the audit entry could not be recorded.',
        )
      }

      toast.success(
        'Worker deleted successfully.',
      )
    } catch (error) {
      console.error(
        'Unable to delete worker:',
        error,
      )

      let message =
        error?.message ||
        'Unable to delete the worker.'

      if (
        error?.code === '23503' ||
        message
          .toLowerCase()
          .includes('foreign key')
      ) {
        message =
          'This worker cannot be deleted because documents or other records are still linked to them.'
      }

      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  const filteredWorkers = useMemo(() => {
    const search = searchTerm
      .trim()
      .toLowerCase()

    return workers.filter((worker) => {
      if (!search) {
        return true
      }

      return (
        String(worker.full_name || '')
          .toLowerCase()
          .includes(search) ||
        String(worker.role || '')
          .toLowerCase()
          .includes(search) ||
        String(worker.site || '')
          .toLowerCase()
          .includes(search) ||
        String(worker.status || '')
          .toLowerCase()
          .includes(search)
      )
    })
  }, [searchTerm, workers])

  const showActionColumn =
    canEditWorker || canDeleteWorker

  if (!companyId) {
    return (
      <div style={styles.page}>
        <div style={styles.errorPanel}>
          Your account is not assigned to a
          company. Sign out and contact an
          administrator.
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.pageTitle}>
            Workers
          </h1>

          <p style={styles.subText}>
            View and manage workers belonging
            to your organisation.
          </p>
        </div>

        <div style={styles.headerActions}>
          {canAddWorker && (
            <Link
              to="/add-worker"
              style={styles.addWorkerButton}
            >
              Add Worker
            </Link>
          )}

          <button
            type="button"
            onClick={() =>
              fetchWorkers({
                showLoading: false,
              })
            }
            style={{
              ...styles.refreshButton,
              ...(refreshing
                ? styles.disabledButton
                : {}),
            }}
            disabled={refreshing}
          >
            {refreshing
              ? 'Refreshing...'
              : 'Refresh'}
          </button>
        </div>
      </div>

      {!canAddWorker &&
        !canEditWorker &&
        !canDeleteWorker && (
          <div style={styles.notice}>
            You are signed in as{' '}
            <strong>
              {profile?.role || 'staff'}
            </strong>
            . Your role can view worker
            records but cannot add, edit or
            delete them.
          </div>
        )}

      {(canAddWorker || canEditWorker) &&
        !canDeleteWorker && (
          <div style={styles.informationNotice}>
            You are signed in as{' '}
            <strong>
              {profile?.role || 'user'}
            </strong>
            . You can add and edit workers,
            but only administrators can delete
            worker records.
          </div>
        )}

      <input
        type="search"
        placeholder="Search workers..."
        value={searchTerm}
        onChange={(event) =>
          setSearchTerm(event.target.value)
        }
        style={styles.search}
        aria-label="Search workers"
      />

      {loading ? (
        <div style={styles.emptyState}>
          Loading workers...
        </div>
      ) : filteredWorkers.length === 0 ? (
        <div style={styles.emptyState}>
          {workers.length === 0
            ? 'No workers have been added yet.'
            : 'No workers match your search.'}
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>
                  Name
                </th>

                <th style={styles.th}>
                  Role
                </th>

                <th style={styles.th}>
                  Site
                </th>

                <th style={styles.th}>
                  Status
                </th>

                <th style={styles.th}>
                  Profile
                </th>

                {showActionColumn && (
                  <th style={styles.th}>
                    Action
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredWorkers.map(
                (worker) => {
                  const isDeleting =
                    deletingId === worker.id

                  const isActive =
                    String(
                      worker.status || '',
                    ).toLowerCase() ===
                    'active'

                  return (
                    <tr key={worker.id}>
                      <td style={styles.td}>
                        {worker.full_name ||
                          '-'}
                      </td>

                      <td style={styles.td}>
                        {worker.role || '-'}
                      </td>

                      <td style={styles.td}>
                        {worker.site || '-'}
                      </td>

                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...(isActive
                              ? styles.activeBadge
                              : styles.inactiveBadge),
                          }}
                        >
                          {worker.status ||
                            'unknown'}
                        </span>
                      </td>

                      <td style={styles.td}>
                        <Link
                          to={`/workers/${worker.id}`}
                          style={
                            styles.linkButton
                          }
                        >
                          View
                        </Link>
                      </td>

                      {showActionColumn && (
                        <td style={styles.td}>
                          <div
                            style={
                              styles.actionButtons
                            }
                          >
                            {canEditWorker && (
                              <button
                                type="button"
                                onClick={() =>
                                  startEdit(
                                    worker,
                                  )
                                }
                                style={
                                  styles.editButton
                                }
                                disabled={
                                  isDeleting
                                }
                              >
                                Edit
                              </button>
                            )}

                            {canDeleteWorker && (
                              <button
                                type="button"
                                onClick={() =>
                                  deleteWorker(
                                    worker,
                                  )
                                }
                                style={{
                                  ...styles.deleteButton,
                                  ...(isDeleting
                                    ? styles.disabledButton
                                    : {}),
                                }}
                                disabled={
                                  isDeleting
                                }
                              >
                                {isDeleting
                                  ? 'Deleting...'
                                  : 'Delete'}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                },
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingWorker && canEditWorker && (
        <div
          style={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeEditModal()
            }
          }}
        >
          <div
            style={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-worker-title"
          >
            <h2
              id="edit-worker-title"
              style={styles.modalTitle}
            >
              Edit Worker
            </h2>

            <form
              onSubmit={saveEdit}
              style={styles.modalForm}
            >
              <div>
                <label
                  htmlFor="edit-worker-name"
                  style={styles.label}
                >
                  Full name
                </label>

                <input
                  id="edit-worker-name"
                  type="text"
                  value={editFullName}
                  onChange={(event) =>
                    setEditFullName(
                      event.target.value,
                    )
                  }
                  required
                  disabled={savingEdit}
                  style={styles.input}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-worker-role"
                  style={styles.label}
                >
                  Role
                </label>

                <input
                  id="edit-worker-role"
                  type="text"
                  value={editRole}
                  onChange={(event) =>
                    setEditRole(
                      event.target.value,
                    )
                  }
                  required
                  disabled={savingEdit}
                  style={styles.input}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-worker-site"
                  style={styles.label}
                >
                  Site
                </label>

                <input
                  id="edit-worker-site"
                  type="text"
                  value={editSite}
                  onChange={(event) =>
                    setEditSite(
                      event.target.value,
                    )
                  }
                  required
                  disabled={savingEdit}
                  style={styles.input}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-worker-status"
                  style={styles.label}
                >
                  Status
                </label>

                <select
                  id="edit-worker-status"
                  value={editStatus}
                  onChange={(event) =>
                    setEditStatus(
                      event.target.value,
                    )
                  }
                  required
                  disabled={savingEdit}
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

              <div style={styles.modalButtons}>
                <button
                  type="submit"
                  style={{
                    ...styles.button,
                    ...(savingEdit
                      ? styles.disabledButton
                      : {}),
                  }}
                  disabled={savingEdit}
                >
                  {savingEdit
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>

                <button
                  type="button"
                  onClick={closeEditModal}
                  style={styles.cancelButton}
                  disabled={savingEdit}
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
    color: '#ffffff',
    background: '#020617',
    minHeight: '100vh',
    boxSizing: 'border-box',
  },

  pageTitle: {
    marginTop: 0,
    marginBottom: '6px',
  },

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '24px',
  },

  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },

  subText: {
    color: '#94a3b8',
    margin: 0,
  },

  addWorkerButton: {
    display: 'inline-block',
    padding: '12px 16px',
    borderRadius: '8px',
    background: '#2563eb',
    color: '#ffffff',
    textDecoration: 'none',
    fontWeight: 'bold',
  },

  refreshButton: {
    padding: '12px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#475569',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  notice: {
    marginBottom: '20px',
    background: '#78350f',
    color: '#fde68a',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #92400e',
    maxWidth: '760px',
  },

  informationNotice: {
    marginBottom: '20px',
    background: '#172554',
    color: '#bfdbfe',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #1d4ed8',
    maxWidth: '760px',
  },

  search: {
    width: '100%',
    maxWidth: '500px',
    boxSizing: 'border-box',
    padding: '14px',
    marginBottom: '30px',
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#ffffff',
    borderRadius: '8px',
  },

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '820px',
    borderCollapse: 'collapse',
  },

  th: {
    border: '1px solid #334155',
    padding: '12px',
    background: '#0f172a',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },

  td: {
    border: '1px solid #334155',
    padding: '12px',
    verticalAlign: 'middle',
  },

  badge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'capitalize',
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

  actionButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },

  editButton: {
    background: '#2563eb',
    border: 'none',
    color: '#ffffff',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  deleteButton: {
    background: '#dc2626',
    border: 'none',
    color: '#ffffff',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.65,
  },

  emptyState: {
    padding: '28px',
    border: '1px solid #334155',
    borderRadius: '12px',
    background: '#0f172a',
    color: '#94a3b8',
    textAlign: 'center',
  },

  errorPanel: {
    maxWidth: '640px',
    margin: '80px auto',
    padding: '24px',
    border: '1px solid #7f1d1d',
    borderRadius: '12px',
    background: '#450a0a',
    color: '#fecaca',
    textAlign: 'center',
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    padding: '20px',
    background: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },

  modal: {
    width: '100%',
    maxWidth: '440px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '30px',
  },

  modalTitle: {
    marginTop: 0,
  },

  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },

  label: {
    display: 'block',
    marginBottom: '8px',
    color: '#cbd5e1',
    fontSize: '14px',
    fontWeight: 600,
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px',
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#ffffff',
    borderRadius: '8px',
  },

  button: {
    width: '100%',
    padding: '14px',
    background: '#2563eb',
    border: 'none',
    color: '#ffffff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  cancelButton: {
    width: '100%',
    padding: '14px',
    background: '#475569',
    border: 'none',
    color: '#ffffff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  modalButtons: {
    display: 'flex',
    gap: '12px',
  },
}