import { activityTraceResponseSchema as hostActivityTraceResponseSchema } from "@ryu/app-host/activity-operation-records";
import {
	jsonResponseDocumentSchema,
	jsonResponseValueSchema,
} from "@ryu/app-host/json-values";
import { z } from "zod";

/** Complete Core ActivityItem wire contract; preserve additive native metadata. */
const activityItemFieldsSchema = z.object({
	agent_id: z.string().nullable(),
	body: z.string().nullable(),
	created_at: z.number(),
	id: z.string(),
	kind: z.string(),
	level: z.enum(["info", "success", "warning"]),
	metadata: jsonResponseValueSchema,
	session_id: z.string().nullable(),
	source: z.string(),
	title: z.string(),
});
export const activityItemSchema = z.custom<
	z.output<typeof activityItemFieldsSchema>
>(
	(value) =>
		jsonResponseDocumentSchema.safeParse(value).success &&
		activityItemFieldsSchema.safeParse(value).success
);
export const activityItemsSchema = z.custom<
	z.output<typeof activityItemSchema>[]
>((value) => z.array(activityItemSchema).safeParse(value).success);
// Existing companion integrations also accept the legacy seven-field snake_case
// trace projection. Shipped hosts supply the complete normalized DTO from AppHost.
const legacyTraceSpanFieldsSchema = z.object({
	args_hash: z.string().nullable(),
	ended_at: z.number().nullable(),
	error: z.string().nullable(),
	id: z.string(),
	kind: z.string(),
	name: z.string(),
	started_at: z.number(),
});
const legacyTraceFieldsSchema = z.object({
	spans: z.array(legacyTraceSpanFieldsSchema),
});
const legacyTraceResponseSchema = z.custom<
	z.output<typeof legacyTraceFieldsSchema>
>(
	(value) =>
		jsonResponseDocumentSchema.safeParse(value).success &&
		legacyTraceFieldsSchema.safeParse(value).success
);
export const activityTraceResponseSchema = z.union([
	hostActivityTraceResponseSchema,
	legacyTraceResponseSchema,
]);
export const observabilityFilterSchema = z.enum([
	"all",
	"errors",
	"slow",
	"model",
	"tool",
]);
export const observabilityWindowSchema = z.enum(["1h", "24h", "7d", "all"]);
export const savedObservabilityViewsSchema = z.array(
	z.object({
		filter: observabilityFilterSchema,
		id: z.string(),
		name: z.string(),
		query: z.string(),
		timeRange: observabilityWindowSchema,
	})
);

// UI projections retain the existing fallback behavior for incomplete legacy
// replies. Full native endpoint contracts are validated separately by the bridge.
const nullableStringSchema = z.string().nullable().catch(null);
const nullableNumberSchema = z.number().nullable().catch(null);
const auditRowSchema = z.object({
	agent_id: nullableStringSchema,
	command: nullableStringSchema,
	cost_micro_usd: nullableNumberSchema,
	error: nullableStringSchema,
	eval_score: nullableNumberSchema,
	event_type: nullableStringSchema,
	feature: nullableStringSchema,
	id: z.string().optional().catch(undefined),
	input_tokens: nullableNumberSchema,
	latency_ms: nullableNumberSchema,
	model: nullableStringSchema,
	output_tokens: nullableNumberSchema,
	provider: nullableStringSchema,
	request_id: z.string().catch("unknown"),
	session_id: nullableStringSchema,
	timestamp: z.string().catch(""),
});
export const auditProjectionSchema = z.unknown().transform((value) => {
	const result = z
		.object({ reachable: z.boolean(), entries: z.array(z.unknown()) })
		.safeParse(value);
	if (!result.success) {
		return { entries: [], reachable: false };
	}
	const entries = result.data.entries.flatMap((value, index) => {
		const parsed = auditRowSchema.safeParse(value);
		if (!parsed.success) {
			return [];
		}
		const row = parsed.data;
		return [
			{
				agent_id: row.agent_id,
				command: row.command,
				cost_micro_usd: row.cost_micro_usd,
				error: row.error,
				eval_score: row.eval_score,
				event_type: row.event_type,
				feature: row.feature,
				id: row.id ?? `observability-${index}`,
				input_tokens: row.input_tokens,
				latency_ms: row.latency_ms,
				model: row.model,
				output_tokens: row.output_tokens,
				provider: row.provider,
				request_id: row.request_id,
				session_id: row.session_id,
				timestamp: row.timestamp,
			},
		];
	});
	return { entries, reachable: result.data.reachable };
});
const traceSpanProjectionSchema = z.object({
	args_hash: nullableStringSchema,
	ended_at: nullableNumberSchema,
	error: nullableStringSchema,
	id: z.string(),
	kind: z.string().catch("span"),
	name: z.string(),
	started_at: z.number().catch(0),
});
export const traceProjectionSchema = z.unknown().transform((value) => {
	const parsed = z
		.object({ spans: z.array(z.unknown()).catch([]) })
		.safeParse(value);
	return parsed.success
		? parsed.data.spans.flatMap((row) => {
				const span = traceSpanProjectionSchema.safeParse(row);
				return span.success ? [span.data] : [];
			})
		: [];
});
const redteamStrategyProjectionSchema = z.object({
	detail: z.string().catch("No evaluator detail returned"),
	id: z.string(),
	name: z.string().optional().catch(undefined),
	protected: z.boolean().catch(false),
});
export const redteamProjectionSchema = z.unknown().transform((value) => {
	const parsed = z
		.object({
			model: z.string().catch("unknown"),
			strategies: z.array(z.unknown()),
			summary: z.object({
				needs_attention: z.number().catch(0),
				protected: z.number().catch(0),
				total: z.number().catch(0),
			}),
		})
		.safeParse(value);
	if (!parsed.success) {
		return null;
	}
	return {
		...parsed.data,
		strategies: parsed.data.strategies.flatMap((row) => {
			const strategy = redteamStrategyProjectionSchema.safeParse(row);
			return strategy.success
				? [
						{
							detail: strategy.data.detail,
							id: strategy.data.id,
							name: strategy.data.name ?? strategy.data.id,
							protected: strategy.data.protected,
						},
					]
				: [];
		}),
	};
});
export const evalProjectionSchema = z
	.object({
		aggregate: z.object({
			mean_overall: z.number().catch(0),
			policy_pass_rate: z.number().catch(0),
			total_cases: z.number().catch(0),
		}),
	})
	.nullable()
	.catch(null);
