import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

export default function Documents() {
  const [documents, setDocuments] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedWorker, setSelectedWorker] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [file, setFile] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [editingDoc, setEditingDoc] = useState(null)
  const [editDocumentType, setEditDocumentType] = useState('')
  const [editExpiryDate, setEditExpiryDate] = useState('')
  const [editFile, setEditFile] = useState(null)

  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    fetchWorkers()
    fetchDocuments()
  }, [])

  function calculateStatus(date) {
    const today = new Date()
    const expiry = new Date(date)

    today.setHours(0, 0, 0, 0)
    expiry.setHours(0, 0, 0, 0)

    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))

    if (daysLeft < 0) return 'expired'
    return 'valid'
  }

  function isExpiringSoon(date) {
    const today = new Date()
    const expiry = new Date(date)

    today.setHours(0, 0, 0, 0)
    expiry.setHours(0, 0, 0, 0)

    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))

    return daysLeft >= 0 && daysLeft <= 30
  }

  async function createAuditLog({
    companyId,
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
        company_id: companyId || null,
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

  async function fetchWorkers() {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .order('full_name')

    if (error) {
      toast.error(error.message)
      return
    }

    setWorkers(data || [])
  }

  async function fetchDocuments() {
    const { data, error } = await supabase
      .from('documents')
      .select(`
        *,
        workers (
          full_name,
          role,
          site
        )
      `)
      .order('expiry_date', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    const updatedDocs = (data || []).map((doc) => ({
      ...doc,
      status: calculateStatus(doc.expiry_date),
      expiringSoon: isExpiringSoon(doc.expiry_date),
    }))

    setDocuments(updatedDocs)
  }

  async function uploadDocument(e) {
    e.preventDefault()

    if (!selectedWorker || !documentType || !expiryDate || !file) {
      toast.error('Please complete all fields.')
      return
    }

    try {
      const selectedWorkerData = workers.find(
        (worker) => worker.id === selectedWorker
      )

      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `${selectedWorker}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: newDoc, error: dbError } = await supabase
        .from('documents')
        .insert([
          {
            worker_id: selectedWorker,
            company_id: selectedWorkerData?.company_id,
            document_type: documentType,
            expiry_date: expiryDate,
            file_path: filePath,
            status: calculateStatus(expiryDate),
          },
        ])
        .select()
        .single()

      if (dbError) throw dbError

      await createAuditLog({
        companyId: selectedWorkerData?.company_id,
        action: 'document_uploaded',
        entityType: 'document',
        entityId: newDoc.id,
        entityName: documentType,
        details: `${documentType} uploaded for ${
          selectedWorkerData?.full_name || 'Unknown worker'
        }. Expiry date: ${expiryDate}.`,
      })

      toast.success('Document uploaded successfully.')

      setSelectedWorker('')
      setDocumentType('')
      setExpiryDate('')
      setFile(null)

      fetchDocuments()
    } catch (error) {
      toast.error(error.message)
    }
  }

  function startEdit(doc) {
    setEditingDoc(doc)
    setEditDocumentType(doc.document_type || '')
    setEditExpiryDate(doc.expiry_date || '')
    setEditFile(null)
  }

  async function saveEdit(e) {
    e.preventDefault()

    if (!editingDoc) return

    try {
      let updatedFilePath = editingDoc.file_path
      const oldDocumentType = editingDoc.document_type
      const oldExpiryDate = editingDoc.expiry_date

      if (editFile) {
        const fileExt = editFile.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`
        const filePath = `${editingDoc.worker_id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, editFile)

        if (uploadError) throw uploadError

        if (editingDoc.file_path) {
          const { error: removeError } = await supabase.storage
            .from('documents')
            .remove([editingDoc.file_path])

          if (removeError) throw removeError
        }

        updatedFilePath = filePath
      }

      const { error } = await supabase
        .from('documents')
        .update({
          document_type: editDocumentType,
          expiry_date: editExpiryDate,
          status: calculateStatus(editExpiryDate),
          file_path: updatedFilePath,
        })
        .eq('id', editingDoc.id)

      if (error) throw error

      await createAuditLog({
        companyId: editingDoc.company_id,
        action: 'document_updated',
        entityType: 'document',
        entityId: editingDoc.id,
        entityName: editDocumentType,
        details: `Document updated from "${oldDocumentType}" / ${oldExpiryDate} to "${editDocumentType}" / ${editExpiryDate}.${
          editFile ? ' File was replaced.' : ''
        }`,
      })

      toast.success('Document updated successfully.')

      setEditingDoc(null)
      setEditDocumentType('')
      setEditExpiryDate('')
      setEditFile(null)

      fetchDocuments()
    } catch (error) {
      toast.error(error.message)
    }
  }

  async function openDocument(doc) {
    if (doc.file_path) {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_path, 300)

      if (error) {
        toast.error(error.message)
        return
      }

      setPreviewDoc(doc)
      setPreviewUrl(data.signedUrl)
      return
    }

    if (doc.file_url) {
      setPreviewDoc(doc)
      setPreviewUrl(doc.file_url)
      return
    }

    toast.error('No file found.')
  }

  function closePreview() {
    setPreviewDoc(null)
    setPreviewUrl('')
  }

  async function deleteDocument(doc) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this document?'
    )

    if (!confirmed) return

    try {
      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([doc.file_path])

        if (storageError) throw storageError
      }

      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id)

      if (dbError) throw dbError

      await createAuditLog({
        companyId: doc.company_id,
        action: 'document_deleted',
        entityType: 'document',
        entityId: doc.id,
        entityName: doc.document_type,
        details: `${doc.document_type} was deleted. Expiry date was ${doc.expiry_date}.`,
      })

      toast.success('Document deleted successfully.')
      fetchDocuments()
    } catch (error) {
      toast.error(error.message)
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

  const filteredDocuments = documents.filter((doc) => {
    const searchTerm = search.toLowerCase()

    const matchesSearch =
      doc.workers?.full_name?.toLowerCase().includes(searchTerm) ||
      doc.document_type?.toLowerCase().includes(searchTerm) ||
      doc.workers?.role?.toLowerCase().includes(searchTerm) ||
      doc.workers?.site?.toLowerCase().includes(searchTerm)

    const matchesStatus =
      statusFilter === 'all' || doc.status === statusFilter

    return matchesSearch && matchesStatus
  })

  return (
    <div style={styles.page}>
      <h2 style={styles.heading}>Documents</h2>

      <form onSubmit={uploadDocument} style={styles.form}>
        <select
          value={selectedWorker}
          onChange={(e) => setSelectedWorker(e.target.value)}
          style={styles.input}
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
          onChange={(e) => setDocumentType(e.target.value)}
          style={styles.input}
        />

        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          style={styles.input}
        />

        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          style={styles.input}
        />

        <button type="submit" style={styles.button}>
          Upload Document
        </button>
      </form>

      <div style={styles.tableSection}>
        <h2>Uploaded Documents</h2>

        <div style={styles.filterRow}>
          <input
            type="text"
            placeholder="Search by worker, document, role, or site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.search}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filter}
          >
            <option value="all">All Statuses</option>
            <option value="valid">Valid</option>
            <option value="expired">Expired</option>
          </select>
        </div>

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
              <th style={styles.th}>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredDocuments.map((doc) => (
              <tr key={doc.id}>
                <td style={styles.td}>{doc.workers?.full_name || '-'}</td>
                <td style={styles.td}>{doc.workers?.role || '-'}</td>
                <td style={styles.td}>{doc.workers?.site || '-'}</td>
                <td style={styles.td}>{doc.document_type}</td>
                <td style={styles.td}>{doc.expiry_date}</td>

                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.badge,
                      ...getStatusStyle(doc.status),
                    }}
                  >
                    {doc.status}
                  </span>
                </td>

                <td style={styles.td}>
                  {doc.expiringSoon ? (
                    <span style={styles.warningBadge}>expiring soon</span>
                  ) : (
                    '-'
                  )}
                </td>

                <td style={styles.td}>
                  <button
                    onClick={() => openDocument(doc)}
                    style={styles.linkButton}
                  >
                    View
                  </button>
                </td>

                <td style={styles.td}>
                  <button
                    onClick={() => startEdit(doc)}
                    style={styles.editButton}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteDocument(doc)}
                    style={styles.deleteButton}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingDoc && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2>Edit Document</h2>

            <form onSubmit={saveEdit}>
              <input
                type="text"
                value={editDocumentType}
                onChange={(e) => setEditDocumentType(e.target.value)}
                placeholder="Document Type"
                required
                style={styles.input}
              />

              <input
                type="date"
                value={editExpiryDate}
                onChange={(e) => setEditExpiryDate(e.target.value)}
                required
                style={styles.input}
              />

              <input
                type="file"
                onChange={(e) => setEditFile(e.target.files[0])}
                style={styles.input}
              />

              <p style={styles.helperText}>
                Leave file empty if you only want to update document type or
                expiry date.
              </p>

              <div style={styles.modalButtons}>
                <button type="submit" style={styles.button}>
                  Save Changes
                </button>

                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  style={styles.cancelButton}
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

              <button onClick={closePreview} style={styles.closeButton}>
                Close
              </button>
            </div>

            <iframe
              src={previewUrl}
              title="Document Preview"
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
    color: 'white',
  },

  heading: {
    marginBottom: '20px',
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '500px',
    marginBottom: '50px',
  },

  input: {
    padding: '16px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
  },

  button: {
    padding: '16px',
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
    flex: 1,
  },

  cancelButton: {
    padding: '16px',
    border: 'none',
    borderRadius: '10px',
    background: '#475569',
    color: 'white',
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
  },

  search: {
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
  },

  filter: {
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },

  th: {
    padding: '14px',
    border: '1px solid #334155',
    background: '#0f172a',
    textAlign: 'left',
  },

  td: {
    padding: '14px',
    border: '1px solid #334155',
  },

  badge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
  },

  warningBadge: {
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

  editButton: {
    background: '#2563eb',
    border: 'none',
    color: 'white',
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginRight: '10px',
  },

  deleteButton: {
    background: '#dc2626',
    border: 'none',
    color: 'white',
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  helperText: {
    color: '#94a3b8',
    fontSize: '13px',
    marginTop: '-10px',
    marginBottom: '16px',
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
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

  previewOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },

  previewModal: {
    width: '90%',
    height: '90%',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '14px',
    padding: '20px',
  },

  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    background: 'white',
  },

  closeButton: {
    background: '#dc2626',
    border: 'none',
    color: 'white',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}