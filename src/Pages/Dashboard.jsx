import { useCallback, useEffect, useMemo, useState } from 'react'
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

import { supabase } from '../supabase'

const EXPIRY_WARNING_DAYS = 30
const CHART_COLORS = ['#22c55e', '#f59e0b', '#ef4444']

export default function Dashboard({ profile }) {
  const [workers, setWorkers] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [siteFilter, setSiteFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [workerStatusFilter, setWorkerStatusFilter] =
    useState('all')
  const [documentStatusFilter, setDocumentStatusFilter] =
    useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const companyId = profile?.company_id || null

  const calculateStatus = useCallback((date) => {
    if (!date) return 'valid'

    return getDaysUntilExpiry(date) < 0 ? 'expired' : 'valid'
  }, [])

  const isExpiringSoon = useCallback((date) => {
    if (!date) return false

    const daysLeft = getDaysUntilExpiry(date)

    return daysLeft >= 0 && daysLeft <= EXPIRY_WARNING_DAYS
  }, [])

  const generateNotifications = useCallback(
    async (companyDocuments, currentCompanyId) => {
      const notificationRecords = companyDocuments
        .map((document) => {
          if (document.company_id !== currentCompanyId) {
            return null
          }

          const status = calculateStatus(document.expiry_date)
          const expiringSoon = isExpiringSoon(
            document.expiry_date,
          )

          if (status !== 'expired' && !expiringSoon) {
            return null
          }

          const notificationStatus =
            status === 'expired' ? 'expired' : 'expiring soon'

          const worker = document.workers

          return {
            document_id: document.id,
            company_id: currentCompanyId,
            worker_name: worker?.full_name || null,
            document_type: document.document_type,
            expiry_date: document.expiry_date,
            status: notificationStatus,
            severity:
              notificationStatus === 'expired'
                ? 'critical'
                : 'warning',
            message:
              notificationStatus === 'expired'
                ? `${document.document_type} has expired${
                    worker?.full_name
                      ? ` for ${worker.full_name}`
                      : ''
                  }.`
                : `${document.document_type} is expiring within ${EXPIRY_WARNING_DAYS} days${
                    worker?.full_name
                      ? ` for ${worker.full_name}`
                      : ''
                  }.`,
            is_read: false,
          }
        })
        .filter(Boolean)

      if (notificationRecords.length === 0) {
        return
      }

      const { error } = await supabase
        .from('notification_logs')
        .upsert(notificationRecords, {
          onConflict: 'document_id,status',
          ignoreDuplicates: true,
        })

      if (error) {
        console.error(
          'Unable to generate compliance notifications:',
          error,
        )

        toast.error(
          'Dashboard loaded, but some notifications could not be generated.',
        )
      }
    },
    [calculateStatus, isExpiringSoon],
  )

  const fetchDashboardData = useCallback(
    async ({ showFullLoader = true } = {}) => {
      if (!companyId) {
        setWorkers([])
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
        const [workersResult, documentsResult] =
          await Promise.all([
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
              .eq('company_id', companyId)
              .order('created_at', { ascending: false }),

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
                created_at,
                workers (
                  id,
                  company_id,
                  full_name,
                  role,
                  site,
                  status
                )
              `)
              .eq('company_id', companyId)
              .order('created_at', { ascending: false }),
          ])

        if (workersResult.error) {
          throw workersResult.error
        }

        if (documentsResult.error) {
          throw documentsResult.error
        }

        const companyWorkers = (workersResult.data || []).filter(
          (worker) => worker.company_id === companyId,
        )

        const companyDocuments = (
          documentsResult.data || []
        )
          .filter(
            (document) =>
              document.company_id === companyId &&
              (!document.workers ||
                document.workers.company_id === companyId),
          )
          .map((document) => ({
            ...document,
            status: calculateStatus(document.expiry_date),
            expiringSoon: isExpiringSoon(
              document.expiry_date,
            ),
          }))

        setWorkers(companyWorkers)
        setDocuments(companyDocuments)

        await generateNotifications(
          companyDocuments,
          companyId,
        )
      } catch (error) {
        console.error('Unable to load dashboard:', error)
        toast.error(
          error?.message || 'Unable to load dashboard data.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [
      calculateStatus,
      companyId,
      generateNotifications,
      isExpiringSoon,
    ],
  )

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

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

  function resetFilters() {
    setSiteFilter('all')
    setRoleFilter('all')
    setWorkerStatusFilter('all')
    setDocumentStatusFilter('all')
    setStartDate('')
    setEndDate('')
  }

  function formatDate(dateValue) {
    if (!dateValue) return '-'

    const date = new Date(dateValue)

    if (Number.isNaN(date.getTime())) return '-'

    return date.toLocaleString('en-GB')
  }

  function getWorkerForDocument(document) {
    return (
      document.workers ||
      workers.find(
        (worker) =>
          worker.id === document.worker_id &&
          worker.company_id === companyId,
      )
    )
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
          .join(','),
      ),
    ].join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = filename
    link.style.display = 'none'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)

    toast.success('CSV exported successfully.')
  }

  const sites = useMemo(
    () =>
      [
        ...new Set(
          workers.map((worker) => worker.site).filter(Boolean),
        ),
      ].sort(),
    [workers],
  )

  const roles = useMemo(
    () =>
      [
        ...new Set(
          workers.map((worker) => worker.role).filter(Boolean),
        ),
      ].sort(),
    [workers],
  )

  const filteredWorkers = useMemo(
    () =>
      workers.filter((worker) => {
        const matchesSite =
          siteFilter === 'all' ||
          worker.site === siteFilter

        const matchesRole =
          roleFilter === 'all' ||
          worker.role === roleFilter

        const matchesStatus =
          workerStatusFilter === 'all' ||
          worker.status === workerStatusFilter

        return (
          matchesSite &&
          matchesRole &&
          matchesStatus
        )
      }),
    [
      roleFilter,
      siteFilter,
      workerStatusFilter,
      workers,
    ],
  )

  const filteredWorkerIds = useMemo(
    () => new Set(filteredWorkers.map((worker) => worker.id)),
    [filteredWorkers],
  )

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) => {
        const belongsToFilteredWorker =
          filteredWorkerIds.has(document.worker_id)

        const documentDisplayStatus =
          document.status === 'expired'
            ? 'expired'
            : document.expiringSoon
              ? 'expiring soon'
              : 'valid'

        const matchesStatus =
          documentStatusFilter === 'all' ||
          documentDisplayStatus === documentStatusFilter

        const expiryTimestamp = document.expiry_date
          ? new Date(
              `${document.expiry_date}T00:00:00`,
            ).getTime()
          : null

        const startTimestamp = startDate
          ? new Date(`${startDate}T00:00:00`).getTime()
          : null

        const endTimestamp = endDate
          ? new Date(`${endDate}T23:59:59`).getTime()
          : null

        const matchesStartDate =
          !startTimestamp ||
          (expiryTimestamp !== null &&
            expiryTimestamp >= startTimestamp)

        const matchesEndDate =
          !endTimestamp ||
          (expiryTimestamp !== null &&
            expiryTimestamp <= endTimestamp)

        return (
          belongsToFilteredWorker &&
          matchesStatus &&
          matchesStartDate &&
          matchesEndDate
        )
      }),
    [
      documentStatusFilter,
      documents,
      endDate,
      filteredWorkerIds,
      startDate,
    ],
  )

  const activeWorkers = useMemo(
    () =>
      filteredWorkers.filter(
        (worker) => worker.status === 'active',
      ),
    [filteredWorkers],
  )

  const inactiveWorkers = useMemo(
    () =>
      filteredWorkers.filter(
        (worker) => worker.status === 'inactive',
      ),
    [filteredWorkers],
  )

  const expiredDocuments = useMemo(
    () =>
      filteredDocuments.filter(
        (document) => document.status === 'expired',
      ),
    [filteredDocuments],
  )

  const expiringSoonDocuments = useMemo(
    () =>
      filteredDocuments.filter(
        (document) =>
          document.status !== 'expired' &&
          document.expiringSoon,
      ),
    [filteredDocuments],
  )

  const healthyDocuments = useMemo(
    () =>
      filteredDocuments.filter(
        (document) =>
          document.status === 'valid' &&
          !document.expiringSoon,
      ),
    [filteredDocuments],
  )

  const currentlyValidDocuments = useMemo(
    () =>
      filteredDocuments.filter(
        (document) => document.status === 'valid',
      ),
    [filteredDocuments],
  )

  const complianceScore =
    filteredDocuments.length > 0
      ? Math.round(
          (currentlyValidDocuments.length /
            filteredDocuments.length) *
            100,
        )
      : 0

  const recentDocuments = useMemo(
    () => filteredDocuments.slice(0, 5),
    [filteredDocuments],
  )

  const pieData = useMemo(
    () => [
      {
        name: 'Valid',
        value: healthyDocuments.length,
      },
      {
        name: 'Expiring Soon',
        value: expiringSoonDocuments.length,
      },
      {
        name: 'Expired',
        value: expiredDocuments.length,
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
        name: 'Workers',
        total: filteredWorkers.length,
      },
      {
        name: 'Active',
        total: activeWorkers.length,
      },
      {
        name: 'Inactive',
        total: inactiveWorkers.length,
      },
      {
        name: 'Documents',
        total: filteredDocuments.length,
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
      activeWorkers.length,
      expiredDocuments.length,
      expiringSoonDocuments.length,
      filteredDocuments.length,
      filteredWorkers.length,
      healthyDocuments.length,
      inactiveWorkers.length,
    ],
  )

  const complianceTrendData = useMemo(
    () => [
      {
        name: 'Workers',
        value: filteredWorkers.length,
      },
      {
        name: 'Docs',
        value: filteredDocuments.length,
      },
      {
        name: 'Valid',
        value: healthyDocuments.length,
      },
      {
        name: 'Expired',
        value: expiredDocuments.length,
      },
      {
        name: 'Soon',
        value: expiringSoonDocuments.length,
      },
    ],
    [
      expiredDocuments.length,
      expiringSoonDocuments.length,
      filteredDocuments.length,
      filteredWorkers.length,
      healthyDocuments.length,
    ],
  )

  function exportComplianceCSV() {
    const rows = filteredDocuments.map((document) => {
      const worker = getWorkerForDocument(document)

      return {
        Worker: worker?.full_name || '-',
        Role: worker?.role || '-',
        Site: worker?.site || '-',
        Document: document.document_type || '-',
        ExpiryDate: document.expiry_date || '-',
        Status:
          document.status === 'expired'
            ? 'expired'
            : document.expiringSoon
              ? 'expiring soon'
              : 'valid',
        Warning: document.expiringSoon
          ? 'expiring soon'
          : '-',
        UploadedAt: formatDate(document.created_at),
      }
    })

    downloadCSV(
      'trustera-compliance-report.csv',
      rows,
    )
  }

  function exportAuditCSV() {
    const rows = [
      ...filteredWorkers.map((worker) => ({
        Type: 'Worker',
        Name: worker.full_name || '-',
        Role: worker.role || '-',
        Site: worker.site || '-',
        Status: worker.status || '-',
        CreatedAt: formatDate(worker.created_at),
      })),

      ...filteredDocuments.map((document) => {
        const worker = getWorkerForDocument(document)

        return {
          Type: 'Document',
          Name: document.document_type || '-',
          Role: worker?.role || '-',
          Site: worker?.site || '-',
          Status:
            document.status === 'expired'
              ? 'expired'
              : document.expiringSoon
                ? 'expiring soon'
                : 'valid',
          CreatedAt: formatDate(document.created_at),
        }
      }),
    ]

    downloadCSV('trustera-audit-report.csv', rows)
  }

  function exportCompliancePDF() {
    if (filteredDocuments.length === 0) {
      toast.error('No compliance data to export.')
      return
    }

    const pdf = new jsPDF()

    pdf.setFontSize(18)
    pdf.text('Trustera Compliance Report', 14, 18)

    pdf.setFontSize(10)
    pdf.text(
      `Generated: ${new Date().toLocaleString('en-GB')}`,
      14,
      26,
    )
    pdf.text(
      `Compliance Score: ${complianceScore}%`,
      14,
      32,
    )
    pdf.text(
      `Workers: ${filteredWorkers.length}`,
      14,
      38,
    )
    pdf.text(
      `Documents: ${filteredDocuments.length}`,
      14,
      44,
    )
    pdf.text(
      `Expired: ${expiredDocuments.length}`,
      14,
      50,
    )
    pdf.text(
      `Expiring Soon: ${expiringSoonDocuments.length}`,
      14,
      56,
    )

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
      body: filteredDocuments.map((document) => {
        const worker = getWorkerForDocument(document)

        return [
          worker?.full_name || '-',
          worker?.role || '-',
          worker?.site || '-',
          document.document_type || '-',
          document.expiry_date || '-',
          document.status === 'expired'
            ? 'expired'
            : document.expiringSoon
              ? 'expiring soon'
              : 'valid',
          document.expiringSoon
            ? 'expiring soon'
            : '-',
        ]
      }),
    })

    pdf.save('trustera-compliance-report.pdf')
    toast.success('Compliance PDF exported.')
  }

  function exportAuditPDF() {
    if (
      filteredWorkers.length === 0 &&
      filteredDocuments.length === 0
    ) {
      toast.error('No audit data to export.')
      return
    }

    const pdf = new jsPDF()

    pdf.setFontSize(18)
    pdf.text('Trustera Audit Report', 14, 18)

    pdf.setFontSize(10)
    pdf.text(
      `Generated: ${new Date().toLocaleString('en-GB')}`,
      14,
      26,
    )
    pdf.text(
      `Filtered Workers: ${filteredWorkers.length}`,
      14,
      32,
    )
    pdf.text(
      `Filtered Documents: ${filteredDocuments.length}`,
      14,
      38,
    )

    autoTable(pdf, {
      startY: 48,
      head: [
        [
          'Type',
          'Name',
          'Role',
          'Site',
          'Status',
          'Created At',
        ],
      ],
      body: [
        ...filteredWorkers.map((worker) => [
          'Worker',
          worker.full_name || '-',
          worker.role || '-',
          worker.site || '-',
          worker.status || '-',
          formatDate(worker.created_at),
        ]),

        ...filteredDocuments.map((document) => {
          const worker = getWorkerForDocument(document)

          return [
            'Document',
            document.document_type || '-',
            worker?.role || '-',
            worker?.site || '-',
            document.status === 'expired'
              ? 'expired'
              : document.expiringSoon
                ? 'expiring soon'
                : 'valid',
            formatDate(document.created_at),
          ]
        }),
      ],
    })

    pdf.save('trustera-audit-report.pdf')
    toast.success('Audit PDF exported.')
  }

  if (!companyId) {
    return (
      <div style={styles.container}>
        <div style={styles.errorPanel}>
          Your account is not assigned to a company. Sign out and
          contact an administrator.
        </div>
      </div>
    )
  }

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
          <h2 style={styles.heading}>
            Trustera Dashboard
          </h2>

          <p style={styles.subText}>
            Compliance, workforce and document analytics for
            your organisation.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            fetchDashboardData({
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

      <div style={styles.exportCard}>
        <h3>Export Reports</h3>

        <div style={styles.exportGrid}>
          <button
            type="button"
            onClick={exportComplianceCSV}
            style={styles.exportButton}
          >
            Export Compliance CSV
          </button>

          <button
            type="button"
            onClick={exportCompliancePDF}
            style={styles.exportButton}
          >
            Export Compliance PDF
          </button>

          <button
            type="button"
            onClick={exportAuditCSV}
            style={styles.exportButton}
          >
            Export Audit CSV
          </button>

          <button
            type="button"
            onClick={exportAuditPDF}
            style={styles.exportButton}
          >
            Export Audit PDF
          </button>
        </div>
      </div>

      <div style={styles.filterCard}>
        <h3>Dashboard Filters</h3>

        <div style={styles.filterGrid}>
          <select
            value={siteFilter}
            onChange={(event) =>
              setSiteFilter(event.target.value)
            }
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
            onChange={(event) =>
              setRoleFilter(event.target.value)
            }
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
            onChange={(event) =>
              setWorkerStatusFilter(event.target.value)
            }
            style={styles.filterInput}
          >
            <option value="all">
              All Worker Statuses
            </option>
            <option value="active">
              Active Workers
            </option>
            <option value="inactive">
              Inactive Workers
            </option>
          </select>

          <select
            value={documentStatusFilter}
            onChange={(event) =>
              setDocumentStatusFilter(event.target.value)
            }
            style={styles.filterInput}
          >
            <option value="all">
              All Document Statuses
            </option>
            <option value="valid">
              Valid Documents
            </option>
            <option value="expired">
              Expired Documents
            </option>
            <option value="expiring soon">
              Expiring Soon
            </option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(event) =>
              setStartDate(event.target.value)
            }
            style={styles.filterInput}
          />

          <input
            type="date"
            value={endDate}
            onChange={(event) =>
              setEndDate(event.target.value)
            }
            style={styles.filterInput}
          />

          <button
            type="button"
            onClick={resetFilters}
            style={styles.resetButton}
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div style={styles.statsGrid}>
        <StatCard
          title="Total Workers"
          value={filteredWorkers.length}
        />

        <StatCard
          title="Active Workers"
          value={activeWorkers.length}
        />

        <StatCard
          title="Inactive Workers"
          value={inactiveWorkers.length}
        />

        <StatCard
          title="Total Documents"
          value={filteredDocuments.length}
        />

        <StatCard
          title="Valid Documents"
          value={healthyDocuments.length}
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
          <h3>Workforce Analytics</h3>

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

      <div style={styles.chartCardFull}>
        <h3>Compliance Trend Snapshot</h3>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={complianceTrendData}>
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

        {expiredDocuments.length > 0 && (
          <div style={styles.alertDanger}>
            {expiredDocuments.length} expired document(s)
            require immediate attention.
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
              All compliance documents are up to date.
            </div>
          )}
      </div>

      <div style={styles.recentCard}>
        <h3>Recent Documents</h3>

        {recentDocuments.length === 0 ? (
          <p style={styles.emptyText}>
            No documents match the selected filters.
          </p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Worker</th>
                  <th style={styles.th}>Document</th>
                  <th style={styles.th}>Expiry Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Warning</th>
                </tr>
              </thead>

              <tbody>
                {recentDocuments.map((document) => {
                  const worker =
                    getWorkerForDocument(document)

                  return (
                    <tr key={document.id}>
                      <td style={styles.td}>
                        {worker?.full_name || '-'}
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
                            ...(document.status ===
                            'expired'
                              ? styles.expiredBadge
                              : document.expiringSoon
                                ? styles.warningBadge
                                : styles.validBadge),
                          }}
                        >
                          {document.status === 'expired'
                            ? 'expired'
                            : document.expiringSoon
                              ? 'expiring soon'
                              : 'valid'}
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardValue}>{value}</h2>
      <p style={styles.cardTitle}>{title}</p>
    </div>
  )
}

const styles = {
  container: {
    padding: '32px',
    color: '#ffffff',
    background: '#020617',
    minHeight: '100vh',
  },

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '24px',
  },

  heading: {
    marginTop: 0,
    marginBottom: '6px',
  },

  subText: {
    color: '#94a3b8',
    margin: 0,
  },

  refreshButton: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    padding: '12px 18px',
    borderRadius: '10px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.65,
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
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },

  exportButton: {
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
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
    gridTemplateColumns:
      'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },

  filterInput: {
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
  },

  resetButton: {
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#475569',
    color: '#ffffff',
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },

  card: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '24px',
  },

  cardValue: {
    marginTop: 0,
    marginBottom: '8px',
  },

  cardTitle: {
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

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '760px',
    borderCollapse: 'collapse',
    marginTop: '20px',
  },

  th: {
    border: '1px solid #334155',
    padding: '12px',
    background: '#020617',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },

  td: {
    border: '1px solid #334155',
    padding: '12px',
  },

  badge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'capitalize',
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
}