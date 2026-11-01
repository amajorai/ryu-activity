import type { z } from "zod";
import { auditProjectionSchema } from "./schemas.ts";

export type AuditEntry = z.output<
	typeof auditProjectionSchema
>["entries"][number];
/** Normalize missing or legacy gateway responses without treating absence as live. */
export function normalizeAudit(value: z.input<typeof auditProjectionSchema>) {
	return auditProjectionSchema.parse(value);
}

export type ObservabilityAuditStatus = "checking" | "live" | "unavailable";

export function observabilityAuditStatus(input: {
	isError: boolean;
	isLoading: boolean;
	reachable: boolean;
}): ObservabilityAuditStatus {
	if (input.isLoading) {
		return "checking";
	}
	if (input.isError || !input.reachable) {
		return "unavailable";
	}
	return "live";
}
