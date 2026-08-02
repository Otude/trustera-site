export const PERMISSIONS = {
  admin: {
    manageWorkers: true,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: true,
    exportReports: true,
    manageTeam: true,
  },

  manager: {
    manageWorkers: true,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: false,
    exportReports: true,
    manageTeam: false,
  },

  compliance_officer: {
    manageWorkers: true,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: true,
    exportReports: true,
    manageTeam: false,
  },

  staff: {
    manageWorkers: false,
    manageDocuments: true,
    viewNotifications: true,
    viewAuditLogs: false,
    exportReports: false,
    manageTeam: false,
  },

  viewer: {
    manageWorkers: false,
    manageDocuments: false,
    viewNotifications: true,
    viewAuditLogs: false,
    exportReports: true,
    manageTeam: false,
  },

  worker: {
    manageWorkers: false,
    manageDocuments: false,
    viewNotifications: false,
    viewAuditLogs: false,
    exportReports: false,
    manageTeam: false,
  },
}

export function can(profile, permission) {
  if (!profile?.role) return false

  return Boolean(
    PERMISSIONS[profile.role]?.[permission],
  )
}