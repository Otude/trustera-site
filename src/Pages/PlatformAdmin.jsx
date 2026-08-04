// src/Pages/PlatformAdmin.jsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import toast from 'react-hot-toast'

import { supabase } from '../supabase'

const INITIAL_COMPANY_FORM = {
  companyName: '',
  adminName: '',
  adminEmail: '',
}

const COMPANY_STATUSES = [
  'active',
  'pending',
  'suspended',
  'archived',
]

function normaliseRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
}

function normaliseStatus(status) {
  return String(status || 'pending')
    .trim()
    .toLowerCase()
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(email || '').trim(),
  )
}


function getEmailPrefix(email) {
  const value = String(email || '').trim()

  if (!value) return 'Trustera user'

  return value.includes('@')
    ? value.split('@')[0]
    : value
}

function getSafeUserName(userProfile, matchingInvitation = null) {
  return (
    String(userProfile?.full_name || '').trim() ||
    String(matchingInvitation?.full_name || '').trim() ||
    getEmailPrefix(userProfile?.email || matchingInvitation?.email)
  )
}

function getInvitationDisplayName(invitation) {
  return (
    String(invitation?.full_name || '').trim() ||
    getEmailPrefix(invitation?.email)
  )
}

function getCompanyStatusStyle(status) {
  const value = normaliseStatus(status)

  if (value === 'active') {
    return styles.statusActive
  }

  if (value === 'suspended') {
    return styles.statusSuspended
  }

  if (value === 'archived') {
    return styles.statusArchived
  }

  return styles.statusPending
}

function getLeadStatusStyle(status) {
  const value = normaliseStatus(status)

  if (
    value === 'converted' ||
    value === 'approved' ||
    value === 'contacted'
  ) {
    return styles.statusActive
  }

  if (
    value === 'rejected' ||
    value === 'closed'
  ) {
    return styles.statusArchived
  }

  return styles.statusPending
}

