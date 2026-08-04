export const DEFAULT_AUDIT_LOG_PROJECT_ID = 'future-factory-377ef';

export const buildAuditLogCloudLoggingUrl = (projectId?: string | null) => {
  const resolvedProjectId = String(projectId || '').trim() || DEFAULT_AUDIT_LOG_PROJECT_ID;
  const query = '(resource.type="cloud_function" OR resource.type="cloud_run_revision") AND (textPayload:"AUDIT:" OR jsonPayload.message:"AUDIT:" OR jsonPayload.action:*)';
  return `https://console.cloud.google.com/logs/query?project=${encodeURIComponent(resolvedProjectId)}&query=${encodeURIComponent(query)}`;
};
