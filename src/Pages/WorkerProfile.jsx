import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

export default function WorkerProfile({ profile }) {
  const { id } = useParams()

  const [worker, setWorker] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  const [documentType, setDocumentType] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [file, setFile] = useState(null)

  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    fetchWorkerProfile()
  }, [id])

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

  async function fetchWorkerProfile() {
    setLoading(true)

    const { data: workerData, error: workerError } = await supabase
      .from('workers')
      .select('*')
      .eq('id', id)
      .single()

    if (workerError) {
      toast.error(workerError.message)
      setLoading(false)
      return
    }

    const { data: docsData, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .eq('worker_id', id)
      .order('created_at', { ascending: false })

    if (docsError) {
      toast.error(docsError.message)
      setLoading(false)
      return
    }

    const updatedDocs = (docsData || []).map((doc) => ({
      ...doc,
      status: calculateStatus(doc.expiry_date),
      expiringSoon: isExpiringSoon(doc.expiry_date),
    }))

    setWorker(workerData)
    setDocuments(updatedDocs)
    setLoading(false)
  }

  async function uploadDocument(e) {
    e.preventDefault()

    if (!documentType || !expiryDate || !file) {
      toast.error('Please complete all upload fields.')
      return
    }

    if (!worker?.company_id) {
      toast.error('Worker company ID is missing.')
      return
    }

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `${id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: newDoc, error: dbError } = await supabase
        .from('documents')
        .insert([
          {
            worker_id: id,
            company_id: worker.company_id,
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
        companyId: worker.company_id,
        action: 'worker_document_uploaded',
        entityType: 'document',
        entityId: newDoc.id,
        entityName: documentType,
        details: `${documentType} uploaded from worker profile for ${worker.full_name}. Expiry date: ${expiryDate}.`,
      })

      toast.success('Document uploaded successfully.')

      setDocumentType('')
      setExpiryDate('')
      setFile(null)

      fetchWorkerProfile()
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

    toast.error('No file found for this document.')
  }

  function closePreview() {
    setPreviewDoc(null)
    setPreviewUrl('')
  }

  async function deleteDocument(doc) {
    if (!isAdmin) {
      toast.error('Only admins can delete documents.')
      return
    }

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
        companyId: worker.company_id,
        action: 'worker_document_deleted',
        entityType: 'document',
        entityId: doc.id,
        entityName: doc.document_type,
        details: `${doc.document_type} was deleted from ${worker.full_name}'s profile. Expiry date was ${doc.expiry_date}.`,
      })

      toast.success('Document deleted successfully.')
      fetchWorkerProfile()
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

  function formatDate(dateValue) {
    if (!dateValue) return '-'
    return new Date(dateValue).toLocaleString()
  }

  if (loading) {
    return <div style={styles.page}>Loading worker profile...</div>
  }

  if (!worker) {
    return <div style={styles.page}>Worker not found.</div>
  }

  const validDocs = documents.filter((doc) => doc.status === 'valid')
  const expiredDocs = documents.filter((doc) => doc.status === 'expired')
  const expiringSoonDocs = documents.filter((doc) => doc.expiringSoon)

  const complianceScore =
    documents.length > 0
      ? Math.round((validDocs.length / documents.length) * 100)
      : 0

  const lastUploadedDocument = documents[0]

  const pieData = [
    { name: 'Valid', value: validDocs.length },
    { name: 'Expired', value: expiredDocs.length },
    { name: 'Expiring Soon', value: expiringSoonDocs.length },
  ]

  const COLORS = ['#22c55e', '#ef4444', '#f59e0b']

  const barData = [
    { name: 'Uploaded', total: documents.length },
    { name: 'Valid', total: validDocs.length },
    { name: 'Expired', total: expiredDocs.length },
    { name: 'Soon', total: expiringSoonDocs.length },
  ]

  return (
    <div style={styles.page}>
      <h1>{worker.full_name}</h1>

      <div style={styles.profileCard}>
        <p>
          <strong>Role:</strong> {worker.role || '-'}
        </p>

        <p>
          <strong>Site:</strong> {worker.site || '-'}
        </p>

        <p>
          <strong>Status:</strong> {worker.status || '-'}
        </p>
      </div>

      <div style={styles.statsGrid}>
        <StatCard title="Uploaded Docs" value={documents.length} />
        <StatCard title="Valid Docs" value={validDocs.length} />
        <StatCard title="Expired Docs" value={expiredDocs.length} />
        <StatCard title="Expiring Soon" value={expiringSoonDocs.length} />
        <StatCard title="Compliance Score" value={`${complianceScore}%`} />
      </div>

      <div style={styles.chartGrid}>
        <div style={styles.chartCard}>
          <h2>Worker Compliance Breakdown</h2>

          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                label
              >
                {pieData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>

              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={styles.chartCard}>
          <h2>Document Status Analytics</h2>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis allowDecimals={false} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="total" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={styles.analyticsGrid}>
        <div style={styles.infoCard}>
          <h2>Last Uploaded Document</h2>

          {lastUploadedDocument ? (
            <>
              <p>
                <strong>Document:</strong>{' '}
                {lastUploadedDocument.document_type}
              </p>

              <p>
                <strong>Expiry:</strong>{' '}
                {lastUploadedDocument.expiry_date}
              </p>

              <p>
                <strong>Uploaded:</strong>{' '}
                {formatDate(lastUploadedDocument.created_at)}
              </p>
            </>
          ) : (
            <p style={styles.emptyText}>No document uploaded yet.</p>
          )}
        </div>

        <div style={styles.infoCard}>
          <h2>Quick Upload</h2>

          <form onSubmit={uploadDocument} style={styles.uploadForm}>
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

            <button type="submit" style={styles.uploadButton}>
              Upload Document
            </button>
          </form>
        </div>
      </div>

      <div style={styles.alertCard}>
        <h2>Compliance Status</h2>

        {expiredDocs.length > 0 && (
          <div style={styles.alertDanger}>
            {expiredDocs.length} expired document(s) require attention.
          </div>
        )}

        {expiringSoonDocs.length > 0 && (
          <div style={styles.alertWarning}>
            {expiringSoonDocs.length} document(s) expiring soon.
          </div>
        )}

        {expiredDocs.length === 0 && expiringSoonDocs.length === 0 && (
          <div style={styles.alertSuccess}>
            This worker is currently compliant.
          </div>
        )}

        {expiredDocs.length === 0 && expiringSoonDocs.length > 0 && (
          <div style={styles.alertSuccess}>
            This worker is compliant, but has documents expiring soon.
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h2>Compliance Documents</h2>

        {documents.length === 0 ? (
          <p style={styles.emptyText}>
            No documents uploaded for this worker.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Document</th>
                <th style={styles.th}>Expiry Date</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Warning</th>
                <th style={styles.th}>Uploaded At</th>
                <th style={styles.th}>File</th>
                {isAdmin && <th style={styles.th}>Action</th>}
              </tr>
            </thead>

            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td style={styles.td}>{doc.document_type}</td>
                  <td style={styles.td}>{doc.expiry_date}</td>

                  <td style={styles.td}>
                    <span
                      style={{
                        ...getStatusStyle(doc.status),
                        ...styles.badge,
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

                  <td style={styles.td}>{formatDate(doc.created_at)}</td>

                  <td style={styles.td}>
                    <button
                      onClick={() => openDocument(doc)}
                      style={styles.linkButton}
                    >
                      View
                    </button>
                  </td>

                  {isAdmin && (
                    <td style={styles.td}>
                      <button
                        onClick={() => deleteDocument(doc)}
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
      </div>

      <div style={styles.section}>
        <h2>Compliance History</h2>

        {documents.length === 0 ? (
          <p style={styles.emptyText}>No compliance history yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Event</th>
                <th style={styles.th}>Result</th>
              </tr>
            </thead>

            <tbody>
              {documents.map((doc) => (
                <tr key={`history-${doc.id}`}>
                  <td style={styles.td}>{formatDate(doc.created_at)}</td>

                  <td style={styles.td}>{doc.document_type} uploaded</td>

                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        ...getStatusStyle(doc.status),
                      }}
                    >
                      {doc.status}
                    </span>

                    {doc.expiringSoon && (
                      <span
                        style={{
                          ...styles.warningBadge,
                          marginLeft: '8px',
                        }}
                      >
                        expiring soon
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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

function StatCard({ title, value }) {
  return (
    <div style={styles.statCard}>
      <h2>{value}</h2>
      <p>{title}</p>
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

  profileCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '20px',
    maxWidth: '500px',
    marginTop: '20px',
    marginBottom: '30px',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },

  statCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '22px',
  },

  chartGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '30px',
  },

  chartCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '20px',
    height: '340px',
  },

  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '30px',
  },

  infoCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '20px',
  },

  uploadForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },

  input: {
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
  },

  uploadButton: {
    padding: '14px',
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  alertCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '30px',
  },

  alertDanger: {
    background: '#7f1d1d',
    color: '#fecaca',
    padding: '14px',
    borderRadius: '10px',
    marginTop: '12px',
  },

  alertWarning: {
    background: '#78350f',
    color: '#fde68a',
    padding: '14px',
    borderRadius: '10px',
    marginTop: '12px',
  },

  alertSuccess: {
    background: '#064e3b',
    color: '#bbf7d0',
    padding: '14px',
    borderRadius: '10px',
    marginTop: '12px',
  },

  section: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '30px',
  },

  table: {
    width: '100%',
    marginTop: '20px',
    borderCollapse: 'collapse',
  },

  th: {
    border: '1px solid #334155',
    padding: '12px',
    background: '#020617',
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

  deleteButton: {
    background: '#dc2626',
    border: 'none',
    color: 'white',
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  emptyText: {
    color: '#94a3b8',
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