export const DEFAULT_AUDIT_LOG_PROJECT_ID = 'future-factory-377ef';

export const buildAuditLogCloudLoggingUrl = (projectId?: string | null) => {
  const resolvedProjectId = String(projectId || '').trim() || DEFAULT_AUDIT_LOG_PROJECT_ID;
  // We zoeken specifiek naar logs die beginnen met AUDIT: en sluiten de overbodige (systeem/print) spam uit.
  const query = `(resource.type="cloud_function" OR resource.type="cloud_run_revision") AND jsonPayload.message=~"^AUDIT:" AND NOT jsonPayload.action="PRINT_JOB" AND NOT jsonPayload.action="PRINT_JOB_STARTED" AND NOT jsonPayload.category="SYSTEM"`;
  return `https://console.cloud.google.com/logs/query?project=${encodeURIComponent(resolvedProjectId)}&query=${encodeURIComponent(query)}`;
};
