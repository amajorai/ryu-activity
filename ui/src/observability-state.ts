export interface AuditEntry {
	agent_id: string | null;
	command: string | null;
	cost_micro_usd: number | null;
	error: string | null;
	eval_score: number | null;
	event_type: string | null;
	feature: string | null;
	id: string;
	input_tokens: number | null;
	latency_ms: number | null;
	model: string | null;
	output_tokens: number | null;
	provider: string | null;
	request_id: string;
	session_id: string | null;
	timestamp: string;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function nullableString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Normalize the gateway response without treating an absent response as live. */
export function normalizeAudit(value: unknown): {
	entries: AuditEntry[];
	reachable: boolean;
} {
	const record = objectRecord(value);
	if (
		!record ||
		typeof record.reachable !== "boolean" ||
		!Array.isArray(record.entries)
	) {
		return { entries: [], reachable: false };
	}

	const entries = record.entries.flatMap((item, index) => {
		const row = objectRecord(item);
		if (!row) {
			return [];
		}
		return [
			{
				agent_id: nullableString(row.agent_id),
				command: nullableString(row.command),
				cost_micro_usd: nullableNumber(row.cost_micro_usd),
				error: nullableString(row.error),
				eval_score: nullableNumber(row.eval_score),
				event_type: nullableString(row.event_type),
				feature: nullableString(row.feature),
				id: typeof row.id === "string" ? row.id : `observability-${index}`,
				input_tokens: nullableNumber(row.input_tokens),
				latency_ms: nullableNumber(row.latency_ms),
				model: nullableString(row.model),
				output_tokens: nullableNumber(row.output_tokens),
				provider: nullableString(row.provider),
				request_id:
					typeof row.request_id === "string" ? row.request_id : "unknown",
				session_id: nullableString(row.session_id),
				timestamp: typeof row.timestamp === "string" ? row.timestamp : "",
			},
		];
	});

	return { entries, reachable: record.reachable };
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
