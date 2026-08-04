// src/utils/permissions.js

export const PERMISSIONS = {
  platform_admin: {
    viewWorkers: true,
    addWorkers: true,
    editWorkers: true,
    deleteWorkers: true,

    viewDocuments: true,
    uploadDocuments: true,
    editDocuments: true,
    deleteDocuments: true,

    viewNotifications: true,
    manageNotifications: true,

    viewAuditLogs: true,
    exportReports: true,
    manageTeam: true,
    manageCompanies: true,
    managePlatform: true,
  },

  admin: {
    viewWorkers: true,
    addWorkers: true,
    editWorkers: true,
    deleteWorkers: true,

    viewDocuments: true,
    uploadDocuments: true,
    editDocuments: true,
    deleteDocuments: true,

    viewNotifications: true,
    manageNotifications: true,

    viewAuditLogs: true,
    exportReports: true,
    manageTeam: true,
    manageCompanies: false,
    managePlatform: false,
  },

  manager: {
    viewWorkers: true,
    addWorkers: true,
    editWorkers: true,
    deleteWorkers: false,

    viewDocuments: true,
    uploadDocuments: true,
    editDocuments: true,
    deleteDocuments: false,

    viewNotifications: true,
    manageNotifications: true,

    viewAuditLogs: false,
    exportReports: true,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },

  compliance_officer: {
    viewWorkers: true,
    addWorkers: true,
    editWorkers: true,
    deleteWorkers: false,

    viewDocuments: true,
    uploadDocuments: true,
    editDocuments: true,
    deleteDocuments: false,

    viewNotifications: true,
    manageNotifications: true,

    viewAuditLogs: true,
    exportReports: true,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },

  staff: {
    viewWorkers: true,
    addWorkers: false,
    editWorkers: false,
    deleteWorkers: false,

    viewDocuments: true,
    uploadDocuments: true,
    editDocuments: false,
    deleteDocuments: false,

    viewNotifications: true,
    manageNotifications: false,

    viewAuditLogs: false,
    exportReports: false,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },

  viewer: {
    viewWorkers: true,
    addWorkers: false,
    editWorkers: false,
    deleteWorkers: false,

    viewDocuments: true,
    uploadDocuments: false,
    editDocuments: false,
    deleteDocuments: false,

    viewNotifications: true,
    manageNotifications: false,

    viewAuditLogs: false,
    exportReports: false,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },

  worker: {
    viewWorkers: false,
    addWorkers: false,
    editWorkers: false,
    deleteWorkers: false,

    viewDocuments: false,
    uploadDocuments: false,
    editDocuments: false,
    deleteDocuments: false,

    viewNotifications: false,
    manageNotifications: false,

    viewAuditLogs: false,
    exportReports: false,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },
}

export function normaliseRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
}

export function getPermissions(role) {
  const normalisedRole = normaliseRole(role)

  return (
    PERMISSIONS[normalisedRole] ||
    PERMISSIONS.worker
  )
}

export function can(profile, permission) {
  if (!profile || !permission) return false

  const permissions = getPermissions(profile.role)

  return Boolean(permissions[permission])
}

export function canAny(profile, ...permissions) {
  if (!profile || permissions.length === 0) {
    return false
  }

  return permissions.some((permission) =>
    can(profile, permission),
  )
}

export function canAll(profile, ...permissions) {
  if (!profile || permissions.length === 0) {
    return false
  }

  return permissions.every((permission) =>
    can(profile, permission),
  )
}

export function hasRole(profile, ...roles) {
  if (!profile?.role || roles.length === 0) {
    return false
  }

  const currentRole = normaliseRole(profile.role)

  return roles
    .map(normaliseRole)
    .includes(currentRole)
}

export function isPlatformAdmin(profile) {
  return hasRole(profile, 'platform_admin')
}

export function isCompanyAdmin(profile) {
  return hasRole(profile, 'admin')
}

export function isAdministrator(profile) {
  return hasRole(
    profile,
    'platform_admin',
    'admin',
  )
}

export function isManager(profile) {
  return hasRole(profile, 'manager')
}

export function isComplianceOfficer(profile) {
  return hasRole(
    profile,
    'compliance_officer',
  )
}

export function isStaff(profile) {
  return hasRole(profile, 'staff')
}

export function isViewer(profile) {
  return hasRole(profile, 'viewer')
}

export function isWorker(profile) {
  return hasRole(profile, 'worker')
}

export function canAccessCompanyData(profile) {
  if (!profile) return false

  return (
    isPlatformAdmin(profile) ||
    Boolean(profile.company_id)
  )
}

export function canManageCompanyUser(
  currentProfile,
  targetProfile,
) {
  if (!currentProfile || !targetProfile) {
    return false
  }

  if (currentProfile.id === targetProfile.id) {
    return false
  }

  if (isPlatformAdmin(currentProfile)) {
    return true
  }

  if (!isCompanyAdmin(currentProfile)) {
    return false
  }

  if (
    !currentProfile.company_id ||
    currentProfile.company_id !==
      targetProfile.company_id
  ) {
    return false
  }

  return !isCompanyAdmin(targetProfile)
}

export function canAssignRole(
  currentProfile,
  requestedRole,
) {
  const role = normaliseRole(requestedRole)

  if (!PERMISSIONS[role]) {
    return false
  }

  if (isPlatformAdmin(currentProfile)) {
    return role !== 'platform_admin'
  }

  if (isCompanyAdmin(currentProfile)) {
    return [
      'manager',
      'compliance_officer',
      'staff',
      'viewer',
      'worker',
    ].includes(role)
  }

  return false
}

export function getRoleLabel(role) {
  const normalisedRole = normaliseRole(role)

  const labels = {
    platform_admin: 'Platform Administrator',
    admin: 'Administrator',
    manager: 'Manager',
    compliance_officer:
      'Compliance Officer',
    staff: 'Staff',
    viewer: 'Viewer',
    worker: 'Worker',
  }

  return labels[normalisedRole] || 'Worker'
}