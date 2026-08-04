// src/utils/permissions.js

export const PERMISSIONS = {
  platform_admin: {
    manageWorkers: true,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: true,
    exportReports: true,
    manageTeam: true,
    manageCompanies: true,
    managePlatform: true,
  },

  admin: {
    manageWorkers: true,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: true,
    exportReports: true,
    manageTeam: true,
    manageCompanies: false,
    managePlatform: false,
  },

  manager: {
    manageWorkers: true,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: false,
    exportReports: true,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },

  compliance_officer: {
    manageWorkers: true,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: true,
    exportReports: true,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },

  staff: {
    manageWorkers: false,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: false,
    exportReports: false,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },

  viewer: {
    manageWorkers: false,
    manageDocuments: false,
    viewNotifications: true,
    viewAuditLogs: false,
    exportReports: false,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },

  worker: {
    manageWorkers: false,
    manageDocuments: false,
    viewNotifications: false,
    viewAuditLogs: false,
    exportReports: false,
    manageTeam: false,
    manageCompanies: false,
    managePlatform: false,
  },
}

export function getPermissions(role) {
  return (
    PERMISSIONS[String(role || '').trim().toLowerCase()] ||
    PERMISSIONS.worker
  )
}

export function can(profile, permission) {
  if (!profile) return false

  const permissions = getPermissions(profile.role)

  return Boolean(permissions?.[permission])
}

export function hasRole(profile, ...roles) {
  if (!profile?.role) return false

  const currentRole = String(profile.role)
    .trim()
    .toLowerCase()

  return roles
    .map((role) =>
      String(role).trim().toLowerCase(),
    )
    .includes(currentRole)
}

export function isPlatformAdmin(profile) {
  return hasRole(profile, 'platform_admin')
}

export function isCompanyAdmin(profile) {
  return hasRole(profile, 'admin')
}