import { complianceCheckSchema, isoTimestampSchema, type ComplianceCheck } from "../domain";

export const COMPLIANCE_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function nextComplianceCheckAt(checkedAt: string): string {
  const parsedCheckedAt = isoTimestampSchema.parse(checkedAt);
  return new Date(Date.parse(parsedCheckedAt) + COMPLIANCE_INTERVAL_MS).toISOString();
}

type CheckStatus = ComplianceCheck["status"];

export function requiredActionFor(status: CheckStatus): ComplianceCheck["requiredAction"] {
  if (status === "active") return "retain";
  if (status === "edited") return "rehydrate";
  return "purge";
}

export function buildComplianceCheck(
  input: Omit<ComplianceCheck, "schemaVersion" | "nextCheckAt" | "requiredAction">
): ComplianceCheck {
  return complianceCheckSchema.parse({
    ...input,
    schemaVersion: 1,
    nextCheckAt: nextComplianceCheckAt(input.checkedAt),
    requiredAction: requiredActionFor(input.status)
  });
}
