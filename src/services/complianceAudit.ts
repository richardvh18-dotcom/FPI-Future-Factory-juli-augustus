import { logActivity } from "../config/firebase";

export type ComplianceEventType =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "EXPORT"
  | "QUALITY_REJECT"
  | "QUALITY_REJECT_TEMP"
  | "SPECIFICATION_CHANGE"
  | "CALIBRATION_CHANGE";

export type ComplianceDetails = Record<string, unknown> & {
  eventType: ComplianceEventType;
  timestamp: string;
};

export const buildComplianceDetails = (
  eventType: ComplianceEventType,
  details: Record<string, unknown> = {}
): ComplianceDetails => ({
  eventType,
  timestamp: new Date().toISOString(),
  ...details,
});

export const logComplianceEvent = async (
  userId: string,
  eventType: ComplianceEventType,
  details: Record<string, unknown> = {}
) => {
  const payload = buildComplianceDetails(eventType, details);
  await logActivity(userId, eventType, payload);
};
