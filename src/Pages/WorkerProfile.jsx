import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
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

import { supabase } from '../supabase'
import { can } from '../utils/permissions'

const DOCUMENTS_BUCKET = 'documents'
const EXPIRY_WARNING_DAYS = 30
const CHART_COLORS = ['#22c55e', '#ef4444', '#f59e0b']

export default function WorkerProfile({ profile }) {
  const { id } = useParams()

  const [worker, setWorker] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [documentType, setDocumentType] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const [deletingId, setDeletingId] = useState(null)

  const companyId = profile?.company_id || null
  const canManageDocuments = can(
    profile,
    'manageDocuments',
  )

  const calculateStatus = useCallback((date) => {
    if (!date) return 'valid'

    return getDaysUntilExpiry(date) < 0 ? 'expired' : 'valid'
  }, [])

  const isExpiringSoon = useCallback((date) => {
    if (!date) return false

    const daysLeft = getDaysUntilExpiry(date)

    return daysLeft >= 0 && daysLeft <= EXPIRY_WARNING_DAYS
  }, [])

  const fetchWorkerProfile = useCallback(
    async ({ showFullLoader = true } = {}) => {
      if (!companyId || !id) {
        setWorker(null)
        setDocuments([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (showFullLoader) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const [workerResult, documentsResult] = await Promise.all([
          supabase
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
            .eq('id', id)
            .eq('company_id', companyId)
            .single(),

          supabase
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
              created_at
            `)
            .eq('worker_id', id)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
        ])

        if (workerResult.error) {
          throw workerResult.error
        }

        if (documentsResult.error) {
          throw documentsResult.error
        }

        if (workerResult.data.company_id !== companyId) {
          throw new Error(
            'This worker does not belong to your organisation.',
          )
        }

        const companyDocuments = (documentsResult.data || [])
          .filter(
            (document) =>
              document.company_id === companyId &&
              document.worker_id === id,
          )
          .map((document) => ({
            ...document,
            status: calculateStatus(document.expiry_date),
            expiringSoon: isExpiringSoon(document.expiry_date),
          }))

        setWorker(workerResult.data)
        setDocuments(companyDocuments)
      } catch (error) {
        console.error('Unable to load worker profile:', error)

        setWorker(null)
        setDocuments([])

        toast.error(
          error?.message || 'Unable to load the worker profile.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [
      calculateStatus,
      companyId,
      id,
      isExpiringSoon,
    ],
  )

  useEffect(() => {
    fetchWorkerProfile()
  }, [fetchWorkerProfile])

  function requireCompanyId() {
    if (!companyId) {
      throw new Error(
        'Your profile is not assigned to a company.',
      )
    }

    return companyId
  }

  function getDaysUntilExpiry(date) {
    const today = new Date()
    const expiry = new Date(`${date}T00:00:00`)

    today.setHours(0, 0, 0, 0)
    expiry.setHours(0, 0, 0, 0)

    return Math.ceil(
      (expiry.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24),
    )
  }

  function sanitiseFileName(fileName) {
    return fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
  }

  function createStoragePath(selectedFile) {
    const safeName = sanitiseFileName(selectedFile.name)
    const uniqueName =
      `${Date.now()}-${crypto.randomUUID()}-${safeName}`

    return `${companyId}/${id}/${uniqueName}`
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
      throw new Error(
        'Your authenticated profile could not be identified.',
      )
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

    if (uploading) return

    let uploadedFilePath = null

    try {
      const currentCompanyId = requireCompanyId()
      const trimmedDocumentType = documentType.trim()

      if (!worker) {
        throw new Error('Worker profile is unavailable.')
      }

      if (worker.company_id !== currentCompanyId) {
        throw new Error(
          'You cannot upload a document for another company’s worker.',
        )
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

      setUploading(true)

      uploadedFilePath = createStoragePath(file)

      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(uploadedFilePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        })

      if (uploadError) {
        throw uploadError
      }

      const documentRecord = {
        company_id: currentCompanyId,
        worker_id: worker.id,
        document_type: trimmedDocumentType,
        expiry_date: expiryDate,
        file_path: uploadedFilePath,
        status: calculateStatus(expiryDate),
      }

      const { data: newDocument, error: insertError } =
        await supabase
          .from('documents')
          .insert([documentRecord])
          .select(`
            id,
            company_id,
            worker_id,
            document_type,
            expiry_date,
            status,
            file_path,
            created_at
          `)
          .single()

      if (insertError) {
        throw insertError
      }

      try {
        await createAuditLog({
          action: 'worker_document_uploaded',
          entityType: 'document',
          entityId: newDocument.id,
          entityName: newDocument.document_type,
          details: {
            worker_id: worker.id,
            worker_name: worker.full_name,
            document_type: newDocument.document_type,
            expiry_date: newDocument.expiry_date,
            file_path: newDocument.file_path,
          },
        })
      } catch (auditError) {
        console.error(
          'Document uploaded, but audit logging failed:',
          auditError,
        )

        toast.error(
          'Document uploaded, but the audit entry could not be recorded.',
        )
      }

      toast.success('Document uploaded successfully.')

      setDocumentType('')
      setExpiryDate('')
      setFile(null)

      const fileInput = event.currentTarget.querySelector(
        'input[type="file"]',
      )

      if (fileInput) {
        fileInput.value = ''
      }

      await fetchWorkerProfile({
        showFullLoader: false,
      })
    } catch (error) {
      console.error('Unable to upload worker document:', error)

      if (uploadedFilePath) {
        const { error: cleanupError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .remove([uploadedFilePath])

        if (cleanupError) {
          console.error(
            'Unable to remove file after failed insert:',
            cleanupError,
          )
        }
      }

      toast.error(
        error?.message || 'Unable to upload the document.',
      )
    } finally {
      setUploading(false)
    }
  }

  async function openDocument(document) {
    try {
      const currentCompanyId = requireCompanyId()

      if (
        document.company_id !== currentCompanyId ||
        document.worker_id !== worker?.id
      ) {
        throw new Error(
          'You cannot access another company’s document.',
        )
      }

      if (document.file_path) {
        const { data, error } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .createSignedUrl(document.file_path, 300)

        if (error) {
          throw error
        }

        if (!data?.signedUrl) {
          throw new Error(
            'A secure preview link could not be generated.',
          )
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

      throw new Error(
        'No file was found for this document.',
      )
    } catch (error) {
      console.error('Unable to open document:', error)

      toast.error(
        error?.message || 'Unable to open the document.',
      )
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

      if (
        document.company_id !== currentCompanyId ||
        document.worker_id !== worker?.id
      ) {
        throw new Error(
          'You cannot delete another company’s document.',
        )
      }

      setDeletingId(document.id)

      const { data: deletedDocument, error: deleteError } =
        await supabase
          .from('documents')
          .delete()
          .eq('id', document.id)
          .eq('worker_id', worker.id)
          .eq('company_id', currentCompanyId)
          .select(`
            id,
            company_id,
            worker_id,
            document_type,
            expiry_date,
            file_path
          `)
          .single()

      if (deleteError) {
        throw deleteError
      }

      if (deletedDocument.file_path) {
        const { error: storageError } =
          await supabase.storage
            .from(DOCUMENTS_BUCKET)
            .remove([deletedDocument.file_path])

        if (storageError) {
          console.error(
            'Document row deleted, but storage cleanup failed:',
            storageError,
          )

          toast.error(
            'Document record deleted, but its stored file could not be removed.',
          )
        }
      }

      try {
        await createAuditLog({
          action: 'worker_document_deleted',
          entityType: 'document',
          entityId: deletedDocument.id,
          entityName: deletedDocument.document_type,
          details: {
            worker_id: worker.id,
            worker_name: worker.full_name,
            document_type: deletedDocument.document_type,
            expiry_date: deletedDocument.expiry_date,
            file_path: deletedDocument.file_path,
          },
        })
      } catch (auditError) {
        console.error(
          'Document deleted, but audit logging failed:',
          auditError,
        )

        toast.error(
          'Document deleted, but the audit entry could not be recorded.',
        )
      }

      setDocuments((current) =>
        current.filter(
          (item) => item.id !== deletedDocument.id,
        ),
      )

      toast.success('Document deleted successfully.')
    } catch (error) {
      console.error('Unable to delete document:', error)

      toast.error(
        error?.message || 'Unable to delete the document.',
      )
    } finally {
      setDeletingId(null)
    }
  }

  function getStatusStyle(status) {
    if (String(status || '').toLowerCase() === 'expired') {
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

    const date = new Date(dateValue)

    if (Number.isNaN(date.getTime())) {
      return '-'
    }

    return date.toLocaleString('en-GB')
  }

  const validDocuments = useMemo(
    () =>
      documents.filter(
        (document) => document.status === 'valid',
      ),
    [documents],
  )

  const expiredDocuments = useMemo(
    () =>
      documents.filter(
        (document) => document.status === 'expired',
      ),
    [documents],
  )

  const expiringSoonDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          document.status !== 'expired' &&
          document.expiringSoon,
      ),
    [documents],
  )

  const healthyDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          document.status === 'valid' &&
          !document.expiringSoon,
      ),
    [documents],
  )

  const complianceScore =
    documents.length > 0
      ? Math.round(
          (validDocuments.length / documents.length) * 100,
        )
      : 0

  const lastUploadedDocument = documents[0] || null

  const pieData = useMemo(
    () => [
      {
        name: 'Valid',
        value: healthyDocuments.length,
      },
      {
        name: 'Expired',
        value: expiredDocuments.length,
      },
      {
        name: 'Expiring Soon',
        value: expiringSoonDocuments.length,
      },
    ],
    [
      expiredDocuments.length,
      expiringSoonDocuments.length,
      healthyDocuments.length,
    ],
  )

  const barData = useMemo(
    () => [
      {
        name: 'Uploaded',
        total: documents.length,
      },
      {
        name: 'Valid',
        total: healthyDocuments.length,
      },
      {
        name: 'Expired',
        total: expiredDocuments.length,
      },
      {
        name: 'Soon',
        total: expiringSoonDocuments.length,
      },
    ],
    [
      documents.length,
      expiredDocuments.length,
      expiringSoonDocuments.length,
      healthyDocuments.length,
    ],
  )

  if (!companyId) {
    return (
      <div style={styles.page}>
        <div style={styles.errorPanel}>
          Your account is not assigned to a company. Sign out
          and contact an administrator.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.page}>
        Loading worker profile...
      </div>
    )
  }

  if (!worker) {
    return (
      <div style={styles.page}>
        <div style={styles.errorPanel}>
          Worker not found or you do not have permission to
          view this profile.
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.pageTitle}>
            {worker.full_name}
          </h1>

          <p style={styles.subText}>
            Review this worker’s compliance profile and
            supporting documents.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            fetchWorkerProfile({
              showFullLoader: false,
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
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {!canManageDocuments && (
        <div style={styles.permissionNotice}>
          You can review this worker’s profile and open available
          documents, but your role cannot upload or delete document
          records.
        </div>
      )}

      <div style={styles.profileCard}>
        <p>
          <strong>Role:</strong> {worker.role || '-'}
        </p>

        <p>
          <strong>Site:</strong> {worker.site || '-'}
        </p>

        <p>
          <strong>Status:</strong>{' '}
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
        </p>
      </div>

      <div style={styles.statsGrid}>
        <StatCard
          title="Uploaded Docs"
          value={documents.length}
        />

        <StatCard
          title="Valid Docs"
          value={validDocuments.length}
        />

        <StatCard
          title="Expired Docs"
          value={expiredDocuments.length}
        />

        <StatCard
          title="Expiring Soon"
          value={expiringSoonDocuments.length}
        />

        <StatCard
          title="Compliance Score"
          value={`${complianceScore}%`}
        />
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
                    key={entry.name}
                    fill={
                      CHART_COLORS[
                        index % CHART_COLORS.length
                      ]
                    }
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
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#334155"
              />

              <XAxis
                dataKey="name"
                stroke="#94a3b8"
              />

              <YAxis
                allowDecimals={false}
                stroke="#94a3b8"
              />

              <Tooltip />

              <Bar
                dataKey="total"
                fill="#3b82f6"
              />
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
                {lastUploadedDocument.expiry_date || '-'}
              </p>

              <p>
                <strong>Uploaded:</strong>{' '}
                {formatDate(
                  lastUploadedDocument.created_at,
                )}
              </p>
            </>
          ) : (
            <p style={styles.emptyText}>
              No document uploaded yet.
            </p>
          )}
        </div>

        <div style={styles.infoCard}>
          <h2>Quick Upload</h2>

          {canManageDocuments ? (
            <form
              onSubmit={uploadDocument}
              style={styles.uploadForm}
            >
              <input
                type="text"
                placeholder="Document Type"
                value={documentType}
                onChange={(event) =>
                  setDocumentType(event.target.value)
                }
                disabled={uploading}
                required
                style={styles.input}
              />

              <input
                type="date"
                value={expiryDate}
                onChange={(event) =>
                  setExpiryDate(event.target.value)
                }
                disabled={uploading}
                required
                style={styles.input}
              />

              <input
                type="file"
                onChange={(event) =>
                  setFile(event.target.files?.[0] || null)
                }
                disabled={uploading}
                required
                style={styles.input}
              />

              <button
                type="submit"
                style={{
                  ...styles.uploadButton,
                  ...(uploading
                    ? styles.disabledButton
                    : {}),
                }}
                disabled={uploading}
              >
                {uploading
                  ? 'Uploading...'
                  : 'Upload Document'}
              </button>
            </form>
          ) : (
            <p style={styles.emptyText}>
              Your role has read-only access to this worker’s
              compliance documents.
            </p>
          )}
        </div>
      </div>

      <div style={styles.alertCard}>
        <h2>Compliance Status</h2>

        {expiredDocuments.length > 0 && (
          <div style={styles.alertDanger}>
            {expiredDocuments.length} expired document(s)
            require attention.
          </div>
        )}

        {expiringSoonDocuments.length > 0 && (
          <div style={styles.alertWarning}>
            {expiringSoonDocuments.length} document(s)
            expire within {EXPIRY_WARNING_DAYS} days.
          </div>
        )}

        {expiredDocuments.length === 0 &&
          expiringSoonDocuments.length === 0 && (
            <div style={styles.alertSuccess}>
              This worker is currently compliant.
            </div>
          )}

        {expiredDocuments.length === 0 &&
          expiringSoonDocuments.length > 0 && (
            <div style={styles.alertSuccess}>
              This worker is compliant, but has documents
              expiring soon.
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
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Document</th>
                  <th style={styles.th}>Expiry Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Warning</th>
                  <th style={styles.th}>Uploaded At</th>
                  <th style={styles.th}>File</th>

                  {canManageDocuments && (
                    <th style={styles.th}>Action</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {documents.map((document) => {
                  const isDeleting =
                    deletingId === document.id

                  return (
                    <tr key={document.id}>
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
                            ...getStatusStyle(
                              document.status,
                            ),
                          }}
                        >
                          {document.status}
                        </span>
                      </td>

                      <td style={styles.td}>
                        {document.expiringSoon ? (
                          <span
                            style={styles.warningBadge}
                          >
                            expiring soon
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td style={styles.td}>
                        {formatDate(document.created_at)}
                      </td>

                      <td style={styles.td}>
                        <button
                          type="button"
                          onClick={() =>
                            openDocument(document)
                          }
                          style={styles.linkButton}
                        >
                          View
                        </button>
                      </td>

                      {canManageDocuments && (
                        <td style={styles.td}>
                          <button
                            type="button"
                            onClick={() =>
                              deleteDocument(document)
                            }
                            style={{
                              ...styles.deleteButton,
                              ...(isDeleting
                                ? styles.disabledButton
                                : {}),
                            }}
                            disabled={isDeleting}
                          >
                            {isDeleting
                              ? 'Deleting...'
                              : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h2>Compliance History</h2>

        {documents.length === 0 ? (
          <p style={styles.emptyText}>
            No compliance history yet.
          </p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Event</th>
                  <th style={styles.th}>Result</th>
                </tr>
              </thead>

              <tbody>
                {documents.map((document) => (
                  <tr key={`history-${document.id}`}>
                    <td style={styles.td}>
                      {formatDate(document.created_at)}
                    </td>

                    <td style={styles.td}>
                      {document.document_type} uploaded
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...getStatusStyle(
                            document.status,
                          ),
                        }}
                      >
                        {document.status}
                      </span>

                      {document.expiringSoon && (
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
          </div>
        )}
      </div>

      {previewDoc && (
        <div style={styles.previewOverlay}>
          <div style={styles.previewModal}>
            <div style={styles.previewHeader}>
              <div>
                <h2 style={styles.previewTitle}>
                  {previewDoc.document_type ||
                    'Document Preview'}
                </h2>

                <p style={styles.previewSubText}>
                  Expiry:{' '}
                  {previewDoc.expiry_date || '-'}
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
              title={`${
                previewDoc.document_type || 'Document'
              } preview`}
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
      <h2 style={styles.statValue}>{value}</h2>
      <p style={styles.statTitle}>{title}</p>
    </div>
  )
}

const styles = {
  page: {
    padding: '40px',
    color: '#ffffff',
    background: '#020617',
    minHeight: '100vh',
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

  subText: {
    margin: 0,
    color: '#94a3b8',
  },

  refreshButton: {
    padding: '12px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 'bold',
    cursor: 'pointer',
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

  profileCard: {
    maxWidth: '500px',
    marginBottom: '30px',
    padding: '20px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },

  statCard: {
    padding: '22px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
  },

  statValue: {
    marginTop: 0,
    marginBottom: '8px',
  },

  statTitle: {
    margin: 0,
  },

  chartGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },

  chartCard: {
    height: '340px',
    padding: '20px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
  },

  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },

  infoCard: {
    padding: '20px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
  },

  uploadForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
  },

  uploadButton: {
    padding: '14px',
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.65,
  },

  alertCard: {
    padding: '20px',
    marginBottom: '30px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
  },

  alertDanger: {
    marginTop: '12px',
    padding: '14px',
    borderRadius: '10px',
    background: '#7f1d1d',
    color: '#fecaca',
  },

  alertWarning: {
    marginTop: '12px',
    padding: '14px',
    borderRadius: '10px',
    background: '#78350f',
    color: '#fde68a',
  },

  alertSuccess: {
    marginTop: '12px',
    padding: '14px',
    borderRadius: '10px',
    background: '#064e3b',
    color: '#bbf7d0',
  },

  section: {
    padding: '20px',
    marginBottom: '30px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
  },

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '900px',
    marginTop: '20px',
    borderCollapse: 'collapse',
  },

  th: {
    padding: '12px',
    border: '1px solid #334155',
    background: '#020617',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },

  td: {
    padding: '12px',
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

  activeBadge: {
    background: '#064e3b',
    color: '#bbf7d0',
  },

  inactiveBadge: {
    background: '#7f1d1d',
    color: '#fecaca',
  },

  warningBadge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    background: '#78350f',
    color: '#fde68a',
    fontSize: '12px',
    fontWeight: 'bold',
  },

  linkButton: {
    border: 'none',
    background: 'transparent',
    color: '#60a5fa',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  deleteButton: {
    padding: '8px 14px',
    border: 'none',
    borderRadius: '6px',
    background: '#dc2626',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  emptyText: {
    color: '#94a3b8',
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

  previewOverlay: {
    position: 'fixed',
    inset: 0,
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.88)',
    zIndex: 9999,
  },

  previewModal: {
    width: '90%',
    height: '90%',
    boxSizing: 'border-box',
    padding: '20px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '14px',
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
    marginTop: '6px',
    marginBottom: 0,
    color: '#94a3b8',
  },

  previewFrame: {
    width: '100%',
    height: 'calc(100% - 76px)',
    border: '1px solid #334155',
    borderRadius: '10px',
    background: '#ffffff',
  },

  closeButton: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#dc2626',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}