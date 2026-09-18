import {
	AlertCircleIcon,
	ArrowDown01Icon,
	Clock01Icon,
	Refresh01Icon,
	Search01Icon,
	Tick02Icon,
	ZapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { Switch } from "@ryu/ui/components/switch.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import { useEffect, useMemo, useState } from "react";
import {
	getObservabilityTrace,
	importObservabilityTrace,
	listObservabilityAudit,
	pruneObservabilityAudit,
	runObservabilityEval,
	runObservabilityRedteam,
	scoreObservabilityOutput,
} from "./bridge.ts";
import {
	type AuditEntry,
	normalizeAudit,
	observabilityAuditStatus,
} from "./observability-state.ts";

type ObservabilityFilter = "all" | "errors" | "slow" | "model" | "tool";
type ObservabilityWindow = "1h" | "24h" | "7d" | "all";

interface TraceSpan {
	args_hash: string | null;
	ended_at: number | null;
	error: string | null;
	id: string;
	kind: string;
	name: string;
	started_at: number;
}

interface RedteamResult {
	model: string;
	strategies: {
		detail: string;
		id: string;
		name: string;
		protected: boolean;
	}[];
	summary: {
		needs_attention: number;
		protected: number;
		total: number;
	};
}

interface EvalResult {
	aggregate: {
		mean_overall: number;
		policy_pass_rate: number;
		total_cases: number;
	};
}

interface DiscoverGroup {
	count: number;
	errorCount: number;
	key: string;
	percent: number;
}

interface SavedObservabilityView {
	filter: ObservabilityFilter;
	id: string;
	name: string;
	query: string;
	timeRange: ObservabilityWindow;
}

function savedViewsKey(): string {
	return "ryu-activity-observability-views";
}

function loadSavedViews(): SavedObservabilityView[] {
	if (typeof window === "undefined") {
		return [];
	}
	try {
		const stored = window.localStorage.getItem(savedViewsKey());
		if (!stored) {
			return [];
		}
		const parsed: unknown = JSON.parse(stored);
		return Array.isArray(parsed) ? (parsed as SavedObservabilityView[]) : [];
	} catch {
		return [];
	}
}

const REFRESH_MS = 15_000;
const SLOW_MS = 1000;

function windowStart(value: ObservabilityWindow): string | undefined {
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

function windowLabel(value: ObservabilityWindow): string {
	return {
		"1h": "Last hour",
		"24h": "Last 24 hours",
		"7d": "Last 7 days",
		all: "All available",
	}[value];
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

function normalizeTrace(value: unknown): TraceSpan[] {
	const record = objectRecord(value);
	const spans = Array.isArray(record?.spans) ? record.spans : [];
	return spans.flatMap((item) => {
		const span = objectRecord(item);
		if (!span || typeof span.id !== "string" || typeof span.name !== "string") {
			return [];
		}
		return [
			{
				args_hash: nullableString(span.args_hash),
				ended_at: nullableNumber(span.ended_at),
				error: nullableString(span.error),
				id: span.id,
				kind: typeof span.kind === "string" ? span.kind : "span",
				name: span.name,
				started_at: nullableNumber(span.started_at) ?? 0,
			},
		];
	});
}

function normalizeRedteam(value: unknown): RedteamResult | null {
	const record = objectRecord(value);
	const summary = objectRecord(record?.summary);
	if (!(summary && Array.isArray(record?.strategies))) {
		return null;
	}
	return {
		model: typeof record.model === "string" ? record.model : "unknown",
		strategies: record.strategies.flatMap((item) => {
			const strategy = objectRecord(item);
			if (!strategy || typeof strategy.id !== "string") {
				return [];
			}
			return [
				{
					detail:
						typeof strategy.detail === "string"
							? strategy.detail
							: "No evaluator detail returned",
					id: strategy.id,
					name: typeof strategy.name === "string" ? strategy.name : strategy.id,
					protected: strategy.protected === true,
				},
			];
		}),
		summary: {
			needs_attention:
				typeof summary.needs_attention === "number"
					? summary.needs_attention
					: 0,
			protected: typeof summary.protected === "number" ? summary.protected : 0,
			total: typeof summary.total === "number" ? summary.total : 0,
		},
	};
}

function normalizeEval(value: unknown): EvalResult | null {
	const record = objectRecord(value);
	const aggregate = objectRecord(record?.aggregate);
	if (!aggregate) {
		return null;
	}
	return {
		aggregate: {
			mean_overall:
				typeof aggregate.mean_overall === "number" ? aggregate.mean_overall : 0,
			policy_pass_rate:
				typeof aggregate.policy_pass_rate === "number"
					? aggregate.policy_pass_rate
					: 0,
			total_cases:
				typeof aggregate.total_cases === "number" ? aggregate.total_cases : 0,
		},
	};
}

function formatCost(microUsd: number | null): string {
	return microUsd ? `$${(microUsd / 1_000_000).toFixed(4)}` : "$0.00";
}

function formatScore(score: number | null): string {
	return score === null ? "—" : `${Math.round(score * 100)}%`;
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat().format(value);
}

function spanDuration(span: TraceSpan): string {
	if (span.ended_at === null) {
		return "in flight";
	}
	const milliseconds = Math.max(0, span.ended_at - span.started_at);
	return milliseconds < 1000
		? `${milliseconds}ms`
		: `${(milliseconds / 1000).toFixed(1)}s`;
}

function discoverGroups(entries: AuditEntry[]): DiscoverGroup[] {
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

export function Observability() {
	const [filter, setFilter] = useState<ObservabilityFilter>("all");
	const [timeRange, setTimeRange] = useState<ObservabilityWindow>("24h");
	const [query, setQuery] = useState("");
	const [regexQuery, setRegexQuery] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [agentId, setAgentId] = useState("");
	const [securityRunning, setSecurityRunning] = useState(false);
	const [securityResult, setSecurityResult] = useState<RedteamResult | null>(
		null
	);
	const [securityError, setSecurityError] = useState<string | null>(null);
	const [evalRunning, setEvalRunning] = useState(false);
	const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
	const [evalError, setEvalError] = useState<string | null>(null);
	const [importing, setImporting] = useState(false);
	const [importMessage, setImportMessage] = useState<string | null>(null);
	const [pruneRunning, setPruneRunning] = useState(false);
	const [pruneMessage, setPruneMessage] = useState<string | null>(null);
	const [scoreResponse, setScoreResponse] = useState("");
	const [scoreRubric, setScoreRubric] = useState("");
	const [scoreRunning, setScoreRunning] = useState(false);
	const [scoreResult, setScoreResult] = useState<number | null>(null);
	const [scoreError, setScoreError] = useState<string | null>(null);
	const [viewName, setViewName] = useState("");
	const [savedViews, setSavedViews] =
		useState<SavedObservabilityView[]>(loadSavedViews);

	useEffect(() => {
		try {
			window.localStorage.setItem(savedViewsKey(), JSON.stringify(savedViews));
		} catch {
			// Keep the current view usable when storage is unavailable or full.
		}
	}, [savedViews]);

	const auditQuery = useQuery({
		queryKey: ["observability", "audit", timeRange],
		queryFn: () =>
			listObservabilityAudit({ from: windowStart(timeRange), limit: 100 }),
		refetchInterval: REFRESH_MS,
	});
	const audit = useMemo(
		() => normalizeAudit(auditQuery.data),
		[auditQuery.data]
	);
	const auditStatus = observabilityAuditStatus({
		isError: auditQuery.isError,
		isLoading: auditQuery.isLoading,
		reachable: audit.reachable,
	});
	const selected =
		audit.entries.find((entry) => entry.id === selectedId) ?? null;
	const selectedRunId = selected?.session_id ?? null;
	const traceQuery = useQuery({
		queryKey: ["observability", "trace", selectedRunId],
		queryFn: () =>
			selectedRunId
				? getObservabilityTrace(selectedRunId)
				: Promise.resolve({ spans: [] }),
	});
	const trace = useMemo(
		() => normalizeTrace(traceQuery.data),
		[traceQuery.data]
	);

	useEffect(() => {
		if (selected?.agent_id) {
			setAgentId(selected.agent_id);
		}
	}, [selected?.agent_id]);

	const visibleEntries = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return audit.entries.filter((entry) => {
			if (filter === "errors" && !entry.error) {
				return false;
			}
			if (filter === "slow" && (entry.latency_ms ?? 0) < SLOW_MS) {
				return false;
			}
			if (filter === "model" && entry.event_type !== "model_call") {
				return false;
			}
			if (filter === "tool" && entry.event_type !== "exec_call") {
				return false;
			}
			if (!needle) {
				return true;
			}
			const values = [
				entry.agent_id,
				entry.error,
				entry.feature,
				entry.model,
				entry.provider,
				entry.request_id,
				entry.session_id,
			];
			const haystack = values
				.filter((value): value is string => Boolean(value))
				.join("\n");
			if (regexQuery) {
				try {
					return new RegExp(query, "i").test(haystack);
				} catch {
					return false;
				}
			}
			return haystack.toLowerCase().includes(needle);
		});
	}, [audit.entries, filter, query, regexQuery]);

	const summary = useMemo(() => {
		const latency = audit.entries.flatMap((entry) =>
			entry.latency_ms === null ? [] : [entry.latency_ms]
		);
		const quality = audit.entries.flatMap((entry) =>
			entry.eval_score === null ? [] : [entry.eval_score]
		);
		return {
			averageLatency:
				latency.length === 0
					? null
					: latency.reduce((total, value) => total + value, 0) / latency.length,
			errors: audit.entries.filter((entry) => Boolean(entry.error)).length,
			quality:
				quality.length === 0
					? null
					: quality.reduce((total, value) => total + value, 0) / quality.length,
			tokens: audit.entries.reduce(
				(total, entry) =>
					total + (entry.input_tokens ?? 0) + (entry.output_tokens ?? 0),
				0
			),
			spend: audit.entries.reduce(
				(total, entry) => total + (entry.cost_micro_usd ?? 0),
				0
			),
		};
	}, [audit.entries]);
	const discoveredGroups = useMemo(
		() => discoverGroups(audit.entries),
		[audit.entries]
	);

	const runSecuritySweep = async () => {
		const targetAgent = agentId.trim();
		if (!targetAgent) {
			setSecurityError("Enter an agent id or select an agent event first.");
			return;
		}
		setSecurityRunning(true);
		setSecurityError(null);
		try {
			setSecurityResult(
				normalizeRedteam(await runObservabilityRedteam(targetAgent))
			);
		} catch (cause) {
			setSecurityError(
				cause instanceof Error ? cause.message : "Security sweep failed"
			);
		} finally {
			setSecurityRunning(false);
		}
	};

	const runQualityEval = async () => {
		const targetAgent = agentId.trim();
		if (!targetAgent) {
			setEvalError("Enter an agent id or select an agent event first.");
			return;
		}
		setEvalRunning(true);
		setEvalError(null);
		try {
			setEvalResult(normalizeEval(await runObservabilityEval(targetAgent)));
		} catch (cause) {
			setEvalError(
				cause instanceof Error ? cause.message : "Quality evaluation failed"
			);
		} finally {
			setEvalRunning(false);
		}
	};

	const importTrace = async () => {
		if (!(selectedRunId && agentId.trim())) {
			return;
		}
		setImporting(true);
		setImportMessage(null);
		try {
			const result = objectRecord(
				await importObservabilityTrace({
					agent_id: agentId.trim(),
					run_id: selectedRunId,
				})
			);
			const suite = objectRecord(result?.suite);
			setImportMessage(
				result?.added === false
					? `This trace is already in ${typeof suite?.name === "string" ? suite.name : "the Quality suite"}.`
					: `Added to ${typeof suite?.name === "string" ? suite.name : "Quality tests"}.`
			);
		} catch (cause) {
			setImportMessage(
				cause instanceof Error ? cause.message : "Trace import failed"
			);
		} finally {
			setImporting(false);
		}
	};

	const pruneAudit = async () => {
		setPruneRunning(true);
		setPruneMessage(null);
		try {
			const result = objectRecord(await pruneObservabilityAudit());
			const deletedRows =
				typeof result?.deleted_rows === "number" ? result.deleted_rows : 0;
			setPruneMessage(`Retention applied · ${deletedRows} rows removed`);
			await auditQuery.refetch();
		} catch (cause) {
			setPruneMessage(
				cause instanceof Error ? cause.message : "Audit retention failed"
			);
		} finally {
			setPruneRunning(false);
		}
	};

	const scoreOutput = async () => {
		if (!scoreResponse.trim()) {
			return;
		}
		setScoreRunning(true);
		setScoreError(null);
		try {
			const result = objectRecord(
				await scoreObservabilityOutput({
					agent_id: agentId.trim() || undefined,
					assertions: scoreRubric.trim()
						? [{ kind: "llm_rubric", rubric: scoreRubric.trim() }]
						: [],
					model: selected?.model ?? undefined,
					prompt: selected?.model ?? "",
					response: scoreResponse,
				})
			);
			const score = objectRecord(result?.score);
			setScoreResult(typeof score?.overall === "number" ? score.overall : null);
		} catch (cause) {
			setScoreError(
				cause instanceof Error ? cause.message : "Online scoring failed"
			);
		} finally {
			setScoreRunning(false);
		}
	};

	const saveView = () => {
		const name = viewName.trim();
		if (!name) {
			return;
		}
		setSavedViews((previous) => [
			...previous.filter((view) => view.name !== name),
			{
				filter,
				id: crypto.randomUUID(),
				name,
				query,
				timeRange,
			},
		]);
		setViewName("");
	};

	const deleteView = (id: string) => {
		setSavedViews((previous) => previous.filter((view) => view.id !== id));
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-auto">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
				<header className="flex flex-wrap items-center justify-end gap-3">
					<div className="flex items-center gap-2">
						<Badge
							variant={
								auditStatus === "live"
									? "outline"
									: auditStatus === "checking"
										? "secondary"
										: "destructive"
							}
						>
							<span
								className={`mr-1.5 inline-block size-1.5 rounded-full ${
									auditStatus === "live"
										? "bg-success"
										: auditStatus === "checking"
											? "bg-muted-foreground"
											: "bg-destructive"
								}`}
							/>
							{auditStatus === "live"
								? "Live · 15s"
								: auditStatus === "checking"
									? "Checking…"
									: "Unavailable"}
						</Badge>
						<Button
							aria-label="Refresh observability"
							disabled={auditQuery.isFetching}
							onClick={() => auditQuery.refetch()}
							size="icon-sm"
							variant="ghost"
						>
							<HugeiconsIcon className="size-4" icon={Refresh01Icon} />
						</Button>
						<Button
							disabled={pruneRunning || auditStatus !== "live"}
							loading={pruneRunning}
							onClick={() => pruneAudit()}
							size="sm"
							variant="ghost"
						>
							Prune local audit
						</Button>
					</div>
				</header>
				{pruneMessage ? (
					<p className="text-muted-foreground text-xs" role="status">
						{pruneMessage}
					</p>
				) : null}

				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
					{[
						["Requests", formatNumber(audit.entries.length)],
						["Errors", formatNumber(summary.errors)],
						[
							"Avg latency",
							summary.averageLatency === null
								? "—"
								: `${Math.round(summary.averageLatency)}ms`,
						],
						["Quality", formatScore(summary.quality)],
						["Tokens", formatNumber(summary.tokens)],
						["Spend", formatCost(summary.spend)],
						["Window", windowLabel(timeRange)],
					].map(([label, value]) => (
						<div
							className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3"
							key={label}
						>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wide">
								{label}
							</span>
							<span className="font-medium text-base tabular-nums">
								{value}
							</span>
						</div>
					))}
				</div>

				<section className="flex flex-col gap-3">
					<div>
						<h2 className="font-medium text-sm">Discover</h2>
						<p className="mt-1 text-muted-foreground text-xs">
							Find the dominant provider/model and failure patterns in the
							current window.
						</p>
					</div>
					<div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
						<div className="flex flex-col gap-2 sm:flex-row">
							<Input
								aria-label="Saved observability view name"
								className="h-8 min-w-0 flex-1"
								onChange={(event) => setViewName(event.target.value)}
								placeholder="Name this view, e.g. Checkout failures"
								value={viewName}
							/>
							<Button disabled={!viewName.trim()} onClick={saveView} size="sm">
								Save current view
							</Button>
						</div>
						{savedViews.length > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{savedViews.map((view) => (
									<div className="flex items-center gap-0.5" key={view.id}>
										<Button
											className="h-7 text-xs"
											onClick={() => {
												setFilter(view.filter);
												setQuery(view.query);
												setTimeRange(view.timeRange);
											}}
											size="sm"
											variant="outline"
										>
											{view.name}
										</Button>
										<Button
											aria-label={`Remove saved view ${view.name}`}
											className="size-7"
											onClick={() => deleteView(view.id)}
											size="icon-sm"
											variant="ghost"
										>
											×
										</Button>
									</div>
								))}
							</div>
						) : null}
						{discoveredGroups.length === 0 ? (
							<p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs">
								No patterns to discover yet.
							</p>
						) : (
							<div className="flex flex-col gap-2">
								{discoveredGroups.map((group) => (
									<div className="flex flex-col gap-1" key={group.key}>
										<div className="flex items-center justify-between gap-2 text-xs">
											<span className="min-w-0 truncate font-medium">
												{group.key}
											</span>
											<span className="shrink-0 text-muted-foreground">
												{group.count} · {Math.round(group.percent * 100)}%
											</span>
										</div>
										<div className="h-2 overflow-hidden rounded-full bg-muted">
											<div
												className={`h-full rounded-full ${group.errorCount > 0 ? "bg-destructive" : "bg-primary"}`}
												style={{
													width: `${Math.max(4, group.percent * 100)}%`,
												}}
											/>
										</div>
										<span className="text-[10px] text-muted-foreground">
											{group.errorCount} errors
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<div>
						<h2 className="font-medium text-sm">Trace explorer</h2>
						<p className="mt-1 text-muted-foreground text-xs">
							Search model calls, errors, slow requests, and tool events. Select
							a row to inspect correlated Core spans.
						</p>
					</div>
					<div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
						<div className="flex flex-col gap-2 sm:flex-row">
							<div className="relative min-w-0 flex-1">
								<HugeiconsIcon
									className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
									icon={Search01Icon}
								/>
								<Input
									aria-label="Search observability"
									className="pl-8 text-foreground"
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search model, provider, request id, or error"
									style={{
										WebkitTextFillColor: "var(--foreground)",
										color: "var(--foreground)",
									}}
									value={query}
								/>
							</div>
							<label className="flex items-center justify-between gap-2 rounded-md border px-2 text-[10px]">
								<span>Regex</span>
								<Switch
									aria-label="Regex observability search"
									checked={regexQuery}
									onCheckedChange={setRegexQuery}
								/>
							</label>
							<NativeSelect
								aria-label="Observability filter"
								className="w-full sm:w-40"
								onChange={(event) =>
									setFilter(event.target.value as ObservabilityFilter)
								}
								style={{
									WebkitTextFillColor: "var(--foreground)",
									color: "var(--foreground)",
								}}
								value={filter}
							>
								<NativeSelectOption value="all">All events</NativeSelectOption>
								<NativeSelectOption value="errors">
									Errors only
								</NativeSelectOption>
								<NativeSelectOption value="slow">
									Slow &gt; 1s
								</NativeSelectOption>
								<NativeSelectOption value="model">
									Model calls
								</NativeSelectOption>
								<NativeSelectOption value="tool">Tool calls</NativeSelectOption>
							</NativeSelect>
							<NativeSelect
								aria-label="Observability window"
								className="w-full sm:w-40"
								onChange={(event) =>
									setTimeRange(event.target.value as ObservabilityWindow)
								}
								style={{
									WebkitTextFillColor: "var(--foreground)",
									color: "var(--foreground)",
								}}
								value={timeRange}
							>
								<NativeSelectOption value="1h">Last hour</NativeSelectOption>
								<NativeSelectOption value="24h">
									Last 24 hours
								</NativeSelectOption>
								<NativeSelectOption value="7d">Last 7 days</NativeSelectOption>
								<NativeSelectOption value="all">
									All available
								</NativeSelectOption>
							</NativeSelect>
						</div>
						<div className="overflow-hidden rounded-lg border">
							<div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide">
								<span>Event</span>
								<span>Latency</span>
								<span>Quality</span>
								<span>Cost</span>
							</div>
							{visibleEntries.length === 0 ? (
								<p className="p-6 text-center text-muted-foreground text-xs">
									{auditQuery.isLoading
										? "Loading trace events…"
										: "No events match this view."}
								</p>
							) : (
								visibleEntries.map((entry) => (
									<button
										className={`grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-t px-3 py-2.5 text-left text-foreground text-xs transition-colors hover:bg-muted/40 ${selectedId === entry.id ? "bg-primary/5" : ""}`}
										data-testid={`observability-event-${entry.id}`}
										key={entry.id}
										onClick={() => setSelectedId(entry.id)}
										style={{
											WebkitTextFillColor: "var(--foreground)",
											color: "var(--foreground)",
										}}
										type="button"
									>
										<span className="flex min-w-0 items-center gap-2">
											<span
												className={`size-1.5 shrink-0 rounded-full ${entry.error ? "bg-destructive" : "bg-success"}`}
											/>
											<span className="min-w-0 truncate font-medium">
												{entry.model ??
													entry.command ??
													entry.event_type ??
													"event"}
											</span>
											<Badge
												className="hidden px-1.5 py-0 text-[10px] sm:inline-flex"
												variant="outline"
											>
												{entry.provider ?? entry.event_type ?? "event"}
											</Badge>
										</span>
										<span className="whitespace-nowrap text-muted-foreground">
											{entry.latency_ms === null
												? "—"
												: `${entry.latency_ms}ms`}
										</span>
										<span>{formatScore(entry.eval_score)}</span>
										<span className="whitespace-nowrap text-muted-foreground">
											{formatCost(entry.cost_micro_usd)}
										</span>
									</button>
								))
							)}
						</div>
					</div>
				</section>

				{selected ? (
					<section className="flex flex-col gap-3">
						<div>
							<h2 className="font-medium text-sm">Selected trace</h2>
							<p className="mt-1 text-muted-foreground text-xs">
								Core stores tool input fingerprints, while full prompts and
								responses stay in the conversation transcript.
							</p>
						</div>
						<div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="font-medium text-sm">
										{selected.model ?? selected.command ?? "Trace event"}
									</p>
									<p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
										{selected.session_id ?? selected.request_id}
									</p>
								</div>
								<div className="flex flex-wrap justify-end gap-2">
									{selectedRunId && agentId ? (
										<Button
											loading={importing}
											onClick={() => importTrace()}
											size="sm"
											variant="outline"
										>
											Add to Quality tests
										</Button>
									) : null}
									{selectedRunId ? (
										<Button
											onClick={() => openActivitySession(selectedRunId)}
											size="sm"
											variant="outline"
										>
											Open conversation
										</Button>
									) : null}
								</div>
							</div>
							{importMessage ? (
								<p className="text-status-info text-xs" role="status">
									{importMessage}
								</p>
							) : null}
							{selected.session_id ? (
								<div className="overflow-hidden rounded-lg border">
									<div className="flex items-center gap-2 bg-muted/40 px-3 py-2 text-xs">
										<HugeiconsIcon
											className="size-3.5 text-muted-foreground"
											icon={ArrowDown01Icon}
										/>
										<span className="font-medium">Core run spans</span>
										<span className="text-muted-foreground">
											{trace.length} recorded
										</span>
									</div>
									{trace.map((span) => (
										<div
											className="flex items-start gap-3 border-t px-3 py-2.5 text-xs"
											key={span.id}
										>
											<div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-info/10 text-status-info">
												<HugeiconsIcon
													className="size-3.5"
													icon={
														span.kind === "model-call" ? ZapIcon : Clock01Icon
													}
												/>
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-2">
													<span className="font-medium">{span.name}</span>
													<Badge
														className="px-1.5 py-0 text-[10px]"
														variant="outline"
													>
														{span.kind}
													</Badge>
													<span className="text-muted-foreground">
														{spanDuration(span)}
													</span>
												</div>
												<p className="mt-1 text-muted-foreground">
													{span.error ??
														(span.args_hash
															? `tool input fingerprint ${span.args_hash.slice(0, 12)}…`
															: "Completed without a persisted payload")}
												</p>
											</div>
											{span.error ? (
												<HugeiconsIcon
													className="mt-1 size-3.5 text-status-destructive"
													icon={AlertCircleIcon}
												/>
											) : (
												<HugeiconsIcon
													className="mt-1 size-3.5 text-status-success"
													icon={Tick02Icon}
												/>
											)}
										</div>
									))}
								</div>
							) : null}
						</div>
						<div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
							<div>
								<h3 className="font-medium text-sm">Online scoring</h3>
								<p className="mt-1 text-muted-foreground text-xs">
									Score a completed output without replaying its provider call.
								</p>
							</div>
							<Textarea
								aria-label="Completed output to score"
								className="min-h-20 font-mono text-xs"
								onChange={(event) => setScoreResponse(event.target.value)}
								placeholder="Paste the completed model output here…"
								value={scoreResponse}
							/>
							<Input
								aria-label="Online scoring rubric"
								className="h-8 text-xs"
								onChange={(event) => setScoreRubric(event.target.value)}
								placeholder="Optional rubric for an LLM judge"
								value={scoreRubric}
							/>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									disabled={!scoreResponse.trim()}
									loading={scoreRunning}
									onClick={() => scoreOutput()}
									size="sm"
									variant="outline"
								>
									Score output
								</Button>
								{scoreResult === null ? null : (
									<Badge variant="secondary">
										Online score {formatScore(scoreResult)}
									</Badge>
								)}
							</div>
							{scoreError ? (
								<p className="text-status-destructive text-xs" role="alert">
									{scoreError}
								</p>
							) : null}
						</div>
					</section>
				) : null}

				<section className="flex flex-col gap-3">
					<div>
						<h2 className="font-medium text-sm">Quality evaluation</h2>
						<p className="mt-1 text-muted-foreground text-xs">
							Replay the shared built-in dataset through Gateway and score
							latency, policy, and output quality.
						</p>
					</div>
					<div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="text-muted-foreground text-xs">
								Uses the Promptfoo-compatible evaluator contract.
							</span>
							<Button
								loading={evalRunning}
								onClick={() => runQualityEval()}
								size="sm"
								variant="outline"
							>
								Run quality eval
							</Button>
						</div>
						{evalError ? (
							<p className="text-status-destructive text-xs" role="alert">
								{evalError}
							</p>
						) : null}
						{evalResult ? (
							<div className="flex flex-wrap gap-2 text-xs">
								<Badge variant="secondary">
									Overall {formatScore(evalResult.aggregate.mean_overall)}
								</Badge>
								<Badge variant="outline">
									Policy {formatScore(evalResult.aggregate.policy_pass_rate)}
								</Badge>
								<span className="self-center text-muted-foreground">
									{evalResult.aggregate.total_cases} cases
								</span>
							</div>
						) : null}
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<div>
						<h2 className="font-medium text-sm">Security sweep</h2>
						<p className="mt-1 text-muted-foreground text-xs">
							Fixed local probes for injection, jailbreaks, PII leakage, tool
							misuse, and toxic output. No real tool is executed.
						</p>
					</div>
					<div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
							<label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
								<span className="font-medium">Agent id</span>
								<Input
									className="text-foreground"
									onChange={(event) => setAgentId(event.target.value)}
									placeholder="Select an event or enter an agent id"
									style={{
										WebkitTextFillColor: "var(--foreground)",
										color: "var(--foreground)",
									}}
									value={agentId}
								/>
							</label>
							<Button
								loading={securityRunning}
								onClick={() => runSecuritySweep()}
								size="sm"
								variant="outline"
							>
								Run security checks
							</Button>
						</div>
						{securityError ? (
							<p className="text-status-destructive text-xs" role="alert">
								{securityError}
							</p>
						) : null}
						{securityResult ? (
							<div className="flex flex-col gap-2">
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<Badge variant="secondary">
										{securityResult.summary.protected}/
										{securityResult.summary.total} protected
									</Badge>
									<Badge
										className="text-foreground"
										variant={
											securityResult.summary.needs_attention > 0
												? "destructive"
												: "outline"
										}
									>
										{securityResult.summary.needs_attention} needs attention
									</Badge>
									<span className="text-muted-foreground">
										{securityResult.model}
									</span>
								</div>
								<div className="overflow-hidden rounded-lg border">
									{securityResult.strategies.map((strategy) => (
										<div
											className="flex flex-wrap items-start justify-between gap-2 border-t px-3 py-2.5 text-xs first:border-t-0"
											key={strategy.id}
										>
											<div className="min-w-0">
												<p className="font-medium">{strategy.name}</p>
												<p className="mt-1 text-muted-foreground">
													{strategy.detail}
												</p>
											</div>
											<Badge
												variant={
													strategy.protected ? "secondary" : "destructive"
												}
											>
												{strategy.protected ? "Protected" : "Needs attention"}
											</Badge>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				</section>

				<div className="rounded-lg border border-dashed bg-muted/10 p-3 text-muted-foreground text-xs leading-relaxed">
					Observe → inspect the correlated trace → add a failure to Quality
					tests → compare prompts/models with the Promptfoo-compatible evaluator
					catalog.
				</div>
			</div>
		</div>
	);
}

// Keep the navigation action next to the app-owned view so a future host can
// replace the bridge implementation without leaking a direct node target.
function openActivitySession(sessionId: string): void {
	window.ryu?.shell
		.openTab({ path: "/chat", conversationId: sessionId, title: "Chat" })
		.catch(() => undefined);
}
