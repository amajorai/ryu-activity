import { describe, expect, test } from "bun:test";
import { jsonResponseDocumentSchema } from "@ryu/app-host/json-values";
import {
	activityItemsSchema,
	activityTraceResponseSchema,
	auditProjectionSchema,
	evalProjectionSchema,
	redteamProjectionSchema,
	savedObservabilityViewsSchema,
	traceProjectionSchema,
} from "./schemas.ts";
import type { ActivityItem } from "./types.ts";

describe("Activity native contracts and legacy projections", () => {
	test("retains full feed identities and additive metadata, including own prototype fields", () => {
		const metadata = jsonResponseDocumentSchema.parse(
			JSON.parse('{"__proto__":{"actual":"metadata"},"nested":[null,4]}')
		);
		const item = {
			agent_id: null,
			body: null,
			created_at: 12,
			id: "event",
			kind: "future_kind",
			level: "info",
			metadata,
			session_id: null,
			source: "future_source",
			title: "Ready",
			future: { kept: true },
		} satisfies ActivityItem & { future: { kept: boolean } };
		const items = [item];
		expect(activityItemsSchema.parse(items)).toBe(items);
		expect(activityItemsSchema.parse(items)[0]).toBe(item);
		expect(activityItemsSchema.parse(items)[0]?.metadata).toBe(metadata);
		expect(Object.hasOwn(metadata, "__proto__")).toBe(true);
	});
	test("accepts every JSON metadata shape admitted by the native create endpoint", () => {
		for (const metadata of [
			null,
			false,
			12,
			"note",
			["ordered", { nested: true }],
			{ actual: true },
		]) {
			const item = {
				agent_id: null,
				body: null,
				created_at: 12,
				id: "manual",
				kind: "note",
				level: "info",
				metadata,
				session_id: null,
				source: "manual",
				title: "Ready",
			} satisfies ActivityItem;
			expect(activityItemsSchema.parse([item])[0]).toBe(item);
			expect(activityItemsSchema.parse([item])[0]?.metadata).toBe(metadata);
		}
	});
	test("rejects incomplete rows and non-JSON native metadata", () => {
		expect(activityItemsSchema.safeParse([{ id: "partial" }]).success).toBe(
			false
		);
		expect(
			activityItemsSchema.safeParse([
				{
					agent_id: null,
					body: null,
					created_at: 1,
					id: "event",
					kind: "run",
					level: "info",
					metadata: { bad: Number.POSITIVE_INFINITY },
					session_id: null,
					source: "runs",
					title: "Run",
				},
			]).success
		).toBe(false);
	});
	test("retains complete normalized and legacy trace DTOs without accepting incomplete spans", () => {
		const native = {
			spans: [
				{
					argsHash: null,
					conversationId: "run",
					endedAt: 10,
					error: null,
					id: "span",
					kind: "model",
					name: "Call",
					seq: 0,
					sessionId: null,
					startedAt: 1,
				},
			],
		};
		const legacy = {
			spans: [
				{
					args_hash: null,
					ended_at: 10,
					error: null,
					id: "span",
					kind: "model",
					name: "Call",
					started_at: 1,
				},
			],
		};
		expect(activityTraceResponseSchema.parse(native)).toBe(native);
		expect(activityTraceResponseSchema.parse(legacy)).toBe(legacy);
		expect(
			activityTraceResponseSchema.safeParse({
				spans: [{ id: "span", name: "Call" }],
			}).success
		).toBe(false);
	});

	test("validates the full saved view fields and finite choices", () => {
		expect(
			savedObservabilityViewsSchema.parse([
				{
					filter: "errors",
					id: "view",
					name: "Errors",
					query: "provider",
					timeRange: "24h",
				},
			])
		).toHaveLength(1);
		expect(
			savedObservabilityViewsSchema.safeParse([
				{
					filter: "future",
					id: "view",
					name: "Errors",
					query: "",
					timeRange: "24h",
				},
			]).success
		).toBe(false);
		expect(savedObservabilityViewsSchema.safeParse([{}]).success).toBe(false);
	});
	test("preserves malformed audit row filtering, index ids and finite nullable fallbacks", () => {
		const projection = auditProjectionSchema.parse({
			reachable: true,
			entries: [
				null,
				4,
				{ error: "failed", latency_ms: Number.POSITIVE_INFINITY },
				{ id: "", request_id: "known", timestamp: "today" },
			],
		});
		expect(projection.reachable).toBe(true);
		expect(projection.entries.map((row) => row.id)).toEqual([
			"observability-2",
			"",
		]);
		expect(projection.entries[0]?.latency_ms).toBeNull();
		expect(projection.entries[0]?.request_id).toBe("unknown");
		expect(projection.entries[1]?.timestamp).toBe("today");
	});
	test("keeps trace legacy names, fallback values, and only complete row identities", () => {
		expect(
			traceProjectionSchema.parse({
				spans: [
					null,
					{ id: "partial" },
					{
						id: "span",
						name: "Run",
						started_at: 42,
						args_hash: "hash",
						ended_at: 50,
					},
				],
			})
		).toEqual([
			{
				args_hash: "hash",
				ended_at: 50,
				error: null,
				id: "span",
				kind: "span",
				name: "Run",
				started_at: 42,
			},
		]);
		expect(traceProjectionSchema.parse(undefined)).toEqual([]);
	});
	test("preserves redteam strict true protection and evaluator defaults", () => {
		const projected = redteamProjectionSchema.parse({
			summary: {},
			strategies: [
				null,
				{ id: "strategy", protected: "true" },
				{ id: "protected", protected: true },
			],
		});
		expect(projected?.model).toBe("unknown");
		expect(projected?.strategies.map((row) => row.protected)).toEqual([
			false,
			true,
		]);
		expect(projected?.strategies[0]?.name).toBe("strategy");
		expect(projected?.summary).toEqual({
			needs_attention: 0,
			protected: 0,
			total: 0,
		});
	});
	test("defaults partial evaluation aggregates but preserves unavailable state", () => {
		expect(evalProjectionSchema.parse({ aggregate: {} })).toEqual({
			aggregate: { mean_overall: 0, policy_pass_rate: 0, total_cases: 0 },
		});
		expect(evalProjectionSchema.parse(undefined)).toBeNull();
	});
});
