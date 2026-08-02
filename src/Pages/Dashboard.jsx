import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
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
import { can } from '../utils/permissions'

const EXPIRY_WARNING_DAYS = 30

const CHART_COLOURS = [
  '#22c55e',
  '#f59e0b',
  '#ef4444',
]

const STATUS_META = {
  valid: {
    label: 'Valid',
    colour: '#22c55e',
    background: '#052e16',
    description:
      'Current and outside the warning window',
    icon: '✓',
  },

  expiringSoon: {
    label: 'Expiring Soon',
    colour: '#f59e0b',
    background: '#451a03',
    description: `Due within ${EXPIRY_WARNING_DAYS} days`,
    icon: '◷',
  },

  expired: {
    label: 'Expired',
    colour: '#ef4444',
    background: '#450a0a',
    description: 'Past the recorded expiry date',
    icon: '!',
  },
}

function getDaysUntilExpiry(dateValue) {
  if (!dateValue) return null

  const today = new Date()
  const expiry = new Date(`${dateValue}T00:00:00`)

  if (Number.isNaN(expiry.getTime())) {
    return null
  }

  today.setHours(0, 0, 0, 0)
  expiry.setHours(0, 0, 0, 0)

  return Math.ceil(
    (expiry.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24),
  )
}

function calculateDocumentState(expiryDate) {
  if (!expiryDate) {
    return {
      status: 'valid',
      expiringSoon: false,
      daysUntilExpiry: null,
      displayStatus: 'valid',
    }
  }

  const daysUntilExpiry =
    getDaysUntilExpiry(expiryDate)

  if (daysUntilExpiry === null) {
    return {
      status: 'valid',
      expiringSoon: false,
      daysUntilExpiry: null,
      displayStatus: 'valid',
    }
  }

  if (daysUntilExpiry < 0) {
    return {
      status: 'expired',
      expiringSoon: false,
      daysUntilExpiry,
      displayStatus: 'expired',
    }
  }

  if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
    return {
      status: 'valid',
      expiringSoon: true,
      daysUntilExpiry,
      displayStatus: 'expiring soon',
    }
  }

  return {
    status: 'valid',
    expiringSoon: false,
    daysUntilExpiry,
    displayStatus: 'valid',
  }
}

function normaliseWorkerStatus(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase()

  return value === 'inactive'
    ? 'inactive'
    : 'active'
}