export default function PlatformAdmin({ profile, isPlatformAdmin = false }) {
  const [companies, setCompanies] = useState([])
  const [profiles, setProfiles] = useState([])
  const [invitations, setInvitations] = useState([])
  const [leads, setLeads] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creatingCompany, setCreatingCompany] =
    useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] =
    useState('all')

  const [activeTab, setActiveTab] =
    useState('companies')

  const [companyForm, setCompanyForm] = useState(
    INITIAL_COMPANY_FORM,
  )

  const [selectedCompany, setSelectedCompany] =
    useState(null)

  const hasPlatformAdminAccess =
    Boolean(isPlatformAdmin) ||
    normaliseRole(profile?.role) === 'platform_admin'

  const fetchPlatformData = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!hasPlatformAdminAccess) return

      if (showLoading) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const [
          companiesResponse,
          profilesResponse,
          invitationsResponse,
          leadsResponse,
        ] = await Promise.all([
          supabase
            .from('companies')
            .select(`
              id,
              name,
              status,
              created_at
            `)
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('profiles')
            .select(`
              id,
              company_id,
              email,
              full_name,
              role,
              created_at
            `)
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('company_invitations')
            .select(`
              id,
              company_id,
              email,
              full_name,
              role,
              status,
              auth_user_id,
              invited_at,
              expires_at,
              created_at,
              updated_at
            `)
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('early_access_leads')
            .select(`
              id,
              name,
              company,
              email,
              industry,
              challenge,
              status,
              source,
              contacted,
              created_at
            `)
            .order('created_at', {
              ascending: false,
            }),
        ])

        if (companiesResponse.error) {
          throw companiesResponse.error
        }

        if (profilesResponse.error) {
          throw profilesResponse.error
        }

        if (invitationsResponse.error) {
          throw invitationsResponse.error
        }

        if (leadsResponse.error) {
          console.warn(
            'Unable to load early-access leads:',
            leadsResponse.error,
          )
        }

        setCompanies(
          companiesResponse.data || [],
        )

        setProfiles(
          profilesResponse.data || [],
        )

        setInvitations(
          invitationsResponse.data || [],
        )

        setLeads(
          leadsResponse.data || [],
        )
      } catch (error) {
        console.error(
          'Unable to load platform administration data:',
          error,
        )

        toast.error(
          error?.message ||
            'Unable to load platform administration data.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [hasPlatformAdminAccess],
  )

  useEffect(() => {
    fetchPlatformData()
  }, [fetchPlatformData])

  useEffect(() => {
    if (!hasPlatformAdminAccess) return undefined

    const companiesChannel = supabase
      .channel('platform-admin-companies')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'companies',
        },
        () => {
          fetchPlatformData({
            showLoading: false,
          })
        },
      )
      .subscribe()

    const profilesChannel = supabase
      .channel('platform-admin-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchPlatformData({
            showLoading: false,
          })
        },
      )
      .subscribe()

    const invitationsChannel = supabase
      .channel('platform-admin-invitations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_invitations',
        },
        () => {
          fetchPlatformData({
            showLoading: false,
          })
        },
      )
      .subscribe()

    const leadsChannel = supabase
      .channel('platform-admin-leads')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'early_access_leads',
        },
        () => {
          fetchPlatformData({
            showLoading: false,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(companiesChannel)
      supabase.removeChannel(profilesChannel)
      supabase.removeChannel(invitationsChannel)
      supabase.removeChannel(leadsChannel)
    }
  }, [fetchPlatformData, hasPlatformAdminAccess])

  const companyRows = useMemo(() => {
    return companies.map((company) => {
      const companyUsers = profiles.filter(
        (userProfile) =>
          userProfile.company_id === company.id,
      )

      const companyInvitations = invitations.filter(
        (invitation) =>
          invitation.company_id === company.id,
      )

      const administrators =
        companyUsers.filter(
          (userProfile) =>
            normaliseRole(userProfile.role) ===
            'admin',
        )

      const adminInvitations =
        companyInvitations.filter(
          (invitation) =>
            normaliseRole(invitation.role) ===
            'admin',
        )

      return {
        ...company,
        users: companyUsers,
        invitations: companyInvitations,
        adminInvitations,
        userCount: companyUsers.length,
        administratorCount:
          administrators.length,
        administrators,
      }
    })
  }, [companies, invitations, profiles])

  const filteredCompanies = useMemo(() => {
    const search = searchTerm
      .trim()
      .toLowerCase()

    return companyRows.filter((company) => {
      const matchesStatus =
        statusFilter === 'all' ||
        normaliseStatus(company.status) ===
          statusFilter

      const administratorText =
        company.administrators
          .map(
            (administrator) =>
              `${administrator.full_name || ''} ${
                administrator.email || ''
              }`,
          )
          .join(' ')
          .toLowerCase()

      const matchesSearch =
        !search ||
        String(company.name || '')
          .toLowerCase()
          .includes(search) ||
        administratorText.includes(search)

      return matchesStatus && matchesSearch
    })
  }, [
    companyRows,
    searchTerm,
    statusFilter,
  ])

  const platformStats = useMemo(() => {
    const activeCompanies =
      companies.filter(
        (company) =>
          normaliseStatus(company.status) ===
          'active',
      ).length

    const companyAdmins =
      profiles.filter(
        (userProfile) =>
          normaliseRole(userProfile.role) ===
          'admin',
      ).length

    const staffUsers =
      profiles.filter((userProfile) =>
        ['manager', 'staff', 'user'].includes(
          normaliseRole(userProfile.role),
        ),
      ).length

    const pendingLeads =
      leads.filter((lead) => {
        const status = normaliseStatus(
          lead.status,
        )

        return (
          !lead.contacted &&
          ![
            'converted',
            'approved',
            'rejected',
            'closed',
          ].includes(status)
        )
      }).length

    return {
      totalCompanies: companies.length,
      activeCompanies,
      companyAdmins,
      staffUsers,
      pendingLeads,
    }
  }, [companies, profiles, leads])

  function handleCompanyFormChange(event) {
    const { name, value } = event.target

    setCompanyForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function handleCreateCompany(event) {
    event.preventDefault()

    if (creatingCompany) return

    const payload = {
      companyName:
        companyForm.companyName.trim(),
      adminName:
        companyForm.adminName.trim(),
      adminEmail:
        companyForm.adminEmail
          .trim()
          .toLowerCase(),
    }

    if (
      !payload.companyName ||
      !payload.adminName ||
      !payload.adminEmail
    ) {
      toast.error(
        'Complete the company name, administrator name and administrator email.',
      )
      return
    }

    if (!isValidEmail(payload.adminEmail)) {
      toast.error(
        'Enter a valid administrator email address.',
      )
      return
    }

    const companyAlreadyExists =
      companies.some(
        (company) =>
          String(company.name || '')
            .trim()
            .toLowerCase() ===
          payload.companyName.toLowerCase(),
      )

    if (companyAlreadyExists) {
      toast.error(
        'A company with this name already exists.',
      )
      return
    }

    const userAlreadyExists =
      profiles.some(
        (userProfile) =>
          String(userProfile.email || '')
            .trim()
            .toLowerCase() ===
          payload.adminEmail,
      )

    if (userAlreadyExists) {
      toast.error(
        'A Trustera user with this email already exists.',
      )
      return
    }

    setCreatingCompany(true)

    let createdCompanyId = null

    try {
      const {
        data: createdCompany,
        error: companyError,
      } = await supabase
        .from('companies')
        .insert({
          name: payload.companyName,
          status: 'pending',
        })
        .select(`
          id,
          name,
          status,
          created_at
        `)
        .single()

      if (companyError) {
        throw companyError
      }

      createdCompanyId = createdCompany.id

      const {
        data: invitationData,
        error: invitationError,
      } = await supabase.functions.invoke(
        'invite-company-user',
        {
          body: {
            companyId: createdCompany.id,
            email: payload.adminEmail,
            fullName: payload.adminName,
            role: 'admin',
          },
        },
      )

      if (invitationError) {
        throw invitationError
      }

      if (
        invitationData?.success === false ||
        invitationData?.error
      ) {
        throw new Error(
          invitationData.error ||
            'The administrator invitation could not be sent.',
        )
      }

      await supabase
        .from('companies')
        .update({
          status: 'active',
        })
        .eq('id', createdCompany.id)

      toast.success(
        `${createdCompany.name} was created and the administrator invitation was sent.`,
      )

      setCompanyForm(INITIAL_COMPANY_FORM)

      await fetchPlatformData({
        showLoading: false,
      })
    } catch (error) {
      console.error(
        'Unable to create customer company:',
        error,
      )

      /*
       * A company should not normally be deleted
       * automatically if the invitation fails, because
       * the failure may be temporary. Keeping it as
       * "pending" lets the platform administrator retry.
       */

      if (createdCompanyId) {
        await supabase
          .from('companies')
          .update({
            status: 'pending',
          })
          .eq('id', createdCompanyId)
      }

      toast.error(
        error?.message ||
          'The company could not be created.',
      )

      await fetchPlatformData({
        showLoading: false,
      })
    } finally {
      setCreatingCompany(false)
    }
  }

  async function updateCompanyStatus(
    companyId,
    newStatus,
  ) {
    if (!companyId) return

    const confirmed = window.confirm(
      `Change this company’s status to "${newStatus}"?`,
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('companies')
      .update({
        status: newStatus,
      })
      .eq('id', companyId)

    if (error) {
      console.error(
        'Unable to update company status:',
        error,
      )

      toast.error(
        error.message ||
          'Unable to update the company status.',
      )
      return
    }

    toast.success(
      `Company status changed to ${newStatus}.`,
    )

    setSelectedCompany((current) =>
      current?.id === companyId
        ? {
            ...current,
            status: newStatus,
          }
        : current,
    )

    await fetchPlatformData({
      showLoading: false,
    })
  }

  async function resendAdministratorInvite(
    company,
  ) {
    const administrator =
      company.administrators?.[0]

    const administratorInvitation =
      company.adminInvitations?.find(
        (invitation) =>
          ['pending', 'expired', 'accepted'].includes(
            normaliseStatus(invitation.status),
          ),
      ) || company.adminInvitations?.[0]

    const administratorEmail =
      administrator?.email ||
      administratorInvitation?.email ||
      ''

    const administratorName =
      getSafeUserName(
        administrator,
        administratorInvitation,
      )

    if (!administratorEmail) {
      toast.error(
        'No company administrator email was found.',
      )
      return
    }

    try {
      const {
        data,
        error,
      } = await supabase.functions.invoke(
        'invite-company-user',
        {
          body: {
            companyId: company.id,
            email: administratorEmail,
            fullName: administratorName,
            role: 'admin',
            resend: true,
          },
        },
      )

      if (error) {
        throw error
      }

      if (
        data?.success === false ||
        data?.error
      ) {
        throw new Error(
          data.error ||
            'The invitation could not be resent.',
        )
      }

      toast.success(
        `Invitation resent to ${administratorEmail}.`,
      )
    } catch (error) {
      console.error(
        'Unable to resend administrator invitation:',
        error,
      )

      toast.error(
        error?.message ||
          'Unable to resend the invitation.',
      )
    }
  }

  async function updateLeadStatus(
    leadId,
    updates,
  ) {
    const { error } = await supabase
      .from('early_access_leads')
      .update(updates)
      .eq('id', leadId)

    if (error) {
      console.error(
        'Unable to update lead:',
        error,
      )

      toast.error(
        error.message ||
          'Unable to update the lead.',
      )
      return
    }

    toast.success('Lead updated.')

    await fetchPlatformData({
      showLoading: false,
    })
  }

  if (!hasPlatformAdminAccess) {
    return (
      <AccessDenied
        profileRole={profile?.role}
      />
    )
  }

  if (loading) {
    return (
      <PageLoading message="Loading platform administration..." />
    )
  }

  return (
    <main style={styles.page}>
      <section style={styles.pageHeader}>
        <div>
          <p style={styles.eyebrow}>
            Trustera control centre
          </p>

          <h1 style={styles.pageTitle}>
            Platform Administration
          </h1>

          <p style={styles.pageDescription}>
            Manage customer companies, company
            administrators, platform users and
            onboarding requests.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            fetchPlatformData({
              showLoading: false,
            })
          }
          disabled={refreshing}
          style={{
            ...styles.refreshButton,
            ...(refreshing
              ? styles.disabledButton
              : {}),
          }}
        >
          {refreshing
            ? 'Refreshing...'
            : '↻ Refresh'}
        </button>
      </section>

      <section style={styles.statsGrid}>
        <StatCard
          icon="🏢"
          label="Customer Companies"
          value={platformStats.totalCompanies}
          description="All Trustera customer organisations"
          tone="blue"
        />

        <StatCard
          icon="✓"
          label="Active Companies"
          value={platformStats.activeCompanies}
          description="Companies currently able to use Trustera"
          tone="green"
        />

        <StatCard
          icon="👤"
          label="Company Admins"
          value={platformStats.companyAdmins}
          description="Customer administrator accounts"
          tone="purple"
        />

        <StatCard
          icon="👥"
          label="Staff Users"
          value={platformStats.staffUsers}
          description="Managers and company staff"
          tone="cyan"
        />

        <StatCard
          icon="✉"
          label="Pending Enquiries"
          value={platformStats.pendingLeads}
          description="Demo or early-access requests"
          tone="amber"
        />
      </section>

      <section style={styles.tabBar}>
        <button
          type="button"
          onClick={() =>
            setActiveTab('companies')
          }
          style={{
            ...styles.tabButton,
            ...(activeTab === 'companies'
              ? styles.activeTabButton
              : {}),
          }}
        >
          Companies
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab('users')
          }
          style={{
            ...styles.tabButton,
            ...(activeTab === 'users'
              ? styles.activeTabButton
              : {}),
          }}
        >
          Platform Users
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab('leads')
          }
          style={{
            ...styles.tabButton,
            ...(activeTab === 'leads'
              ? styles.activeTabButton
              : {}),
          }}
        >
          Demo Requests
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab('create-company')
          }
          style={{
            ...styles.tabButton,
            ...(activeTab ===
            'create-company'
              ? styles.activeTabButton
              : {}),
          }}
        >
          Add Company
        </button>
      </section>

      {activeTab === 'companies' && (
        <CompaniesSection
          companies={filteredCompanies}
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          setSearchTerm={setSearchTerm}
          setStatusFilter={setStatusFilter}
          setSelectedCompany={
            setSelectedCompany
          }
          updateCompanyStatus={
            updateCompanyStatus
          }
          resendAdministratorInvite={
            resendAdministratorInvite
          }
        />
      )}

      {activeTab === 'users' && (
        <UsersSection
          profiles={profiles}
          companies={companies}
          invitations={invitations}
        />
      )}

      {activeTab === 'leads' && (
        <LeadsSection
          leads={leads}
          updateLeadStatus={
            updateLeadStatus
          }
          setCompanyForm={setCompanyForm}
          setActiveTab={setActiveTab}
        />
      )}

      {activeTab === 'create-company' && (
        <CreateCompanySection
          companyForm={companyForm}
          handleCompanyFormChange={
            handleCompanyFormChange
          }
          handleCreateCompany={
            handleCreateCompany
          }
          creatingCompany={
            creatingCompany
          }
        />
      )}

      {selectedCompany && (
        <CompanyDetailsModal
          company={selectedCompany}
          onClose={() =>
            setSelectedCompany(null)
          }
          updateCompanyStatus={
            updateCompanyStatus
          }
          resendAdministratorInvite={
            resendAdministratorInvite
          }
        />
      )}
    </main>
  )
}

