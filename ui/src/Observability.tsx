import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
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
import { ObservabilityDiscoverSection } from "./Observability-discover-section.tsx";
import { ObservabilityEvalSecuritySections } from "./Observability-eval-security.tsx";
import {
	discoverGroups,
	type EvalResult,
	formatCost,
	formatNumber,
	formatScore,
	loadSavedViews,
	type ObservabilityFilter,
	type ObservabilityWindow,
	REFRESH_MS,
	type RedteamResult,
	type SavedObservabilityView,
	SLOW_MS,
	savedViewsKey,
	windowLabel,
	windowStart,
} from "./Observability-model.ts";
import { ObservabilitySelectedTrace } from "./Observability-selected-trace.tsx";
import { ObservabilityTraceExplorer } from "./Observability-trace-explorer.tsx";
import {
	normalizeAudit,
	observabilityAuditStatus,
} from "./observability-state.ts";
import {
	evalProjectionSchema,
	redteamProjectionSchema,
	traceProjectionSchema,
} from "./schemas.ts";

export function Observability() {
	const tl = useLiteralMessages();
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
		() => traceProjectionSchema.parse(traceQuery.data),
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
				redteamProjectionSchema.parse(
					await runObservabilityRedteam(targetAgent)
				)
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
			setEvalResult(
				evalProjectionSchema.parse(await runObservabilityEval(targetAgent))
			);
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
			const result = await importObservabilityTrace({
				agent_id: agentId.trim(),
				run_id: selectedRunId,
			});
			const suite = result.suite;
			setImportMessage(
				result?.added === false
					? tl("This trace is already in {name}.", { name: suite.name })
					: tl("Added to {name}.", { name: suite.name })
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
			const result = await pruneObservabilityAudit();
			const deletedRows = result.deleted_rows ?? 0;
			setPruneMessage(
				tl("Retention applied · {deletedRows} rows removed", {
					deletedRows: String(deletedRows),
				})
			);
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
			const result = await scoreObservabilityOutput({
				agent_id: agentId.trim() || undefined,
				assertions: scoreRubric.trim()
					? [{ kind: "llm_rubric", rubric: scoreRubric.trim() }]
					: [],
				model: selected?.model ?? undefined,
				prompt: selected?.model ?? "",
				response: scoreResponse,
			});
			setScoreResult(result.score.overall);
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
							<span className="text-muted-foreground text-xs uppercase tracking-wide">
								{label}
							</span>
							<span className="font-medium text-base tabular-nums">
								{value}
							</span>
						</div>
					))}
				</div>

				<ObservabilityDiscoverSection
					deleteView={deleteView}
					discoveredGroups={discoveredGroups}
					savedViews={savedViews}
					saveView={saveView}
					setFilter={setFilter}
					setQuery={setQuery}
					setTimeRange={setTimeRange}
					setViewName={setViewName}
					viewName={viewName}
				/>

				<ObservabilityTraceExplorer
					auditQuery={auditQuery}
					filter={filter}
					query={query}
					regexQuery={regexQuery}
					selectedId={selectedId}
					setFilter={setFilter}
					setQuery={setQuery}
					setRegexQuery={setRegexQuery}
					setSelectedId={setSelectedId}
					setTimeRange={setTimeRange}
					timeRange={timeRange}
					visibleEntries={visibleEntries}
				/>

				{selected ? (
					<ObservabilitySelectedTrace
						agentId={agentId}
						importing={importing}
						importMessage={importMessage}
						importTrace={importTrace}
						scoreError={scoreError}
						scoreOutput={scoreOutput}
						scoreResponse={scoreResponse}
						scoreResult={scoreResult}
						scoreRubric={scoreRubric}
						scoreRunning={scoreRunning}
						selected={selected}
						selectedRunId={selectedRunId}
						setScoreResponse={setScoreResponse}
						setScoreRubric={setScoreRubric}
						trace={trace}
						traceQuery={traceQuery}
					/>
				) : null}

				<ObservabilityEvalSecuritySections
					agentId={agentId}
					evalError={evalError}
					evalResult={evalResult}
					evalRunning={evalRunning}
					runQualityEval={runQualityEval}
					runSecuritySweep={runSecuritySweep}
					securityError={securityError}
					securityResult={securityResult}
					securityRunning={securityRunning}
					setAgentId={setAgentId}
				/>

				<div className="rounded-lg border border-dashed bg-muted/10 p-3 text-muted-foreground text-xs leading-relaxed">
					Observe → inspect the correlated trace → add a failure to Quality
					tests → compare prompts/models with the Promptfoo-compatible evaluator
					catalog.
				</div>
			</div>
		</div>
	);
}
