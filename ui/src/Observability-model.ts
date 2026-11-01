import type { CSSProperties } from "react";
import type { z } from "zod";
import type { AuditEntry } from "./observability-state.ts";
import {
	type evalProjectionSchema,
	type observabilityFilterSchema,
	type observabilityWindowSchema,
	type redteamProjectionSchema,
	savedObservabilityViewsSchema,
	type traceProjectionSchema,
} from "./schemas.ts";

export interface ActivityDiscoverStyle extends CSSProperties {
	"--activity-discover-width": `${number}%`;
}

export type ObservabilityFilter = z.output<typeof observabilityFilterSchema>;
export type ObservabilityWindow = z.output<typeof observabilityWindowSchema>;
export type TraceSpan = z.output<typeof traceProjectionSchema>[number];
export type RedteamResult = NonNullable<
	z.output<typeof redteamProjectionSchema>
>;
export type EvalResult = NonNullable<z.output<typeof evalProjectionSchema>>;

export interface DiscoverGroup {
	count: number;
	errorCount: number;
	key: string;
	percent: number;
}

export type SavedObservabilityView = z.output<
	typeof savedObservabilityViewsSchema
>[number];

export function savedViewsKey(): string {
	return "ryu-activity-observability-views";
}

export function loadSavedViews(): SavedObservabilityView[] {
	if (!globalThis.window) {
		return [];
	}
	try {
		const stored = window.localStorage.getItem(savedViewsKey());
		if (!stored) {
			return [];
		}
		const parsed = savedObservabilityViewsSchema.safeParse(JSON.parse(stored));
		return parsed.success ? parsed.data : [];
	} catch {
		return [];
	}
}

export const REFRESH_MS = 15_000;
export const SLOW_MS = 1000;

export function windowStart(value: ObservabilityWindow): string | undefined {
	const durationMs = {
		"1h": 60 * 60 * 1000,
		"24h": 24 * 60 * 60 * 1000,
		"7d": 7 * 24 * 60 * 60 * 1000,
		all: 0,
	}[value];
	return durationMs === 0
		? undefined
		: new Date(Date.now() - durationMs).toISOString();
}

export function windowLabel(value: ObservabilityWindow): string {
	return {
		"1h": "Last hour",
		"24h": "Last 24 hours",
		"7d": "Last 7 days",
		all: "All available",
	}[value];
}

export function formatCost(microUsd: number | null): string {
	return microUsd ? `$${(microUsd / 1_000_000).toFixed(4)}` : "$0.00";
}

export function formatScore(score: number | null): string {
	return score === null ? "—" : `${Math.round(score * 100)}%`;
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat().format(value);
}

export function spanDuration(span: TraceSpan): string {
	if (span.ended_at === null) {
		return "in flight";
	}
	const milliseconds = Math.max(0, span.ended_at - span.started_at);
	return milliseconds < 1000
		? `${milliseconds}ms`
		: `${(milliseconds / 1000).toFixed(1)}s`;
}

export function discoverGroups(entries: AuditEntry[]): DiscoverGroup[] {
	const groups = new Map<string, AuditEntry[]>();
	for (const entry of entries) {
		const key = entry.error
			? `error · ${entry.error.slice(0, 72)}`
			: `${entry.provider ?? "unknown"} · ${entry.model ?? "unknown"}`;
		const group = groups.get(key) ?? [];
		group.push(entry);
		groups.set(key, group);
	}
	return Array.from(groups.entries())
		.map(([key, group]) => ({
			count: group.length,
			errorCount: group.filter((entry) => Boolean(entry.error)).length,
			key,
			percent: entries.length > 0 ? group.length / entries.length : 0,
		}))
		.sort((left, right) => right.count - left.count)
		.slice(0, 6);
}
