import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'
import { can } from '../utils/permissions'

const DOCUMENTS_BUCKET = 'documents'
const EXPIRY_WARNING_DAYS = 30

export default function Documents({ profile }) {
  const [documents, setDocuments] = useState([])
  const [workers, setWorkers] = useState([])

  const [selectedWorker, setSelectedWorker] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [file, setFile] = useState(null)
  const fileInputRef = useRef(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [editingDoc, setEditingDoc] = useState(null)
  const [editDocumentType, setEditDocumentType] = useState('')
  const [editExpiryDate, setEditExpiryDate] = useState('')
  const [editFile, setEditFile] = useState(null)

  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const companyId = profile?.company_id || null
  const canManageDocuments = can(
    profile,
    'manageDocuments',
  )

  const fetchWorkers = useCallback(async () => {
    if (!companyId) {
      setWorkers([])
      return
    }

    const { data, error } = await supabase
      .from('workers')
      .select('id, company_id, full_name, role, site, status')
      .eq('company_id', companyId)
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Unable to load workers:', error)
      toast.error(error.message || 'Unable to load workers.')
      return
    }

    setWorkers(data || [])
  }, [companyId])

  const fetchDocuments = useCallback(async () => {
    if (!companyId) {
      setDocuments([])
      return
    }

    const { data, error } = await supabase
      .from('documents')
      .select(`
        id,
        company_id,
        worker_id,
        document_type,
        expiry_date,
        status,
        file_path,
        file_url,
        created_at,
        workers (
          id,
          company_id,
          full_name,
          role,
          site
        )
      `)
      .eq('company_id', companyId)
      .order('expiry_date', { ascending: true })

    if (error) {
      console.error('Unable to load documents:', error)
      toast.error(error.message || 'Unable to load documents.')
      return
    }

    const normalisedDocuments = (data || []).map((document) => {
      const status = calculateStatus(document.expiry_date)

      return {
        ...document,
        status,
        expiringSoon: isExpiringSoon(document.expiry_date),
      }
    })

    setDocuments(normalisedDocuments)
  }, [companyId])

  useEffect(() => {
    let active = true

    async function loadPage() {
      if (!companyId) {
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        await Promise.all([fetchWorkers(), fetchDocuments()])
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadPage()

    return () => {
      active = false
    }
  }, [companyId, fetchWorkers, fetchDocuments])

  function requireCompanyId() {
    if (!companyId) {
      throw new Error('Your profile is not assigned to a company.')
    }

    return companyId
  }

  function calculateStatus(date) {
    if (!date) return 'valid'

    const daysLeft = getDaysUntilExpiry(date)

    return daysLeft < 0 ? 'expired' : 'valid'
  }

  function isExpiringSoon(date) {
    if (!date) return false

    const daysLeft = getDaysUntilExpiry(date)

    return daysLeft >= 0 && daysLeft <= EXPIRY_WARNING_DAYS
  }

  function getDaysUntilExpiry(date) {
    const today = new Date()
    const expiry = new Date(`${date}T00:00:00`)

    today.setHours(0, 0, 0, 0)
    expiry.setHours(0, 0, 0, 0)

    return Math.ceil(
      (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    )
  }

  function sanitiseFileName(fileName) {
    return fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
  }

  function createStoragePath({ workerId, selectedFile }) {
    const safeName = sanitiseFileName(selectedFile.name)
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`

    return `${companyId}/${workerId}/${uniqueName}`
  }

  async function createAuditLog({
    action,
    entityType,
    entityId,
    entityName,
    details,
  }) {
    const currentCompanyId = requireCompanyId()

    if (!profile?.id) {
      throw new Error('Your user profile could not be identified.')
    }

    const auditRecord = {
      company_id: currentCompanyId,
      user_id: profile.id,
      user_email: profile.email || null,
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
      console.error('Unable to create audit log:', error)
      throw error
    }
  }

  async function uploadDocument(event) {
    event.preventDefault()

    if (!canManageDocuments) {
      toast.error(
        'Your role does not allow document uploads.',
      )
      return
    }

    if (submitting) return

    let uploadedFilePath = null

    try {
      const currentCompanyId = requireCompanyId()
      const trimmedDocumentType = documentType.trim()

      if (!selectedWorker) {
        throw new Error('Please select a worker.')
      }

      if (!trimmedDocumentType) {
        throw new Error('Please enter a document type.')
      }

      if (!expiryDate) {
        throw new Error('Please select an expiry date.')
      }

      if (!file) {
        throw new Error('Please select a file.')
      }

      const selectedWorkerData = workers.find(
        (worker) =>
          worker.id === selectedWorker &&
          worker.company_id === currentCompanyId,
      )

      if (!selectedWorkerData) {
        throw new Error(
          'The selected worker is invalid or belongs to another company.',
        )
      }

      setSubmitting(true)

      uploadedFilePath = createStoragePath({
        workerId: selectedWorkerData.id,
        selectedFile: file,
      })

      const { data: uploadData, error: uploadError } =
        await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .upload(uploadedFilePath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || undefined,
          })

      if (uploadError) {
        throw uploadError
      }

      const storedFilePath = uploadData?.path || uploadedFilePath

      if (!storedFilePath) {
        throw new Error('Supabase Storage did not return a file path.')
      }

      uploadedFilePath = storedFilePath

      const documentRecord = {
        company_id: currentCompanyId,
        worker_id: selectedWorkerData.id,
        document_type: trimmedDocumentType,
        expiry_date: expiryDate,
        file_path: storedFilePath,
        status: calculateStatus(expiryDate),
      }

      const { data: newDocument, error: insertError } = await supabase
        .from('documents')
        .insert([documentRecord])
        .select(
          'id, company_id, worker_id, document_type, expiry_date, status, file_path',
        )
        .single()

      if (insertError) {
        throw insertError
      }

      try {
        await createAuditLog({
          action: 'document_uploaded',
          entityType: 'document',
          entityId: newDocument.id,
          entityName: newDocument.document_type,
          details: {
            worker_id: selectedWorkerData.id,
            worker_name: selectedWorkerData.full_name,
            document_type: newDocument.document_type,
            expiry_date: newDocument.expiry_date,
            file_path: newDocument.file_path,
          },
        })
      } catch (auditError) {
        console.error(
          'Document was uploaded, but its audit log failed:',
          auditError,
        )

        toast.error(
          'Document uploaded, but the audit entry could not be recorded.',
        )
      }

      toast.success('Document uploaded successfully.')

      setSelectedWorker('')
      setDocumentType('')
      setExpiryDate('')
      setFile(null)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      await fetchDocuments()
    } catch (error) {
      console.error('Document upload failed:', error)

      if (uploadedFilePath) {
        const { error: cleanupError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .remove([uploadedFilePath])

        if (cleanupError) {
          console.error(
            'Unable to remove file after failed database insert:',
            cleanupError,
          )
        }
      }

      toast.error(error?.message || 'Unable to upload the document.')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(document) {
    if (!canManageDocuments) {
      toast.error(
        'Your role does not allow document editing.',
      )
      return
    }

    if (document.company_id !== companyId) {
      toast.error('You cannot edit another company’s document.')
      return
    }

    setEditingDoc(document)
    setEditDocumentType(document.document_type || '')
    setEditExpiryDate(document.expiry_date || '')
    setEditFile(null)
  }

  function closeEditModal() {
    if (savingEdit) return

    setEditingDoc(null)
    setEditDocumentType('')
    setEditExpiryDate('')
    setEditFile(null)
  }

  async function saveEdit(event) {
    event.preventDefault()

    if (!canManageDocuments) {
      toast.error(
        'Your role does not allow document editing.',
      )
      return
    }

    if (!editingDoc || savingEdit) return

    let replacementFilePath = null
    let databaseUpdated = false

    try {
      const currentCompanyId = requireCompanyId()
      const trimmedDocumentType = editDocumentType.trim()

      if (editingDoc.company_id !== currentCompanyId) {
        throw new Error('You cannot edit another company’s document.')
      }

      if (!trimmedDocumentType) {
        throw new Error('Document type is required.')
      }

      if (!editExpiryDate) {
        throw new Error('Expiry date is required.')
      }

      setSavingEdit(true)

      const previousDocumentType = editingDoc.document_type
      const previousExpiryDate = editingDoc.expiry_date
      const previousFilePath = editingDoc.file_path || null

      let nextFilePath = previousFilePath

      if (editFile) {
        replacementFilePath = createStoragePath({
          workerId: editingDoc.worker_id,
          selectedFile: editFile,
        })

        const { error: uploadError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .upload(replacementFilePath, editFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: editFile.type || undefined,
          })

        if (uploadError) {
          throw uploadError
        }

        nextFilePath = replacementFilePath
      }

      const updatePayload = {
        document_type: trimmedDocumentType,
        expiry_date: editExpiryDate,
        status: calculateStatus(editExpiryDate),
        file_path: nextFilePath,
      }

      const { data: updatedDocument, error: updateError } = await supabase
        .from('documents')
        .update(updatePayload)
        .eq('id', editingDoc.id)
        .eq('company_id', currentCompanyId)
        .select(
          'id, company_id, worker_id, document_type, expiry_date, status, file_path',
        )
        .single()

      if (updateError) {
        throw updateError
      }

      databaseUpdated = true

      if (
        editFile &&
        previousFilePath &&
        previousFilePath !== replacementFilePath
      ) {
        const { error: removeError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .remove([previousFilePath])

        if (removeError) {
          console.error(
            'Document updated, but old file removal failed:',
            removeError,
          )

          toast.error(
            'Document updated, but the previous file could not be removed.',
          )
        }
      }

      try {
        await createAuditLog({
          action: 'document_updated',
          entityType: 'document',
          entityId: updatedDocument.id,
          entityName: updatedDocument.document_type,
          details: {
            previous_document_type: previousDocumentType,
            new_document_type: updatedDocument.document_type,
            previous_expiry_date: previousExpiryDate,
            new_expiry_date: updatedDocument.expiry_date,
            file_replaced: Boolean(editFile),
          },
        })
      } catch (auditError) {
        console.error(
          'Document was updated, but its audit log failed:',
          auditError,
        )

        toast.error(
          'Document updated, but the audit entry could not be recorded.',
        )
      }

      toast.success('Document updated successfully.')

      closeEditModal()
      await fetchDocuments()
    } catch (error) {
      console.error('Document update failed:', error)

      if (replacementFilePath && !databaseUpdated) {
        const { error: cleanupError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .remove([replacementFilePath])

        if (cleanupError) {
          console.error(
            'Unable to remove replacement file after failed update:',
            cleanupError,
          )
        }
      }

      toast.error(error?.message || 'Unable to update the document.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function openDocument(document) {
    try {
      const currentCompanyId = requireCompanyId()

      if (document.company_id !== currentCompanyId) {
        throw new Error('You cannot access another company’s document.')
      }

      if (document.file_path) {
        const { data, error } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .createSignedUrl(document.file_path, 300)

        if (error) {
          throw error
        }

        if (!data?.signedUrl) {
          throw new Error('A secure preview link could not be generated.')
        }

        setPreviewDoc(document)
        setPreviewUrl(data.signedUrl)
        return
      }

      if (document.file_url) {
        setPreviewDoc(document)
        setPreviewUrl(document.file_url)
        return
      }

      throw new Error('No file was found for this document.')
    } catch (error) {
      console.error('Unable to open document:', error)
      toast.error(error?.message || 'Unable to open the document.')
    }
  }

  function closePreview() {
    setPreviewDoc(null)
    setPreviewUrl('')
  }

  async function deleteDocument(document) {
    if (!canManageDocuments) {
      toast.error(
        'Your role does not allow document deletion.',
      )
      return
    }

    if (deletingId) return

    const confirmed = window.confirm(
      `Delete "${document.document_type}" permanently?`,
    )

    if (!confirmed) return

    try {
      const currentCompanyId = requireCompanyId()

      if (document.company_id !== currentCompanyId) {
        throw new Error('You cannot delete another company’s document.')
      }

      setDeletingId(document.id)

      /*
       * Delete the database row first.
       *
       * This avoids deleting the file when RLS or another database rule blocks
       * the row deletion. After the row is deleted, the storage file is removed.
       */
      const { data: deletedDocument, error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id)
        .eq('company_id', currentCompanyId)
        .select(
          'id, company_id, worker_id, document_type, expiry_date, file_path',
        )
        .single()

      if (deleteError) {
        throw deleteError
      }

      if (deletedDocument.file_path) {
        const { error: storageError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .remove([deletedDocument.file_path])

        if (storageError) {
          console.error(
            'Database row deleted, but storage cleanup failed:',
            storageError,
          )

          toast.error(
            'Document record deleted, but its stored file could not be removed.',
          )
        }
      }

      try {
        await createAuditLog({
          action: 'document_deleted',
          entityType: 'document',
          entityId: deletedDocument.id,
          entityName: deletedDocument.document_type,
          details: {
            worker_id: deletedDocument.worker_id,
            document_type: deletedDocument.document_type,
            expiry_date: deletedDocument.expiry_date,
            file_path: deletedDocument.file_path,
          },
        })
      } catch (auditError) {
        console.error(
          'Document was deleted, but its audit log failed:',
          auditError,
        )

        toast.error(
          'Document deleted, but the audit entry could not be recorded.',
        )
      }

      toast.success('Document deleted successfully.')
      await fetchDocuments()
    } catch (error) {
      console.error('Document deletion failed:', error)
      toast.error(error?.message || 'Unable to delete the document.')
    } finally {
      setDeletingId(null)
    }
  }

  function getStatusStyle(status) {
    if (status === 'expired') {
      return {
        background: '#7f1d1d',
        color: '#fecaca',
      }
    }

    return {
      background: '#064e3b',
      color: '#bbf7d0',
    }
  }

  const filteredDocuments = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()

    return documents.filter((document) => {
      const matchesSearch =
        !searchTerm ||
        String(
          document.workers?.full_name || '',
        )
          .toLowerCase()
          .includes(searchTerm) ||
        String(document.document_type || '')
          .toLowerCase()
          .includes(searchTerm) ||
        String(document.workers?.role || '')
          .toLowerCase()
          .includes(searchTerm) ||
        String(document.workers?.site || '')
          .toLowerCase()
          .includes(searchTerm)

      const matchesStatus =
        statusFilter === 'all' || document.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [documents, search, statusFilter])

  if (!companyId) {
    return (
      <div style={styles.page}>
        <div style={styles.errorPanel}>
          Your account is not assigned to a company. Sign out and contact an
          administrator.
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <div>
          <h2 style={styles.heading}>Documents</h2>

          <p style={styles.subText}>
            View workforce documents, expiry dates and compliance
            status for your organisation.
          </p>
        </div>
      </div>

      {!canManageDocuments && (
        <div style={styles.permissionNotice}>
          You can view documents and open available files, but your
          role cannot upload, edit or delete document records.
        </div>
      )}

      {canManageDocuments && (
        <form onSubmit={uploadDocument} style={styles.form}>
        <select
          value={selectedWorker}
          onChange={(event) => setSelectedWorker(event.target.value)}
          style={styles.input}
          disabled={submitting}
          required
        >
          <option value="">Select Worker</option>

          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.full_name}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Document Type"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
          style={styles.input}
          disabled={submitting}
          required
        />

        <input
          type="date"
          value={expiryDate}
          onChange={(event) => setExpiryDate(event.target.value)}
          style={styles.input}
          disabled={submitting}
          required
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          style={styles.input}
          disabled={submitting}
          required
        />

        <button
          type="submit"
          style={{
            ...styles.button,
            ...(submitting ? styles.disabledButton : {}),
          }}
          disabled={submitting}
        >
          {submitting ? 'Uploading...' : 'Upload Document'}
        </button>
        </form>
      )}

      <div style={styles.tableSection}>
        <h2>Uploaded Documents</h2>

        <div style={styles.filterRow}>
          <input
            type="text"
            placeholder="Search by worker, document, role, or site..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={styles.search}
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={styles.filter}
          >
            <option value="all">All Statuses</option>
            <option value="valid">Valid</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {loading ? (
          <div style={styles.emptyState}>Loading documents...</div>
        ) : filteredDocuments.length === 0 ? (
          <div style={styles.emptyState}>
            No documents match the selected filters.
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Worker</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Site</th>
                  <th style={styles.th}>Document</th>
                  <th style={styles.th}>Expiry Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Warning</th>
                  <th style={styles.th}>File</th>
                  {canManageDocuments && (
                    <th style={styles.th}>Action</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredDocuments.map((document) => (
                  <tr key={document.id}>
                    <td style={styles.td}>
                      {document.workers?.full_name || '-'}
                    </td>

                    <td style={styles.td}>
                      {document.workers?.role || '-'}
                    </td>

                    <td style={styles.td}>
                      {document.workers?.site || '-'}
                    </td>

                    <td style={styles.td}>
                      {document.document_type}
                    </td>

                    <td style={styles.td}>
                      {document.expiry_date || '-'}
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...getStatusStyle(document.status),
                        }}
                      >
                        {document.status}
                      </span>
                    </td>

                    <td style={styles.td}>
                      {document.expiringSoon ? (
                        <span style={styles.warningBadge}>
                          expiring soon
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>

                    <td style={styles.td}>
                      <button
                        type="button"
                        onClick={() => openDocument(document)}
                        style={styles.linkButton}
                      >
                        View
                      </button>
                    </td>

                    {canManageDocuments && (
                      <td style={styles.td}>
                        <div style={styles.actionButtons}>
                          <button
                            type="button"
                            onClick={() => startEdit(document)}
                            style={styles.editButton}
                            disabled={deletingId === document.id}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteDocument(document)}
                            style={{
                              ...styles.deleteButton,
                              ...(deletingId === document.id
                                ? styles.disabledButton
                                : {}),
                            }}
                            disabled={deletingId === document.id}
                          >
                            {deletingId === document.id
                              ? 'Deleting...'
                              : 'Delete'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingDoc && canManageDocuments && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2>Edit Document</h2>

            <form onSubmit={saveEdit} style={styles.modalForm}>
              <input
                type="text"
                value={editDocumentType}
                onChange={(event) =>
                  setEditDocumentType(event.target.value)
                }
                placeholder="Document Type"
                required
                disabled={savingEdit}
                style={styles.input}
              />

              <input
                type="date"
                value={editExpiryDate}
                onChange={(event) =>
                  setEditExpiryDate(event.target.value)
                }
                required
                disabled={savingEdit}
                style={styles.input}
              />

              <input
                type="file"
                onChange={(event) =>
                  setEditFile(event.target.files?.[0] || null)
                }
                disabled={savingEdit}
                style={styles.input}
              />

              <p style={styles.helperText}>
                Leave the file field empty to keep the existing file.
              </p>

              <div style={styles.modalButtons}>
                <button
                  type="submit"
                  style={{
                    ...styles.button,
                    ...(savingEdit ? styles.disabledButton : {}),
                  }}
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
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

      {previewDoc && (
        <div style={styles.previewOverlay}>
          <div style={styles.previewModal}>
            <div style={styles.previewHeader}>
              <div>
                <h2 style={styles.previewTitle}>
                  {previewDoc.document_type || 'Document Preview'}
                </h2>

                <p style={styles.previewSubText}>
                  Expiry: {previewDoc.expiry_date || '-'}
                </p>
              </div>

              <button
                type="button"
                onClick={closePreview}
                style={styles.closeButton}
              >
                Close
              </button>
            </div>

            <iframe
              src={previewUrl}
              title={`${previewDoc.document_type || 'Document'} preview`}
              style={styles.previewFrame}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    padding: '32px',
    minHeight: '100vh',
    background: '#020617',
    color: '#ffffff',
  },

  pageHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '20px',
    marginBottom: '24px',
  },

  heading: {
    marginTop: 0,
    marginBottom: '6px',
  },

  subText: {
    margin: 0,
    color: '#94a3b8',
    lineHeight: 1.6,
  },

  permissionNotice: {
    maxWidth: '760px',
    marginBottom: '24px',
    padding: '14px 16px',
    border: '1px solid #92400e',
    borderRadius: '10px',
    background: '#78350f',
    color: '#fde68a',
    lineHeight: 1.5,
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '500px',
    marginBottom: '50px',
  },

  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '16px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
  },

  button: {
    padding: '16px',
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 'bold',
    cursor: 'pointer',
    flex: 1,
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.65,
  },

  cancelButton: {
    padding: '16px',
    border: 'none',
    borderRadius: '10px',
    background: '#475569',
    color: '#ffffff',
    fontWeight: 'bold',
    cursor: 'pointer',
    flex: 1,
  },

  tableSection: {
    marginTop: '30px',
  },

  filterRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },

  search: {
    minWidth: '260px',
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
  },

  filter: {
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
  },

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '1050px',
    borderCollapse: 'collapse',
  },

  th: {
    padding: '14px',
    border: '1px solid #334155',
    background: '#0f172a',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },

  td: {
    padding: '14px',
    border: '1px solid #334155',
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

  warningBadge: {
    display: 'inline-block',
    background: '#78350f',
    color: '#fde68a',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
  },

  linkButton: {
    background: 'transparent',
    border: 'none',
    color: '#60a5fa',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  actionButtons: {
    display: 'flex',
    gap: '10px',
  },

  editButton: {
    background: '#2563eb',
    border: 'none',
    color: '#ffffff',
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  deleteButton: {
    background: '#dc2626',
    border: 'none',
    color: '#ffffff',
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  helperText: {
    color: '#94a3b8',
    fontSize: '13px',
    marginTop: '-8px',
    marginBottom: 0,
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
    zIndex: 9998,
  },

  modal: {
    width: '100%',
    maxWidth: '440px',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '30px',
  },

  modalButtons: {
    display: 'flex',
    gap: '12px',
  },

  previewOverlay: {
    position: 'fixed',
    inset: 0,
    padding: '20px',
    background: 'rgba(0, 0, 0, 0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },

  previewModal: {
    width: '90%',
    height: '90%',
    boxSizing: 'border-box',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '14px',
    padding: '20px',
  },

  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '16px',
  },

  previewTitle: {
    margin: 0,
  },

  previewSubText: {
    color: '#94a3b8',
    marginTop: '6px',
    marginBottom: 0,
  },

  previewFrame: {
    width: '100%',
    height: 'calc(100% - 76px)',
    border: '1px solid #334155',
    borderRadius: '10px',
    background: '#ffffff',
  },

  closeButton: {
    background: '#dc2626',
    border: 'none',
    color: '#ffffff',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}