function StatCard({
  icon,
  label,
  value,
  description,
  tone,
}) {
  const toneStyle = {
    blue: styles.statIconBlue,
    green: styles.statIconGreen,
    purple: styles.statIconPurple,
    cyan: styles.statIconCyan,
    amber: styles.statIconAmber,
  }[tone]

  return (
    <article style={styles.statCard}>
      <div
        style={{
          ...styles.statIcon,
          ...toneStyle,
        }}
      >
        {icon}
      </div>

      <div>
        <div style={styles.statValue}>
          {value}
        </div>

        <div style={styles.statLabel}>
          {label}
        </div>

        <div
          style={styles.statDescription}
        >
          {description}
        </div>
      </div>
    </article>
  )
}

function CompaniesSection({
  companies,
  searchTerm,
  statusFilter,
  setSearchTerm,
  setStatusFilter,
  setSelectedCompany,
  updateCompanyStatus,
  resendAdministratorInvite,
}) {
  const invitationByEmail = useMemo(() => {
    return Object.fromEntries(
      (invitations || [])
        .filter((invitation) => invitation.email)
        .map((invitation) => [
          String(invitation.email).toLowerCase(),
          invitation,
        ]),
    )
  }, [invitations])

  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <div>
          <h2 style={styles.panelTitle}>
            Customer Companies
          </h2>

          <p style={styles.panelDescription}>
            Review customer organisations and
            their current onboarding status.
          </p>
        </div>
      </div>

      <div style={styles.filters}>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) =>
            setSearchTerm(event.target.value)
          }
          placeholder="Search by company or administrator..."
          style={styles.searchInput}
        />

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value,
            )
          }
          style={styles.filterSelect}
        >
          <option value="all">
            All statuses
          </option>

          {COMPANY_STATUSES.map(
            (status) => (
              <option
                key={status}
                value={status}
              >
                {status
                  .charAt(0)
                  .toUpperCase() +
                  status.slice(1)}
              </option>
            ),
          )}
        </select>
      </div>

      {companies.length === 0 ? (
        <EmptyState
          title="No companies found"
          message="No companies match the selected search or status filter."
        />
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <TableHeading>
                  Company
                </TableHeading>

                <TableHeading>
                  Status
                </TableHeading>

                <TableHeading>
                  Administrators
                </TableHeading>

                <TableHeading>
                  Users
                </TableHeading>

                <TableHeading>
                  Created
                </TableHeading>

                <TableHeading>
                  Actions
                </TableHeading>
              </tr>
            </thead>

            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <TableCell>
                    <strong>
                      {company.name}
                    </strong>

                    <div
                      style={styles.identifierText}
                    >
                      {company.id}
                    </div>
                  </TableCell>

                  <TableCell>
                    <StatusBadge
                      status={company.status}
                    />
                  </TableCell>

                  <TableCell>
                    {company.administrators
                      .length === 0 &&
                    company.adminInvitations?.length === 0 ? (
                      <span
                        style={styles.mutedText}
                      >
                        No administrator
                      </span>
                    ) : company.administrators.length > 0 ? (
                      company.administrators.map(
                        (administrator) => (
                          <div
                            key={
                              administrator.id
                            }
                            style={
                              styles.userSummary
                            }
                          >
                            <strong>
                              {getSafeUserName(
                                administrator,
                                company.adminInvitations?.find(
                                  (invitation) =>
                                    String(invitation.email || '')
                                      .toLowerCase() ===
                                    String(administrator.email || '')
                                      .toLowerCase(),
                                ),
                              )}
                            </strong>

                            <span
                              style={
                                styles.emailText
                              }
                            >
                              {
                                administrator.email
                              }
                            </span>
                          </div>
                        ),
                      )
                    ) : (
                      company.adminInvitations.map(
                        (invitation) => (
                          <div
                            key={invitation.id}
                            style={styles.userSummary}
                          >
                            <strong>
                              {getInvitationDisplayName(
                                invitation,
                              )}
                            </strong>

                            <span style={styles.emailText}>
                              {invitation.email}
                            </span>

                            <span style={styles.mutedText}>
                              Invitation {normaliseStatus(
                                invitation.status,
                              )}
                            </span>
                          </div>
                        ),
                      )
                    )}
                  </TableCell>

                  <TableCell>
                    {company.userCount}
                  </TableCell>

                  <TableCell>
                    {formatDate(
                      company.created_at,
                    )}
                  </TableCell>

                  <TableCell>
                    <div
                      style={
                        styles.actionButtons
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCompany(
                            company,
                          )
                        }
                        style={styles.viewButton}
                      >
                        View
                      </button>

                      {(company.administrators
                        .length > 0 ||
                        company.adminInvitations?.length > 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            resendAdministratorInvite(
                              company,
                            )
                          }
                          style={
                            styles.inviteButton
                          }
                        >
                          Resend Invite
                        </button>
                      )}

                      <select
                        value={normaliseStatus(
                          company.status,
                        )}
                        onChange={(event) =>
                          updateCompanyStatus(
                            company.id,
                            event.target.value,
                          )
                        }
                        style={
                          styles.statusSelect
                        }
                        aria-label={`Change ${company.name} status`}
                      >
                        {COMPANY_STATUSES.map(
                          (status) => (
                            <option
                              key={status}
                              value={status}
                            >
                              {status
                                .charAt(0)
                                .toUpperCase() +
                                status.slice(1)}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function UsersSection({
  profiles,
  companies,
  invitations,
}) {
  const companyMap = useMemo(() => {
    return Object.fromEntries(
      companies.map((company) => [
        company.id,
        company.name,
      ]),
    )
  }, [companies])

  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <div>
          <h2 style={styles.panelTitle}>
            Platform Users
          </h2>

          <p style={styles.panelDescription}>
            Review all platform, company
            administrator, manager and staff
            accounts.
          </p>
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          title="No users found"
          message="There are currently no Trustera user profiles."
        />
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <TableHeading>
                  User
                </TableHeading>

                <TableHeading>
                  Company
                </TableHeading>

                <TableHeading>
                  Role
                </TableHeading>

                <TableHeading>
                  Created
                </TableHeading>

                <TableHeading>
                  User ID
                </TableHeading>
              </tr>
            </thead>

            <tbody>
              {profiles.map(
                (userProfile) => (
                  <tr key={userProfile.id}>
                    <TableCell>
                      <div
                        style={
                          styles.userSummary
                        }
                      >
                        <strong>
                          {getSafeUserName(
                            userProfile,
                            invitationByEmail[
                              String(
                                userProfile.email || '',
                              ).toLowerCase()
                            ],
                          )}
                        </strong>

                        <span
                          style={
                            styles.emailText
                          }
                        >
                          {userProfile.email ||
                            'No email recorded'}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {userProfile.company_id
                        ? companyMap[
                            userProfile
                              .company_id
                          ] ||
                          'Unknown company'
                        : 'Trustera platform'}
                    </TableCell>

                    <TableCell>
                      <RoleBadge
                        role={
                          userProfile.role
                        }
                      />
                    </TableCell>

                    <TableCell>
                      {formatDate(
                        userProfile.created_at,
                      )}
                    </TableCell>

                    <TableCell>
                      <span
                        style={
                          styles.identifierText
                        }
                      >
                        {userProfile.id}
                      </span>
                    </TableCell>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function LeadsSection({
  leads,
  updateLeadStatus,
  setCompanyForm,
  setActiveTab,
}) {
  function convertLeadToCompanyForm(lead) {
    setCompanyForm({
      companyName:
        lead.company || '',
      adminName: lead.name || '',
      adminEmail: lead.email || '',
    })

    setActiveTab('create-company')
  }

  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <div>
          <h2 style={styles.panelTitle}>
            Demo and Early-Access Requests
          </h2>

          <p style={styles.panelDescription}>
            Review website enquiries and convert
            qualified prospects into Trustera
            customer companies.
          </p>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="No demo requests"
          message="No demo or early-access requests have been received."
        />
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <TableHeading>
                  Prospect
                </TableHeading>

                <TableHeading>
                  Industry
                </TableHeading>

                <TableHeading>
                  Challenge
                </TableHeading>

                <TableHeading>
                  Status
                </TableHeading>

                <TableHeading>
                  Received
                </TableHeading>

                <TableHeading>
                  Actions
                </TableHeading>
              </tr>
            </thead>

            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <TableCell>
                    <div
                      style={styles.userSummary}
                    >
                      <strong>
                        {lead.name ||
                          'Unnamed prospect'}
                      </strong>

                      <span>
                        {lead.company ||
                          'No company'}
                      </span>

                      <span
                        style={
                          styles.emailText
                        }
                      >
                        {lead.email}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    {lead.industry || '—'}
                  </TableCell>

                  <TableCell>
                    <div
                      style={
                        styles.challengeText
                      }
                    >
                      {lead.challenge ||
                        'No challenge provided.'}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span
                      style={{
                        ...styles.statusBadge,
                        ...getLeadStatusStyle(
                          lead.status,
                        ),
                      }}
                    >
                      {lead.status || 'new'}
                    </span>
                  </TableCell>

                  <TableCell>
                    {formatDateTime(
                      lead.created_at,
                    )}
                  </TableCell>

                  <TableCell>
                    <div
                      style={
                        styles.actionButtons
                      }
                    >
                      {!lead.contacted && (
                        <button
                          type="button"
                          onClick={() =>
                            updateLeadStatus(
                              lead.id,
                              {
                                contacted: true,
                                status:
                                  'contacted',
                              },
                            )
                          }
                          style={
                            styles.contactButton
                          }
                        >
                          Mark Contacted
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          convertLeadToCompanyForm(
                            lead,
                          )
                        }
                        style={
                          styles.convertButton
                        }
                      >
                        Create Company
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateLeadStatus(
                            lead.id,
                            {
                              status:
                                'rejected',
                            },
                          )
                        }
                        style={
                          styles.rejectButton
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CreateCompanySection({
  companyForm,
  handleCompanyFormChange,
  handleCreateCompany,
  creatingCompany,
}) {
  return (
    <section style={styles.formPanel}>
      <div style={styles.formHeader}>
        <p style={styles.eyebrow}>
          Customer onboarding
        </p>

        <h2 style={styles.panelTitle}>
          Create a Customer Company
        </h2>

        <p style={styles.panelDescription}>
          Create the customer organisation and
          invite its first company administrator.
          The administrator can then invite
          managers and staff from the Team page.
        </p>
      </div>

      <form
        onSubmit={handleCreateCompany}
        style={styles.form}
      >
        <FormField
          label="Company name"
          name="companyName"
          value={companyForm.companyName}
          onChange={handleCompanyFormChange}
          placeholder="Example Security Ltd"
          autoComplete="organization"
          disabled={creatingCompany}
          required
        />

        <FormField
          label="Administrator’s full name"
          name="adminName"
          value={companyForm.adminName}
          onChange={handleCompanyFormChange}
          placeholder="Jane Smith"
          autoComplete="name"
          disabled={creatingCompany}
          required
        />

        <FormField
          label="Administrator’s work email"
          name="adminEmail"
          type="email"
          value={companyForm.adminEmail}
          onChange={handleCompanyFormChange}
          placeholder="jane@example.com"
          autoComplete="email"
          disabled={creatingCompany}
          required
        />

        <div style={styles.formNotice}>
          <strong>
            What happens after submission?
          </strong>

          <ol style={styles.noticeList}>
            <li>
              A new customer company is created.
            </li>

            <li>
              The first user is invited as the
              company administrator.
            </li>

            <li>
              The administrator receives a secure
              invitation link.
            </li>

            <li>
              After signing in, the administrator
              can add managers and staff.
            </li>
          </ol>
        </div>

        <button
          type="submit"
          disabled={creatingCompany}
          style={{
            ...styles.primaryButton,
            ...(creatingCompany
              ? styles.disabledButton
              : {}),
          }}
        >
          {creatingCompany
            ? 'Creating company...'
            : 'Create Company and Invite Admin'}
        </button>
      </form>
    </section>
  )
}

function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  required,
}) {
  return (
    <div style={styles.formGroup}>
      <label
        htmlFor={`platform-${name}`}
        style={styles.formLabel}
      >
        {label}
        {required ? ' *' : ''}
      </label>

      <input
        id={`platform-${name}`}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        style={styles.formInput}
      />
    </div>
  )
}

function CompanyDetailsModal({
  company,
  onClose,
  updateCompanyStatus,
  resendAdministratorInvite,
}) {
  return (
    <div
      style={styles.modalOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose()
        }
      }}
    >
      <section
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`${company.name} company details`}
      >
        <div style={styles.modalHeader}>
          <div>
            <p style={styles.eyebrow}>
              Customer company
            </p>

            <h2 style={styles.modalTitle}>
              {company.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={styles.closeButton}
            aria-label="Close company details"
          >
            ✕
          </button>
        </div>

        <div style={styles.companyDetailsGrid}>
          <DetailCard
            label="Status"
            value={
              <StatusBadge
                status={company.status}
              />
            }
          />

          <DetailCard
            label="Users"
            value={company.userCount}
          />

          <DetailCard
            label="Administrators"
            value={
              company.administratorCount
            }
          />

          <DetailCard
            label="Created"
            value={formatDate(
              company.created_at,
            )}
          />
        </div>

        <div style={styles.modalSection}>
          <h3 style={styles.modalSectionTitle}>
            Company Administrators
          </h3>

          {company.administrators.length === 0 &&
          company.adminInvitations?.length === 0 ? (
            <p style={styles.mutedText}>
              This company does not yet have an
              administrator or administrator invitation.
            </p>
          ) : company.administrators.length > 0 ? (
            company.administrators.map(
              (administrator) => (
                <div
                  key={administrator.id}
                  style={
                    styles.modalUserCard
                  }
                >
                  <div>
                    <strong>
                      {getSafeUserName(
                        administrator,
                        company.adminInvitations?.find(
                          (invitation) =>
                            String(invitation.email || '')
                              .toLowerCase() ===
                            String(administrator.email || '')
                              .toLowerCase(),
                        ),
                      )}
                    </strong>

                    <div
                      style={styles.emailText}
                    >
                      {administrator.email}
                    </div>
                  </div>

                  <RoleBadge
                    role={administrator.role}
                  />
                </div>
              ),
            )
          ) : (
            <div style={styles.modalUserList}>
              {company.adminInvitations.map(
                (invitation) => (
                  <div
                    key={invitation.id}
                    style={styles.modalUserCard}
                  >
                    <div>
                      <strong>
                        {getInvitationDisplayName(
                          invitation,
                        )}
                      </strong>

                      <div style={styles.emailText}>
                        {invitation.email}
                      </div>
                    </div>

                    <StatusBadge
                      status={invitation.status}
                    />
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <div style={styles.modalSection}>
          <h3 style={styles.modalSectionTitle}>
            All Company Users
          </h3>

          {company.users.length === 0 ? (
            <p style={styles.mutedText}>
              No users have joined this company.
            </p>
          ) : (
            <div style={styles.modalUserList}>
              {company.users.map(
                (userProfile) => (
                  <div
                    key={userProfile.id}
                    style={
                      styles.modalUserCard
                    }
                  >
                    <div>
                      <strong>
                        {getSafeUserName(
                          userProfile,
                          company.invitations?.find(
                            (invitation) =>
                              String(invitation.email || '')
                                .toLowerCase() ===
                              String(userProfile.email || '')
                                .toLowerCase(),
                          ),
                        )}
                      </strong>

                      <div
                        style={
                          styles.emailText
                        }
                      >
                        {userProfile.email}
                      </div>
                    </div>

                    <RoleBadge
                      role={
                        userProfile.role
                      }
                    />
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <div style={styles.modalActions}>
          {(company.administrators.length > 0 ||
            company.adminInvitations?.length > 0) && (
            <button
              type="button"
              onClick={() =>
                resendAdministratorInvite(
                  company,
                )
              }
              style={styles.inviteButton}
            >
              Resend Admin Invitation
            </button>
          )}

          {normaliseStatus(company.status) !==
            'active' && (
            <button
              type="button"
              onClick={() =>
                updateCompanyStatus(
                  company.id,
                  'active',
                )
              }
              style={styles.activateButton}
            >
              Activate Company
            </button>
          )}

          {normaliseStatus(company.status) !==
            'suspended' && (
            <button
              type="button"
              onClick={() =>
                updateCompanyStatus(
                  company.id,
                  'suspended',
                )
              }
              style={styles.suspendButton}
            >
              Suspend Company
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={styles.secondaryButton}
          >
            Close
          </button>
        </div>
      </section>
    </div>
  )
}

function DetailCard({ label, value }) {
  return (
    <div style={styles.detailCard}>
      <span style={styles.detailLabel}>
        {label}
      </span>

      <div style={styles.detailValue}>
        {value}
      </div>
    </div>
  )
}

function TableHeading({ children }) {
  return (
    <th style={styles.tableHeading}>
      {children}
    </th>
  )
}

function TableCell({ children }) {
  return (
    <td style={styles.tableCell}>
      {children}
    </td>
  )
}

function StatusBadge({ status }) {
  return (
    <span
      style={{
        ...styles.statusBadge,
        ...getCompanyStatusStyle(status),
      }}
    >
      {normaliseStatus(status)}
    </span>
  )
}

function RoleBadge({ role }) {
  const value = normaliseRole(role)

  let roleStyle = styles.roleStaff

  if (value === 'platform_admin') {
    roleStyle = styles.rolePlatformAdmin
  } else if (value === 'admin') {
    roleStyle = styles.roleAdmin
  } else if (value === 'manager') {
    roleStyle = styles.roleManager
  }

  return (
    <span
      style={{
        ...styles.roleBadge,
        ...roleStyle,
      }}
    >
      {value.replaceAll('_', ' ') ||
        'user'}
    </span>
  )
}

function EmptyState({ title, message }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyStateIcon}>
        ◫
      </div>

      <h3 style={styles.emptyStateTitle}>
        {title}
      </h3>

      <p style={styles.emptyStateText}>
        {message}
      </p>
    </div>
  )
}

function PageLoading({ message }) {
  return (
    <div style={styles.loadingScreen}>
      <div style={styles.loadingSpinner} />

      <p>{message}</p>
    </div>
  )
}

function AccessDenied({ profileRole }) {
  return (
    <main style={styles.accessDeniedPage}>
      <section style={styles.accessDeniedCard}>
        <div style={styles.accessDeniedIcon}>
          🔒
        </div>

        <h1 style={styles.accessDeniedTitle}>
          Platform administrator access required
        </h1>

        <p style={styles.accessDeniedText}>
          This page is only available to the
          Trustera platform administrator. Your
          current role is{' '}
          <strong>
            {profileRole || 'unknown'}
          </strong>
          .
        </p>
      </section>
    </main>
  )
}

const styles = {
  page: {
    minHeight: 'calc(100vh - 72px)',
    padding: '32px',
    background: '#020617',
    color: '#ffffff',
    boxSizing: 'border-box',
  },

  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '24px',
    marginBottom: '28px',
    flexWrap: 'wrap',
  },

  eyebrow: {
    margin: '0 0 8px',
    color: '#60a5fa',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },

  pageTitle: {
    margin: 0,
    fontSize: '32px',
    lineHeight: 1.2,
  },

  pageDescription: {
    maxWidth: '760px',
    margin: '10px 0 0',
    color: '#94a3b8',
    lineHeight: 1.6,
  },

  refreshButton: {
    minHeight: '44px',
    padding: '10px 16px',
    border: '1px solid #2563eb',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 700,
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '28px',
  },

  statCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    minHeight: '120px',
    padding: '20px',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    background: '#0f172a',
    boxSizing: 'border-box',
  },

  statIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '46px',
    height: '46px',
    flexShrink: 0,
    borderRadius: '14px',
    fontSize: '20px',
    fontWeight: 800,
  },

  statIconBlue: {
    background: '#1d4ed8',
    color: '#dbeafe',
  },

  statIconGreen: {
    background: '#047857',
    color: '#d1fae5',
  },

  statIconPurple: {
    background: '#6d28d9',
    color: '#ede9fe',
  },

  statIconCyan: {
    background: '#0e7490',
    color: '#cffafe',
  },

  statIconAmber: {
    background: '#b45309',
    color: '#fef3c7',
  },

  statValue: {
    fontSize: '26px',
    fontWeight: 800,
  },

  statLabel: {
    marginTop: '3px',
    color: '#f8fafc',
    fontWeight: 700,
  },

  statDescription: {
    marginTop: '5px',
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: 1.45,
  },

  tabBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    padding: '6px',
    overflowX: 'auto',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    background: '#0f172a',
  },

  tabButton: {
    minHeight: '42px',
    padding: '9px 15px',
    border: 'none',
    borderRadius: '10px',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },

  activeTabButton: {
    background: '#2563eb',
    color: '#ffffff',
  },

  panel: {
    overflow: 'hidden',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    background: '#0f172a',
  },

  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '20px',
    padding: '22px',
    borderBottom: '1px solid #1e293b',
  },

  panelTitle: {
    margin: 0,
    fontSize: '22px',
  },

  panelDescription: {
    maxWidth: '760px',
    margin: '8px 0 0',
    color: '#94a3b8',
    lineHeight: 1.55,
  },

  filters: {
    display: 'grid',
    gridTemplateColumns: '1fr 220px',
    gap: '12px',
    padding: '18px 22px',
    borderBottom: '1px solid #1e293b',
  },

  searchInput: {
    minHeight: '44px',
    padding: '10px 14px',
    border: '1px solid #334155',
    borderRadius: '10px',
    background: '#1e293b',
    color: '#ffffff',
    outline: 'none',
    fontSize: '14px',
  },

  filterSelect: {
    minHeight: '44px',
    padding: '10px 14px',
    border: '1px solid #334155',
    borderRadius: '10px',
    background: '#1e293b',
    color: '#ffffff',
    outline: 'none',
    fontSize: '14px',
  },

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '1100px',
    borderCollapse: 'collapse',
  },

  tableHeading: {
    padding: '14px 16px',
    borderBottom: '1px solid #334155',
    background: '#111c30',
    color: '#e2e8f0',
    textAlign: 'left',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },

  tableCell: {
    padding: '15px 16px',
    borderBottom: '1px solid #1e293b',
    color: '#e2e8f0',
    verticalAlign: 'top',
    fontSize: '13px',
  },

  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px 9px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  },

  statusActive: {
    background: '#064e3b',
    color: '#a7f3d0',
  },

  statusPending: {
    background: '#78350f',
    color: '#fde68a',
  },

  statusSuspended: {
    background: '#7f1d1d',
    color: '#fecaca',
  },

  statusArchived: {
    background: '#334155',
    color: '#cbd5e1',
  },

  userSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },

  emailText: {
    color: '#93c5fd',
    overflowWrap: 'anywhere',
  },

  identifierText: {
    maxWidth: '230px',
    marginTop: '5px',
    color: '#64748b',
    fontFamily: 'monospace',
    fontSize: '10px',
    overflowWrap: 'anywhere',
  },

  mutedText: {
    color: '#94a3b8',
  },

  challengeText: {
    maxWidth: '320px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },

  actionButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },

  viewButton: {
    minHeight: '34px',
    padding: '7px 10px',
    border: 'none',
    borderRadius: '8px',
    background: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },

  inviteButton: {
    minHeight: '34px',
    padding: '7px 10px',
    border: '1px solid #7c3aed',
    borderRadius: '8px',
    background: '#5b21b6',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },

  statusSelect: {
    minHeight: '34px',
    padding: '7px 9px',
    border: '1px solid #334155',
    borderRadius: '8px',
    background: '#1e293b',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
  },

  contactButton: {
    minHeight: '34px',
    padding: '7px 10px',
    border: 'none',
    borderRadius: '8px',
    background: '#0369a1',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },

  convertButton: {
    minHeight: '34px',
    padding: '7px 10px',
    border: 'none',
    borderRadius: '8px',
    background: '#047857',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },

  rejectButton: {
    minHeight: '34px',
    padding: '7px 10px',
    border: 'none',
    borderRadius: '8px',
    background: '#991b1b',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },

  roleBadge: {
    display: 'inline-flex',
    padding: '5px 9px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'capitalize',
  },

  rolePlatformAdmin: {
    background: '#581c87',
    color: '#f3e8ff',
  },

  roleAdmin: {
    background: '#1e3a8a',
    color: '#dbeafe',
  },

  roleManager: {
    background: '#115e59',
    color: '#ccfbf1',
  },

  roleStaff: {
    background: '#334155',
    color: '#e2e8f0',
  },

  formPanel: {
    maxWidth: '760px',
    margin: '0 auto',
    padding: '28px',
    border: '1px solid #1e293b',
    borderRadius: '18px',
    background: '#0f172a',
  },

  formHeader: {
    marginBottom: '24px',
  },

  form: {
    display: 'grid',
    gap: '20px',
  },

  formGroup: {
    display: 'grid',
    gap: '8px',
  },

  formLabel: {
    color: '#e2e8f0',
    fontSize: '13px',
    fontWeight: 700,
  },

  formInput: {
    minHeight: '48px',
    padding: '11px 14px',
    border: '1px solid #334155',
    borderRadius: '10px',
    background: '#020617',
    color: '#ffffff',
    outline: 'none',
    fontSize: '15px',
    boxSizing: 'border-box',
  },

  formNotice: {
    padding: '18px',
    border: '1px solid #1e40af',
    borderRadius: '12px',
    background: '#172554',
    color: '#dbeafe',
    lineHeight: 1.6,
  },

  noticeList: {
    margin: '10px 0 0',
    paddingLeft: '20px',
  },

  primaryButton: {
    minHeight: '50px',
    padding: '12px 18px',
    border: 'none',
    borderRadius: '11px',
    background: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: 800,
  },

  secondaryButton: {
    minHeight: '40px',
    padding: '9px 14px',
    border: '1px solid #475569',
    borderRadius: '9px',
    background: '#1e293b',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 700,
  },

  activateButton: {
    minHeight: '40px',
    padding: '9px 14px',
    border: 'none',
    borderRadius: '9px',
    background: '#047857',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 700,
  },

  suspendButton: {
    minHeight: '40px',
    padding: '9px 14px',
    border: 'none',
    borderRadius: '9px',
    background: '#991b1b',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 700,
  },

  disabledButton: {
    cursor: 'not-allowed',
    opacity: 0.65,
  },

  emptyState: {
    padding: '60px 24px',
    textAlign: 'center',
  },

  emptyStateIcon: {
    color: '#60a5fa',
    fontSize: '36px',
  },

  emptyStateTitle: {
    margin: '14px 0 6px',
  },

  emptyStateText: {
    margin: 0,
    color: '#94a3b8',
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 3000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'rgba(2, 6, 23, 0.82)',
    backdropFilter: 'blur(6px)',
  },

  modal: {
    width: '100%',
    maxWidth: '820px',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '26px',
    border: '1px solid #334155',
    borderRadius: '18px',
    background: '#0f172a',
    boxShadow:
      '0 30px 80px rgba(0,0,0,0.55)',
  },

  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '20px',
    paddingBottom: '18px',
    borderBottom: '1px solid #1e293b',
  },

  modalTitle: {
    margin: 0,
    fontSize: '26px',
  },

  closeButton: {
    width: '40px',
    height: '40px',
    border: '1px solid #334155',
    borderRadius: '10px',
    background: '#1e293b',
    color: '#ffffff',
    cursor: 'pointer',
  },

  companyDetailsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
    marginTop: '20px',
  },

  detailCard: {
    padding: '16px',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    background: '#020617',
  },

  detailLabel: {
    display: 'block',
    marginBottom: '8px',
    color: '#94a3b8',
    fontSize: '12px',
  },

  detailValue: {
    color: '#ffffff',
    fontWeight: 800,
  },

  modalSection: {
    marginTop: '24px',
  },

  modalSectionTitle: {
    margin: '0 0 12px',
    fontSize: '16px',
  },

  modalUserList: {
    display: 'grid',
    gap: '10px',
  },

  modalUserCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    padding: '13px',
    border: '1px solid #1e293b',
    borderRadius: '10px',
    background: '#020617',
  },

  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '26px',
    paddingTop: '18px',
    borderTop: '1px solid #1e293b',
    flexWrap: 'wrap',
  },

  loadingScreen: {
    minHeight: 'calc(100vh - 72px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    background: '#020617',
    color: '#ffffff',
  },

  loadingSpinner: {
    width: '36px',
    height: '36px',
    border: '4px solid #1e293b',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation:
      'platform-admin-spin 0.8s linear infinite',
  },

  accessDeniedPage: {
    minHeight: 'calc(100vh - 72px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#020617',
    color: '#ffffff',
  },

  accessDeniedCard: {
    width: '100%',
    maxWidth: '520px',
    padding: '32px',
    border: '1px solid #334155',
    borderRadius: '18px',
    background: '#0f172a',
    textAlign: 'center',
  },

  accessDeniedIcon: {
    fontSize: '38px',
  },

  accessDeniedTitle: {
    margin: '18px 0 10px',
    fontSize: '24px',
  },

  accessDeniedText: {
    margin: 0,
    color: '#cbd5e1',
    lineHeight: 1.6,
  },
}