import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
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
  LineChart,
  Line,
} from 'recharts'

export default function Dashboard() {
  const [workers, setWorkers] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  const [siteFilter, setSiteFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [workerStatusFilter, setWorkerStatusFilter] = useState('all')
  const [documentStatusFilter, setDocumentStatusFilter] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      toast.error(profileError.message)
      setLoading(false)
      return
    }

    if (!profile?.company_id) {
      setLoading(false)
      return
    }

    const companyId = profile.company_id

    const { data: workersData, error: workersError } = await supabase
      .from('workers')
      .select('*')
      .eq('company_id', companyId)

    if (workersError) {
      toast.error(workersError.message)
      setLoading(false)
      return
    }

    const { data: documentsData, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (documentsError) {
      toast.error(documentsError.message)
      setLoading(false)
      return
    }

    const updatedDocuments = (documentsData || []).map((doc) => ({
      ...doc,
      status: calculateStatus(doc.expiry_date),
      expiringSoon: isExpiringSoon(doc.expiry_date),
    }))

    setWorkers(workersData || [])
    setDocuments(updatedDocuments)

    await generateNotifications(updatedDocuments, companyId)

    setLoading(false)
  }

  async function generateNotifications(docs, companyId) {
    for (const doc of docs) {
      const status = calculateStatus(doc.expiry_date)
      const expiringSoon = isExpiringSoon(doc.expiry_date)

      if (status === 'expired' || expiringSoon) {
        const notificationStatus =
          status === 'expired' ? 'expired' : 'expiring soon'

        const message =
          notificationStatus === 'expired'
            ? `${doc.document_type} has expired`
            : `${doc.document_type} is expiring soon`

        await supabase.from('notification_logs').upsert(
          {
            document_id: doc.id,
            company_id: companyId,
            document_type: doc.document_type,
            expiry_date: doc.expiry_date,
            status: notificationStatus,
            message,
          },
          {
            onConflict: 'document_id,status',
            ignoreDuplicates: true,
          }
        )
      }
    }
  }

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

  function resetFilters() {
    setSiteFilter('all')
    setRoleFilter('all')
    setWorkerStatusFilter('all')
    setDocumentStatusFilter('all')
    setStartDate('')
    setEndDate('')
  }

  function getWorkerForDocument(doc) {
    return workers.find((worker) => worker.id === doc.worker_id)
  }

  function downloadCSV(filename, rows) {
    if (rows.length === 0) {
      toast.error('No data to export.')
      return
    }

    const headers = Object.keys(rows[0])

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = row[header] ?? ''
            return `"${String(value).replaceAll('"', '""')}"`
          })
          .join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
    toast.success('CSV exported successfully.')
  }

  function exportComplianceCSV() {
    const rows = filteredDocuments.map((doc) => {
      const worker = getWorkerForDocument(doc)

      return {
        Worker: worker?.full_name || '-',
        Role: worker?.role || '-',
        Site: worker?.site || '-',
        Document: doc.document_type || '-',
        ExpiryDate: doc.expiry_date || '-',
        Status: doc.status || '-',
        Warning: doc.expiringSoon ? 'expiring soon' : '-',
        UploadedAt: doc.created_at || '-',
      }
    })

    downloadCSV('trustera-compliance-report.csv', rows)
  }

  function exportAuditCSV() {
    const rows = [
      ...filteredWorkers.map((worker) => ({
        Type: 'Worker',
        Name: worker.full_name || '-',
        Role: worker.role || '-',
        Site: worker.site || '-',
        Status: worker.status || '-',
        CreatedAt: worker.created_at || '-',
      })),
      ...filteredDocuments.map((doc) => {
        const worker = getWorkerForDocument(doc)

        return {
          Type: 'Document',
          Name: doc.document_type || '-',
          Role: worker?.role || '-',
          Site: worker?.site || '-',
          Status: doc.status || '-',
          CreatedAt: doc.created_at || '-',
        }
      }),
    ]

    downloadCSV('trustera-audit-report.csv', rows)
  }

  function exportCompliancePDF() {
    const pdf = new jsPDF()

    pdf.setFontSize(18)
    pdf.text('Trustera Compliance Report', 14, 18)

    pdf.setFontSize(10)
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 26)
    pdf.text(`Compliance Score: ${complianceScore}%`, 14, 32)
    pdf.text(`Workers: ${filteredWorkers.length}`, 14, 38)
    pdf.text(`Documents: ${filteredDocuments.length}`, 14, 44)
    pdf.text(`Expired: ${expiredDocs.length}`, 14, 50)
    pdf.text(`Expiring Soon: ${expiringSoonDocs.length}`, 14, 56)

    autoTable(pdf, {
      startY: 66,
      head: [
        [
          'Worker',
          'Role',
          'Site',
          'Document',
          'Expiry Date',
          'Status',
          'Warning',
        ],
      ],
      body: filteredDocuments.map((doc) => {
        const worker = getWorkerForDocument(doc)

        return [
          worker?.full_name || '-',
          worker?.role || '-',
          worker?.site || '-',
          doc.document_type || '-',
          doc.expiry_date || '-',
          doc.status || '-',
          doc.expiringSoon ? 'expiring soon' : '-',
        ]
      }),
    })

    pdf.save('trustera-compliance-report.pdf')
    toast.success('Compliance PDF exported.')
  }

  function exportAuditPDF() {
    const pdf = new jsPDF()

    pdf.setFontSize(18)
    pdf.text('Trustera Audit Report', 14, 18)

    pdf.setFontSize(10)
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 26)
    pdf.text(`Filtered Workers: ${filteredWorkers.length}`, 14, 32)
    pdf.text(`Filtered Documents: ${filteredDocuments.length}`, 14, 38)

    autoTable(pdf, {
      startY: 48,
      head: [['Type', 'Name', 'Role', 'Site', 'Status', 'Created At']],
      body: [
        ...filteredWorkers.map((worker) => [
          'Worker',
          worker.full_name || '-',
          worker.role || '-',
          worker.site || '-',
          worker.status || '-',
          worker.created_at || '-',
        ]),
        ...filteredDocuments.map((doc) => {
          const worker = getWorkerForDocument(doc)

          return [
            'Document',
            doc.document_type || '-',
            worker?.role || '-',
            worker?.site || '-',
            doc.status || '-',
            doc.created_at || '-',
          ]
        }),
      ],
    })

    pdf.save('trustera-audit-report.pdf')
    toast.success('Audit PDF exported.')
  }

  const sites = [...new Set(workers.map((worker) => worker.site).filter(Boolean))]
  const roles = [...new Set(workers.map((worker) => worker.role).filter(Boolean))]

  const filteredWorkers = workers.filter((worker) => {
    const matchesSite = siteFilter === 'all' || worker.site === siteFilter
    const matchesRole = roleFilter === 'all' || worker.role === roleFilter
    const matchesStatus =
      workerStatusFilter === 'all' || worker.status === workerStatusFilter

    return matchesSite && matchesRole && matchesStatus
  })

  const filteredWorkerIds = filteredWorkers.map((worker) => worker.id)

  const filteredDocuments = documents.filter((doc) => {
    const belongsToFilteredWorker = filteredWorkerIds.includes(doc.worker_id)

    const matchesStatus =
      documentStatusFilter === 'all' ||
      doc.status === documentStatusFilter ||
      (documentStatusFilter === 'expiring soon' && doc.expiringSoon)

    const matchesStartDate =
      !startDate || new Date(doc.expiry_date) >= new Date(startDate)

    const matchesEndDate =
      !endDate || new Date(doc.expiry_date) <= new Date(endDate)

    return (
      belongsToFilteredWorker &&
      matchesStatus &&
      matchesStartDate &&
      matchesEndDate
    )
  })

  const activeWorkers = filteredWorkers.filter(
    (worker) => worker.status === 'active'
  )

  const inactiveWorkers = filteredWorkers.filter(
    (worker) => worker.status === 'inactive'
  )

  const validDocs = filteredDocuments.filter((doc) => doc.status === 'valid')
  const expiredDocs = filteredDocuments.filter((doc) => doc.status === 'expired')
  const expiringSoonDocs = filteredDocuments.filter((doc) => doc.expiringSoon)

  const complianceScore =
    filteredDocuments.length > 0
      ? Math.round((validDocs.length / filteredDocuments.length) * 100)
      : 0

  const recentDocuments = filteredDocuments.slice(0, 5)

  const pieData = [
    { name: 'Valid', value: validDocs.length },
    { name: 'Expiring Soon', value: expiringSoonDocs.length },
    { name: 'Expired', value: expiredDocs.length },
  ]

  const COLORS = ['#22c55e', '#f59e0b', '#ef4444']

  const barData = [
    { name: 'Workers', total: filteredWorkers.length },
    { name: 'Active', total: activeWorkers.length },
    { name: 'Inactive', total: inactiveWorkers.length },
    { name: 'Documents', total: filteredDocuments.length },
    { name: 'Valid', total: validDocs.length },
    { name: 'Expired', total: expiredDocs.length },
    { name: 'Soon', total: expiringSoonDocs.length },
  ]

  const complianceTrendData = [
    { name: 'Workers', value: filteredWorkers.length },
    { name: 'Docs', value: filteredDocuments.length },
    { name: 'Valid', value: validDocs.length },
    { name: 'Expired', value: expiredDocs.length },
    { name: 'Soon', value: expiringSoonDocs.length },
  ]

  if (loading) {
    return (
      <div style={styles.container}>
        <h2>Loading dashboard...</h2>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.heading}>Trustera Dashboard</h2>
          <p style={styles.subText}>
            Compliance, workforce, and document analytics overview.
          </p>
        </div>

        <button onClick={fetchDashboardData} style={styles.refreshButton}>
          Refresh
        </button>
      </div>

      <div style={styles.exportCard}>
        <h3>Export Reports</h3>

        <div style={styles.exportGrid}>
          <button onClick={exportComplianceCSV} style={styles.exportButton}>
            Export Compliance CSV
          </button>

          <button onClick={exportCompliancePDF} style={styles.exportButton}>
            Export Compliance PDF
          </button>

          <button onClick={exportAuditCSV} style={styles.exportButton}>
            Export Audit CSV
          </button>

          <button onClick={exportAuditPDF} style={styles.exportButton}>
            Export Audit PDF
          </button>
        </div>
      </div>

      <div style={styles.filterCard}>
        <h3>Dashboard Filters</h3>

        <div style={styles.filterGrid}>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            style={styles.filterInput}
          >
            <option value="all">All Sites</option>
            {sites.map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={styles.filterInput}
          >
            <option value="all">All Roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <select
            value={workerStatusFilter}
            onChange={(e) => setWorkerStatusFilter(e.target.value)}
            style={styles.filterInput}
          >
            <option value="all">All Worker Statuses</option>
            <option value="active">Active Workers</option>
            <option value="inactive">Inactive Workers</option>
          </select>

          <select
            value={documentStatusFilter}
            onChange={(e) => setDocumentStatusFilter(e.target.value)}
            style={styles.filterInput}
          >
            <option value="all">All Document Statuses</option>
            <option value="valid">Valid Documents</option>
            <option value="expired">Expired Documents</option>
            <option value="expiring soon">Expiring Soon</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.filterInput}
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.filterInput}
          />

          <button onClick={resetFilters} style={styles.resetButton}>
            Reset Filters
          </button>
        </div>
      </div>

      <div style={styles.statsGrid}>
        <StatCard title="Total Workers" value={filteredWorkers.length} />
        <StatCard title="Active Workers" value={activeWorkers.length} />
        <StatCard title="Inactive Workers" value={inactiveWorkers.length} />
        <StatCard title="Total Documents" value={filteredDocuments.length} />
        <StatCard title="Valid Documents" value={validDocs.length} />
        <StatCard title="Expired Docs" value={expiredDocs.length} />
        <StatCard title="Expiring Soon" value={expiringSoonDocs.length} />
        <StatCard title="Compliance Score" value={`${complianceScore}%`} />
      </div>

      <div style={styles.chartGrid}>
        <div style={styles.chartCard}>
          <h3>Compliance Overview</h3>

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
          <h3>Workforce Analytics</h3>

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

      <div style={styles.chartCardFull}>
        <h3>Compliance Trend Snapshot</h3>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={complianceTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis allowDecimals={false} stroke="#94a3b8" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#22c55e"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={styles.alertCard}>
        <h3>Compliance Alerts</h3>

        {expiredDocs.length > 0 && (
          <div style={styles.alertDanger}>
            {expiredDocs.length} expired document(s) require immediate attention.
          </div>
        )}

        {expiringSoonDocs.length > 0 && (
          <div style={styles.alertWarning}>
            {expiringSoonDocs.length} document(s) expiring within 30 days.
          </div>
        )}

        {expiredDocs.length === 0 && expiringSoonDocs.length === 0 && (
          <div style={styles.alertSuccess}>
            All compliance documents are up to date.
          </div>
        )}
      </div>

      <div style={styles.recentCard}>
        <h3>Recent Documents</h3>

        {recentDocuments.length === 0 ? (
          <p style={styles.emptyText}>No documents match the selected filters.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Document</th>
                <th style={styles.th}>Expiry Date</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Warning</th>
              </tr>
            </thead>

            <tbody>
              {recentDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td style={styles.td}>{doc.document_type}</td>
                  <td style={styles.td}>{doc.expiry_date}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        ...(doc.status === 'expired'
                          ? styles.expiredBadge
                          : styles.validBadge),
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div style={styles.card}>
      <h2>{value}</h2>
      <p>{title}</p>
    </div>
  )
}

const styles = {
  container: {
    padding: '32px',
    color: 'white',
    background: '#020617',
    minHeight: '100vh',
  },

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '20px',
    marginBottom: '24px',
  },

  heading: {
    marginBottom: '6px',
  },

  subText: {
    color: '#94a3b8',
    margin: 0,
  },

  refreshButton: {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '12px 18px',
    borderRadius: '10px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  exportCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '30px',
  },

  exportGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },

  exportButton: {
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  filterCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '30px',
  },

  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },

  filterInput: {
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
  },

  resetButton: {
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#475569',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },

  card: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '24px',
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
    borderRadius: '14px',
    padding: '20px',
    height: '340px',
  },

  chartCardFull: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    height: '340px',
    marginBottom: '30px',
  },

  alertCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
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
    background: '#14532d',
    color: '#bbf7d0',
    padding: '14px',
    borderRadius: '10px',
    marginTop: '12px',
  },

  recentCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
  },

  emptyText: {
    color: '#94a3b8',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '20px',
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

  validBadge: {
    background: '#064e3b',
    color: '#bbf7d0',
  },

  expiredBadge: {
    background: '#7f1d1d',
    color: '#fecaca',
  },

  warningBadge: {
    background: '#78350f',
    color: '#fde68a',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
}