function formatDate(dateValue) {
  if (!dateValue) return '-'

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatExpiryDate(dateValue) {
  if (!dateValue) return '-'

  const date = new Date(`${dateValue}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getExportDateStamp() {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(
    now.getMonth() + 1,
  ).padStart(2, '0')
  const day = String(now.getDate()).padStart(
    2,
    '0',
  )

  return `${year}-${month}-${day}`
}

export default function Dashboard({ profile }) {
  const [workers, setWorkers] = useState([])
  const [documents, setDocuments] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)

  const [siteFilter, setSiteFilter] =
    useState('all')
  const [roleFilter, setRoleFilter] =
    useState('all')
  const [
    workerStatusFilter,
    setWorkerStatusFilter,
  ] = useState('all')
  const [
    documentStatusFilter,
    setDocumentStatusFilter,
  ] = useState('all')
  const [startDate, setStartDate] =
    useState('')
  const [endDate, setEndDate] = useState('')

  const [pageError, setPageError] =
    useState('')

  const companyId = profile?.company_id || null

  const canManageDocuments = can(
    profile,
    'manageDocuments',
  )

  const canExportReports = can(
    profile,
    'exportReports',
  )

  const canViewNotifications = can(
    profile,
    'viewNotifications',
  )

  const canCreateNotifications =
    canManageDocuments && canViewNotifications

  const generateNotifications = useCallback(
    async (
      companyDocuments,
      currentCompanyId,
    ) => {
      if (
        !currentCompanyId ||
        !canCreateNotifications
      ) {
        return
      }

      const notificationRecords =
        companyDocuments
          .map((document) => {
            if (
              document.company_id !==
              currentCompanyId
            ) {
              return null
            }

            if (
              document.displayStatus !==
                'expired' &&
              document.displayStatus !==
                'expiring soon'
            ) {
              return null
            }

            const notificationStatus =
              document.displayStatus

            const worker = document.workers

            return {
              document_id: document.id,
              company_id: currentCompanyId,
              worker_name:
                worker?.full_name || null,
              document_type:
                document.document_type,
              expiry_date:
                document.expiry_date,
              status: notificationStatus,
              severity:
                notificationStatus ===
                'expired'
                  ? 'critical'
                  : 'warning',
              message:
                notificationStatus ===
                'expired'
                  ? `${
                      document.document_type ||
                      'Document'
                    } has expired${
                      worker?.full_name
                        ? ` for ${worker.full_name}`
                        : ''
                    }.`
                  : `${
                      document.document_type ||
                      'Document'
                    } is expiring within ${EXPIRY_WARNING_DAYS} days${
                      worker?.full_name
                        ? ` for ${worker.full_name}`
                        : ''
                    }.`,
              is_read: false,
            }
          })
          .filter(Boolean)

      if (
        notificationRecords.length === 0
      ) {
        return
      }

      const { error } = await supabase
        .from('notification_logs')
        .upsert(notificationRecords, {
          onConflict:
            'document_id,status',
          ignoreDuplicates: true,
        })

      if (error) {
        console.warn(
          'Compliance notifications could not be generated:',
          error,
        )
      }
    },
    [canCreateNotifications],
  )

  const fetchDashboardData = useCallback(
    async ({
      showFullLoader = true,
      showSuccessMessage = false,
    } = {}) => {
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

      setPageError('')

      try {
        const [
          workersResult,
          documentsResult,
        ] = await Promise.all([
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
            .order('created_at', {
              ascending: false,
            }),

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
            .order('created_at', {
              ascending: false,
            }),
        ])

        if (workersResult.error) {
          throw workersResult.error
        }

        if (documentsResult.error) {
          throw documentsResult.error
        }

        const companyWorkers = (
          workersResult.data || []
        )
          .filter(
            (worker) =>
              worker.company_id === companyId,
          )
          .map((worker) => ({
            ...worker,
            status:
              normaliseWorkerStatus(
                worker.status,
              ),
          }))

        const companyDocuments = (
          documentsResult.data || []
        )
          .filter(
            (document) =>
              document.company_id ===
                companyId &&
              (!document.workers ||
                document.workers
                  .company_id === companyId),
          )
          .map((document) => ({
            ...document,
            ...calculateDocumentState(
              document.expiry_date,
            ),
          }))

        setWorkers(companyWorkers)
        setDocuments(companyDocuments)

        await generateNotifications(
          companyDocuments,
          companyId,
        )

        if (showSuccessMessage) {
          toast.success(
            'Dashboard refreshed.',
          )
        }
      } catch (error) {
        console.error(
          'Unable to load dashboard:',
          error,
        )

        const message =
          error?.message ||
          'Unable to load dashboard data.'

        setPageError(message)
        toast.error(message)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [
      companyId,
      generateNotifications,
    ],
  )

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  useEffect(() => {
    if (!companyId) return undefined

    const channel = supabase
      .channel(
        `dashboard-company-${companyId}`,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workers',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          fetchDashboardData({
            showFullLoader: false,
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          fetchDashboardData({
            showFullLoader: false,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, fetchDashboardData])

  function resetFilters() {
    setSiteFilter('all')
    setRoleFilter('all')
    setWorkerStatusFilter('all')
    setDocumentStatusFilter('all')
    setStartDate('')
    setEndDate('')
  }

  function getWorkerForDocument(
    documentRecord,
  ) {
    if (
      documentRecord.workers?.company_id ===
      companyId
    ) {
      return documentRecord.workers
    }

    return workers.find(
      (worker) =>
        worker.id ===
          documentRecord.worker_id &&
        worker.company_id === companyId,
    )
  }

  function downloadCSV(filename, rows) {
    if (!canExportReports) {
      toast.error(
        'Your role does not allow report exports.',
      )
      return
    }

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
            const value =
              row[header] ?? ''

            return `"${String(
              value,
            ).replaceAll('"', '""')}"`
          })
          .join(','),
      ),
    ].join('\n')

    const blob = new Blob(
      [`\uFEFF${csv}`],
      {
        type: 'text/csv;charset=utf-8;',
      },
    )

    const url =
      URL.createObjectURL(blob)
    const link =
      document.createElement('a')

    link.href = url
    link.download = filename
    link.style.display = 'none'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)

    toast.success(
      'CSV exported successfully.',
    )
  }

  const sites = useMemo(
    () =>
      [
        ...new Set(
          workers
            .map((worker) => worker.site)
            .filter(Boolean),
        ),
      ].sort((a, b) =>
        String(a).localeCompare(String(b)),
      ),
    [workers],
  )

  const roles = useMemo(
    () =>
      [
        ...new Set(
          workers
            .map((worker) => worker.role)
            .filter(Boolean),
        ),
      ].sort((a, b) =>
        String(a).localeCompare(String(b)),
      ),
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
          worker.status ===
            workerStatusFilter

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
    () =>
      new Set(
        filteredWorkers.map(
          (worker) => worker.id,
        ),
      ),
    [filteredWorkers],
  )

  const filteredDocuments = useMemo(
    () =>
      documents.filter((documentRecord) => {
        const belongsToFilteredWorker =
          filteredWorkerIds.has(
            documentRecord.worker_id,
          )

        const matchesStatus =
          documentStatusFilter === 'all' ||
          documentRecord.displayStatus ===
            documentStatusFilter

        const expiryTimestamp =
          documentRecord.expiry_date
            ? new Date(
                `${documentRecord.expiry_date}T00:00:00`,
              ).getTime()
            : null

        const startTimestamp = startDate
          ? new Date(
              `${startDate}T00:00:00`,
            ).getTime()
          : null

        const endTimestamp = endDate
          ? new Date(
              `${endDate}T23:59:59`,
            ).getTime()
          : null

        const matchesStartDate =
          startTimestamp === null ||
          (expiryTimestamp !== null &&
            expiryTimestamp >=
              startTimestamp)

        const matchesEndDate =
          endTimestamp === null ||
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
        (worker) =>
          worker.status === 'active',
      ),
    [filteredWorkers],
  )

  const inactiveWorkers = useMemo(
    () =>
      filteredWorkers.filter(
        (worker) =>
          worker.status === 'inactive',
      ),
    [filteredWorkers],
  )

  const expiredDocuments = useMemo(
    () =>
      filteredDocuments.filter(
        (documentRecord) =>
          documentRecord.displayStatus ===
          'expired',
      ),
    [filteredDocuments],
  )

  const expiringSoonDocuments = useMemo(
    () =>
      filteredDocuments.filter(
        (documentRecord) =>
          documentRecord.displayStatus ===
          'expiring soon',
      ),
    [filteredDocuments],
  )

  const healthyDocuments = useMemo(
    () =>
      filteredDocuments.filter(
        (documentRecord) =>
          documentRecord.displayStatus ===
          'valid',
      ),
    [filteredDocuments],
  )

  const nonExpiredDocuments = useMemo(
    () =>
      filteredDocuments.filter(
        (documentRecord) =>
          documentRecord.displayStatus !==
          'expired',
      ),
    [filteredDocuments],
  )

  const complianceScore =
    filteredDocuments.length > 0
      ? Math.round(
          (nonExpiredDocuments.length /
            filteredDocuments.length) *
            100,
        )
      : 0

  const recentDocuments = useMemo(
    () =>
      [...filteredDocuments]
        .sort(
          (a, b) =>
            new Date(
              b.created_at || 0,
            ).getTime() -
            new Date(
              a.created_at || 0,
            ).getTime(),
        )
        .slice(0, 5),
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
        value:
          expiringSoonDocuments.length,
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

  const hasPieData = useMemo(
    () =>
      pieData.some(
        (item) => item.value > 0,
      ),
    [pieData],
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
        total:
          expiringSoonDocuments.length,
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

  const complianceSnapshotData = useMemo(
    () => [
      {
        name: 'Workers',
        value: filteredWorkers.length,
      },
      {
        name: 'Documents',
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
        value:
          expiringSoonDocuments.length,
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
    const rows = filteredDocuments.map(
      (documentRecord) => {
        const worker =
          getWorkerForDocument(
            documentRecord,
          )

        return {
          Worker:
            worker?.full_name || '-',
          Role: worker?.role || '-',
          Site: worker?.site || '-',
          Document:
            documentRecord.document_type ||
            '-',
          ExpiryDate:
            documentRecord.expiry_date ||
            '-',
          Status:
            documentRecord.displayStatus,
          DaysUntilExpiry:
            documentRecord
              .daysUntilExpiry ?? '-',
          UploadedAt: formatDate(
            documentRecord.created_at,
          ),
        }
      },
    )

    downloadCSV(
      `trustera-compliance-report-${getExportDateStamp()}.csv`,
      rows,
    )
  }

  function exportAuditCSV() {
    const rows = [
      ...filteredWorkers.map(
        (worker) => ({
          Type: 'Worker',
          Name:
            worker.full_name || '-',
          Role: worker.role || '-',
          Site: worker.site || '-',
          Status:
            worker.status || '-',
          CreatedAt: formatDate(
            worker.created_at,
          ),
        }),
      ),

      ...filteredDocuments.map(
        (documentRecord) => {
          const worker =
            getWorkerForDocument(
              documentRecord,
            )

          return {
            Type: 'Document',
            Name:
              documentRecord.document_type ||
              '-',
            Role:
              worker?.role || '-',
            Site:
              worker?.site || '-',
            Status:
              documentRecord.displayStatus,
            CreatedAt: formatDate(
              documentRecord.created_at,
            ),
          }
        },
      ),
    ]

    downloadCSV(
      `trustera-audit-report-${getExportDateStamp()}.csv`,
      rows,
    )
  }

  function exportCompliancePDF() {
    if (!canExportReports) {
      toast.error(
        'Your role does not allow report exports.',
      )
      return
    }

    if (filteredDocuments.length === 0) {
      toast.error(
        'No compliance data to export.',
      )
      return
    }

    const pdf = new jsPDF({
      orientation: 'landscape',
    })

    pdf.setFontSize(18)
    pdf.text(
      'Trustera Compliance Report',
      14,
      18,
    )

    pdf.setFontSize(10)

    pdf.text(
      `Generated: ${new Date().toLocaleString(
        'en-GB',
      )}`,
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
      90,
      38,
    )

    pdf.text(
      `Expiring Soon: ${expiringSoonDocuments.length}`,
      90,
      44,
    )

    autoTable(pdf, {
      startY: 54,
      head: [
        [
          'Worker',
          'Role',
          'Site',
          'Document',
          'Expiry Date',
          'Status',
          'Days Remaining',
        ],
      ],
      body: filteredDocuments.map(
        (documentRecord) => {
          const worker =
            getWorkerForDocument(
              documentRecord,
            )

          return [
            worker?.full_name || '-',
            worker?.role || '-',
            worker?.site || '-',
            documentRecord.document_type ||
              '-',
            formatExpiryDate(
              documentRecord.expiry_date,
            ),
            documentRecord.displayStatus,
            documentRecord
              .daysUntilExpiry ?? '-',
          ]
        },
      ),
      styles: {
        fontSize: 8,
      },
      headStyles: {
        fillColor: [37, 99, 235],
      },
    })

    pdf.save(
      `trustera-compliance-report-${getExportDateStamp()}.pdf`,
    )

    toast.success(
      'Compliance PDF exported.',
    )
  }

  function exportAuditPDF() {
    if (!canExportReports) {
      toast.error(
        'Your role does not allow report exports.',
      )
      return
    }

    if (
      filteredWorkers.length === 0 &&
      filteredDocuments.length === 0
    ) {
      toast.error(
        'No audit data to export.',
      )
      return
    }

    const pdf = new jsPDF({
      orientation: 'landscape',
    })

    pdf.setFontSize(18)
    pdf.text(
      'Trustera Audit Report',
      14,
      18,
    )

    pdf.setFontSize(10)

    pdf.text(
      `Generated: ${new Date().toLocaleString(
        'en-GB',
      )}`,
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
        ...filteredWorkers.map(
          (worker) => [
            'Worker',
            worker.full_name || '-',
            worker.role || '-',
            worker.site || '-',
            worker.status || '-',
            formatDate(
              worker.created_at,
            ),
          ],
        ),

        ...filteredDocuments.map(
          (documentRecord) => {
            const worker =
              getWorkerForDocument(
                documentRecord,
              )

            return [
              'Document',
              documentRecord.document_type ||
                '-',
              worker?.role || '-',
              worker?.site || '-',
              documentRecord.displayStatus,
              formatDate(
                documentRecord.created_at,
              ),
            ]
          },
        ),
      ],
      styles: {
        fontSize: 8,
      },
      headStyles: {
        fillColor: [37, 99, 235],
      },
    })

    pdf.save(
      `trustera-audit-report-${getExportDateStamp()}.pdf`,
    )

    toast.success('Audit PDF exported.')
  }

  if (!profile) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingPanel}>
          Loading your Trustera profile...
        </div>
      </div>
    )
  }

  if (!companyId) {
    return (
      <div style={styles.container}>
        <div style={styles.errorPanel}>
          Your account is not assigned to a
          company. Sign out and contact an
          administrator.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.loadingSpinner} />

        <h2 style={styles.loadingTitle}>
          Loading dashboard...
        </h2>

        <p style={styles.loadingText}>
          Retrieving your organisation’s
          workforce and compliance records.
        </p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <p style={styles.eyebrow}>
            Organisation overview
          </p>

          <h1 style={styles.heading}>
            Trustera Dashboard
          </h1>

          <p style={styles.subText}>
            Compliance, workforce and document
            analytics for your organisation.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            fetchDashboardData({
              showFullLoader: false,
              showSuccessMessage: true,
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

      {pageError && (
        <div style={styles.inlineError}>
          {pageError}
        </div>
      )}

      {canExportReports ? (
        <section style={styles.exportCard}>
          <div>
            <h2 style={styles.sectionTitle}>
              Export Reports
            </h2>

            <p
              style={
                styles.sectionDescription
              }
            >
              Download the information currently
              displayed after applying dashboard
              filters.
            </p>
          </div>

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
        </section>
      ) : (
        <section style={styles.accessNotice}>
          <strong>
            Report exports are unavailable for
            your access role.
          </strong>

          <span>
            You can continue to view the
            dashboard information permitted for
            your account.
          </span>
        </section>
      )}

      <section style={styles.filterCard}>
        <div>
          <h2 style={styles.sectionTitle}>
            Dashboard Filters
          </h2>

          <p
            style={styles.sectionDescription}
          >
            Filter workers and their associated
            documents by site, role, status and
            expiry date.
          </p>
        </div>

        <div style={styles.filterGrid}>
          <select
            value={siteFilter}
            onChange={(event) =>
              setSiteFilter(
                event.target.value,
              )
            }
            style={styles.filterInput}
            aria-label="Filter by site"
          >
            <option value="all">
              All Sites
            </option>

            {sites.map((site) => (
              <option
                key={site}
                value={site}
              >
                {site}
              </option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(
                event.target.value,
              )
            }
            style={styles.filterInput}
            aria-label="Filter by worker role"
          >
            <option value="all">
              All Roles
            </option>

            {roles.map((role) => (
              <option
                key={role}
                value={role}
              >
                {role}
              </option>
            ))}
          </select>

          <select
            value={workerStatusFilter}
            onChange={(event) =>
              setWorkerStatusFilter(
                event.target.value,
              )
            }
            style={styles.filterInput}
            aria-label="Filter by worker status"
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
              setDocumentStatusFilter(
                event.target.value,
              )
            }
            style={styles.filterInput}
            aria-label="Filter by document status"
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
              setStartDate(
                event.target.value,
              )
            }
            style={styles.filterInput}
            aria-label="Expiry start date"
          />

          <input
            type="date"
            value={endDate}
            onChange={(event) =>
              setEndDate(
                event.target.value,
              )
            }
            style={styles.filterInput}
            aria-label="Expiry end date"
          />

          <button
            type="button"
            onClick={resetFilters}
            style={styles.resetButton}
          >
            Reset Filters
          </button>
        </div>
      </section>

      <section style={styles.statsGrid}>
        <StatCard
          title="Total Workers"
          value={filteredWorkers.length}
          icon="◉"
          accent="#3b82f6"
          helper="People in the current view"
        />

        <StatCard
          title="Active Workers"
          value={activeWorkers.length}
          icon="✓"
          accent="#22c55e"
          helper="Currently active"
        />

        <StatCard
          title="Inactive Workers"
          value={inactiveWorkers.length}
          icon="–"
          accent="#94a3b8"
          helper="Currently inactive"
        />

        <StatCard
          title="Total Documents"
          value={filteredDocuments.length}
          icon="▤"
          accent="#60a5fa"
          helper="Records matching the filters"
        />

        <StatCard
          title="Valid Documents"
          value={healthyDocuments.length}
          icon={STATUS_META.valid.icon}
          accent={
            STATUS_META.valid.colour
          }
          helper="Current and not expiring soon"
        />

        <StatCard
          title="Expired Docs"
          value={expiredDocuments.length}
          icon={STATUS_META.expired.icon}
          accent={
            STATUS_META.expired.colour
          }
          helper="Require immediate attention"
        />

        <StatCard
          title="Expiring Soon"
          value={
            expiringSoonDocuments.length
          }
          icon={
            STATUS_META.expiringSoon.icon
          }
          accent={
            STATUS_META.expiringSoon
              .colour
          }
          helper={`Due within ${EXPIRY_WARNING_DAYS} days`}
        />

        <StatCard
          title="Compliance Score"
          value={`${complianceScore}%`}
          icon="↗"
          accent="#a855f7"
          helper="Documents not yet expired"
        />
      </section>

      <section style={styles.statusGuideCard}>
        <div>
          <h2 style={styles.sectionTitle}>
            Document status guide
          </h2>

          <p
            style={styles.sectionDescription}
          >
            The dashboard uses these indicators
            throughout charts, alerts and tables.
          </p>
        </div>

        <div style={styles.statusGuideGrid}>
          <StatusLegendItem
            colour={
              STATUS_META.valid.colour
            }
            background={
              STATUS_META.valid.background
            }
            icon={STATUS_META.valid.icon}
            label={STATUS_META.valid.label}
            description={
              STATUS_META.valid
                .description
            }
            count={healthyDocuments.length}
          />

          <StatusLegendItem
            colour={
              STATUS_META.expiringSoon
                .colour
            }
            background={
              STATUS_META.expiringSoon
                .background
            }
            icon={
              STATUS_META.expiringSoon.icon
            }
            label={
              STATUS_META.expiringSoon.label
            }
            description={
              STATUS_META.expiringSoon
                .description
            }
            count={
              expiringSoonDocuments.length
            }
          />

          <StatusLegendItem
            colour={
              STATUS_META.expired.colour
            }
            background={
              STATUS_META.expired
                .background
            }
            icon={STATUS_META.expired.icon}
            label={STATUS_META.expired.label}
            description={
              STATUS_META.expired
                .description
            }
            count={expiredDocuments.length}
          />
        </div>
      </section>

      <section style={styles.chartGrid}>
        <div style={styles.chartCard}>
          <div style={styles.chartHeader}>
            <div>
              <h2
                style={styles.sectionTitle}
              >
                Compliance Overview
              </h2>

              <p
                style={
                  styles.sectionDescription
                }
              >
                Distribution of valid, expiring
                and expired documents.
              </p>
            </div>

            <span
              style={styles.chartIndicator}
            >
              ● Live data
            </span>
          </div>

          {hasPieData ? (
            <ResponsiveContainer
              width="100%"
              height={240}
            >
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={78}
                  innerRadius={42}
                  paddingAngle={2}
                  dataKey="value"
                  label={({
                    name,
                    value,
                  }) =>
                    value > 0
                      ? `${name} (${value})`
                      : ''
                  }
                >
                  {pieData.map(
                    (entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={
                          CHART_COLOURS[
                            index %
                              CHART_COLOURS.length
                          ]
                        }
                      />
                    ),
                  )}
                </Pie>

                <Tooltip
                  contentStyle={
                    styles.tooltip
                  }
                  formatter={(
                    value,
                    name,
                  ) => [value, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No document data matches the selected filters." />
          )}

          <div style={styles.inlineLegend}>
            <LegendItem
              colour={
                STATUS_META.valid.colour
              }
              label="Valid"
              value={
                healthyDocuments.length
              }
            />

            <LegendItem
              colour={
                STATUS_META.expiringSoon
                  .colour
              }
              label="Expiring Soon"
              value={
                expiringSoonDocuments.length
              }
            />

            <LegendItem
              colour={
                STATUS_META.expired.colour
              }
              label="Expired"
              value={
                expiredDocuments.length
              }
            />
          </div>
        </div>

        <div style={styles.chartCard}>
          <div style={styles.chartHeader}>
            <div>
              <h2
                style={styles.sectionTitle}
              >
                Workforce Analytics
              </h2>

              <p
                style={
                  styles.sectionDescription
                }
              >
                Side-by-side view of people and
                document volumes.
              </p>
            </div>

            <span
              style={styles.chartIndicator}
            >
              ▮ Comparison
            </span>
          </div>

          <ResponsiveContainer
            width="100%"
            height={270}
          >
            <BarChart data={barData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#334155"
              />

              <XAxis
                dataKey="name"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
              />

              <YAxis
                allowDecimals={false}
                stroke="#94a3b8"
              />

              <Tooltip
                contentStyle={
                  styles.tooltip
                }
              />

              <Bar
                dataKey="total"
                fill="#3b82f6"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>

          <div style={styles.chartNote}>
            Blue bars show totals after the
            selected dashboard filters are
            applied.
          </div>
        </div>
      </section>

      <section style={styles.chartCardFull}>
        <div style={styles.chartHeader}>
          <div>
            <h2 style={styles.sectionTitle}>
              Compliance Snapshot
            </h2>

            <p
              style={
                styles.sectionDescription
              }
            >
              A comparative view of the main
              workforce compliance measures in
              the current dashboard.
            </p>
          </div>

          <span
            style={styles.chartIndicator}
          >
            ↗ Snapshot
          </span>
        </div>

        <ResponsiveContainer
          width="100%"
          height={260}
        >
          <LineChart
            data={complianceSnapshotData}
          >
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

            <Tooltip
              contentStyle={styles.tooltip}
            />

            <Line
              type="monotone"
              dataKey="value"
              stroke="#22c55e"
              strokeWidth={3}
              dot={{
                r: 4,
                fill: '#22c55e',
                stroke: '#bbf7d0',
                strokeWidth: 1,
              }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>

        <div style={styles.chartNote}>
          This is a comparative snapshot, not a
          historical time-series chart.
        </div>
      </section>

      <section style={styles.alertCard}>
        <h2 style={styles.sectionTitle}>
          Compliance Alerts
        </h2>

        <p style={styles.sectionDescription}>
          Current compliance issues within the
          selected dashboard filters.
        </p>

        {expiredDocuments.length > 0 && (
          <div style={styles.alertDanger}>
            <strong>
              {expiredDocuments.length}{' '}
              expired document
              {expiredDocuments.length === 1
                ? ''
                : 's'}
            </strong>{' '}
            require immediate attention.
          </div>
        )}

        {expiringSoonDocuments.length >
          0 && (
          <div style={styles.alertWarning}>
            <strong>
              {
                expiringSoonDocuments.length
              }{' '}
              document
              {expiringSoonDocuments.length ===
              1
                ? ''
                : 's'}
            </strong>{' '}
            expire within{' '}
            {EXPIRY_WARNING_DAYS} days.
          </div>
        )}

        {expiredDocuments.length === 0 &&
          expiringSoonDocuments.length ===
            0 && (
            <div
              style={styles.alertSuccess}
            >
              All documents in the current view
              are up to date.
            </div>
          )}
      </section>

      <section style={styles.recentCard}>
        <div>
          <h2 style={styles.sectionTitle}>
            Recent Documents
          </h2>

          <p
            style={styles.sectionDescription}
          >
            The five most recently uploaded
            document records matching the
            selected filters.
          </p>
        </div>

        {recentDocuments.length === 0 ? (
          <p style={styles.emptyText}>
            No documents match the selected
            filters.
          </p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>
                    Worker
                  </th>

                  <th style={styles.th}>
                    Document
                  </th>

                  <th style={styles.th}>
                    Expiry Date
                  </th>

                  <th style={styles.th}>
                    Status
                  </th>

                  <th style={styles.th}>
                    Time Remaining
                  </th>
                </tr>
              </thead>

              <tbody>
                {recentDocuments.map(
                  (documentRecord) => {
                    const worker =
                      getWorkerForDocument(
                        documentRecord,
                      )

                    return (
                      <tr
                        key={
                          documentRecord.id
                        }
                      >
                        <td style={styles.td}>
                          {worker?.full_name ||
                            '-'}
                        </td>

                        <td style={styles.td}>
                          {documentRecord.document_type ||
                            '-'}
                        </td>

                        <td style={styles.td}>
                          {formatExpiryDate(
                            documentRecord.expiry_date,
                          )}
                        </td>

                        <td style={styles.td}>
                          <DocumentStatusBadge
                            status={
                              documentRecord.displayStatus
                            }
                          />
                        </td>

                        <td style={styles.td}>
                          <ExpiryText
                            documentRecord={
                              documentRecord
                            }
                          />
                        </td>
                      </tr>
                    )
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function ExpiryText({ documentRecord }) {
  const days =
    documentRecord.daysUntilExpiry

  if (days === null) {
    return (
      <span style={styles.mutedText}>
        No expiry date
      </span>
    )
  }

  if (days < 0) {
    const overdueDays = Math.abs(days)

    return (
      <span style={styles.expiredText}>
        Expired {overdueDays}{' '}
        day{overdueDays === 1 ? '' : 's'} ago
      </span>
    )
  }

  if (days === 0) {
    return (
      <span style={styles.warningText}>
        Expires today
      </span>
    )
  }

  if (days <= EXPIRY_WARNING_DAYS) {
    return (
      <span style={styles.warningText}>
        {days} day{days === 1 ? '' : 's'}{' '}
        remaining
      </span>
    )
  }

  return (
    <span style={styles.validText}>
      {days} day{days === 1 ? '' : 's'}{' '}
      remaining
    </span>
  )
}

function DocumentStatusBadge({ status }) {
  const badgeStyle =
    status === 'expired'
      ? styles.expiredBadge
      : status === 'expiring soon'
        ? styles.warningBadge
        : styles.validBadge

  return (
    <span
      style={{
        ...styles.badge,
        ...badgeStyle,
      }}
    >
      {status}
    </span>
  )
}

function ChartEmptyState({ message }) {
  return (
    <div style={styles.chartEmptyState}>
      <div style={styles.chartEmptyIcon}>
        ◫
      </div>

      <strong>No chart data</strong>

      <span>{message}</span>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
  accent = '#3b82f6',
  helper,
}) {
  return (
    <article style={styles.card}>
      <div
        style={{
          ...styles.statIcon,
          background: `${accent}22`,
          borderColor: `${accent}55`,
          color: accent,
        }}
        aria-hidden="true"
      >
        {icon}
      </div>

      <div>
        <div style={styles.cardValue}>
          {value}
        </div>

        <div style={styles.cardTitle}>
          {title}
        </div>

        {helper && (
          <p style={styles.cardHelper}>
            {helper}
          </p>
        )}
      </div>
    </article>
  )
}

function LegendItem({
  colour,
  label,
  value,
}) {
  return (
    <div style={styles.legendItem}>
      <span
        aria-hidden="true"
        style={{
          ...styles.legendDot,
          background: colour,
        }}
      />

      <span>{label}</span>

      <strong style={styles.legendValue}>
        {value}
      </strong>
    </div>
  )
}

function StatusLegendItem({
  colour,
  background,
  icon,
  label,
  description,
  count,
}) {
  return (
    <article style={styles.statusLegendItem}>
      <div
        style={{
          ...styles.statusLegendIcon,
          color: colour,
          background,
          borderColor: `${colour}66`,
        }}
        aria-hidden="true"
      >
        {icon}
      </div>

      <div style={styles.statusLegendContent}>
        <div
          style={
            styles.statusLegendTitleRow
          }
        >
          <strong>{label}</strong>

          <span
            style={{
              ...styles.statusCount,
              color: colour,
              borderColor: `${colour}55`,
              background: `${colour}16`,
            }}
          >
            {count}
          </span>
        </div>

        <span
          style={
            styles.statusLegendDescription
          }
        >
          {description}
        </span>
      </div>
    </article>
  )
}

const styles = {
  container: {
    padding: '28px',
    color: '#ffffff',
    background: '#020617',
    minHeight: '100vh',
  },

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '24px',
  },

  eyebrow: {
    margin: '0 0 7px',
    color: '#60a5fa',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },

  heading: {
    margin: 0,
    fontSize: '26px',
  },

  subText: {
    color: '#94a3b8',
    margin: '8px 0 0',
    lineHeight: 1.6,
  },

  refreshButton: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    padding: '12px 18px',
    borderRadius: '10px',
    fontWeight: 700,
    cursor: 'pointer',
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.65,
  },

  inlineError: {
    padding: '14px 16px',
    border: '1px solid #7f1d1d',
    borderRadius: '12px',
    background: '#450a0a',
    color: '#fecaca',
    marginBottom: '24px',
  },

  exportCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '24px',
  },

  exportGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },

  exportButton: {
    minHeight: '44px',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  accessNotice: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    padding: '16px',
    border: '1px solid #334155',
    borderRadius: '14px',
    background: '#0f172a',
    color: '#cbd5e1',
    marginBottom: '24px',
  },

  filterCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '24px',
  },

  filterGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(175px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },

  filterInput: {
    minHeight: '44px',
    padding: '11px 12px',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#ffffff',
    width: '100%',
    boxSizing: 'border-box',
  },

  resetButton: {
    minHeight: '44px',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#475569',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },

  card: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '18px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    minHeight: '110px',
    boxSizing: 'border-box',
  },

  statIcon: {
    width: '42px',
    height: '42px',
    flexShrink: 0,
    borderRadius: '12px',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: 800,
  },

  cardValue: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 800,
  },

  cardTitle: {
    marginTop: '4px',
    fontWeight: 700,
  },

  cardHelper: {
    margin: '6px 0 0',
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: 1.45,
  },

  statusGuideCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '24px',
  },

  statusGuideGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },

  statusLegendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px',
    borderRadius: '12px',
    background: '#020617',
    border: '1px solid #1e293b',
  },

  statusLegendIcon: {
    width: '38px',
    height: '38px',
    borderRadius: '999px',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    fontSize: '18px',
    flexShrink: 0,
  },

  statusLegendContent: {
    minWidth: 0,
    width: '100%',
  },

  statusLegendTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },

  statusCount: {
    minWidth: '30px',
    padding: '3px 8px',
    borderRadius: '999px',
    border: '1px solid',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: 800,
  },

  statusLegendDescription: {
    display: 'block',
    marginTop: '4px',
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: 1.45,
  },

  chartGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
  },

  chartCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    minHeight: '390px',
    boxSizing: 'border-box',
  },

  chartCardFull: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    minHeight: '390px',
    marginBottom: '24px',
    boxSizing: 'border-box',
  },

  chartHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '6px',
  },

  sectionTitle: {
    margin: 0,
    fontSize: '18px',
  },

  sectionDescription: {
    margin: '6px 0 0',
    color: '#94a3b8',
    fontSize: '13px',
    lineHeight: 1.5,
  },

  chartIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '999px',
    border: '1px solid #334155',
    background: '#020617',
    color: '#93c5fd',
    fontSize: '12px',
    fontWeight: 700,
  },

  chartEmptyState: {
    height: '240px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: '#94a3b8',
    textAlign: 'center',
  },

  chartEmptyIcon: {
    width: '46px',
    height: '46px',
    borderRadius: '999px',
    background: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#60a5fa',
    fontSize: '20px',
  },

  inlineLegend: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '12px 20px',
    marginTop: '4px',
  },

  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: '#cbd5e1',
    fontSize: '13px',
  },

  legendDot: {
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    flexShrink: 0,
  },

  legendValue: {
    color: '#ffffff',
  },

  chartNote: {
    marginTop: '4px',
    color: '#64748b',
    fontSize: '12px',
    textAlign: 'center',
  },

  tooltip: {
    background: '#020617',
    border: '1px solid #334155',
    borderRadius: '10px',
    color: '#ffffff',
  },

  alertCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '24px',
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
    padding: '30px 0 10px',
    textAlign: 'center',
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
    fontWeight: 700,
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
  },

  validText: {
    color: '#86efac',
    fontSize: '13px',
  },

  warningText: {
    color: '#fde68a',
    fontSize: '13px',
  },

  expiredText: {
    color: '#fca5a5',
    fontSize: '13px',
  },

  mutedText: {
    color: '#94a3b8',
    fontSize: '13px',
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

  loadingPanel: {
    maxWidth: '640px',
    margin: '80px auto',
    padding: '24px',
    border: '1px solid #334155',
    borderRadius: '12px',
    background: '#0f172a',
    color: '#cbd5e1',
    textAlign: 'center',
  },

  loadingPage: {
    minHeight: 'calc(100vh - 72px)',
    padding: '24px',
    background: '#020617',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingSpinner: {
    width: '38px',
    height: '38px',
    border: '4px solid #1e293b',
    borderTopColor: '#3b82f6',
    borderRadius: '999px',
    animation:
      'trustera-dashboard-spin 0.8s linear infinite',
  },

  loadingTitle: {
    margin: '18px 0 0',
  },

  loadingText: {
    margin: '8px 0 0',
    color: '#94a3b8',
    textAlign: 'center',
  },
}