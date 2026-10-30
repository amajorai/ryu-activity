import {
	AlertCircleIcon,
	ArrowDown01Icon,
	Clock01Icon,
	Tick02Icon,
	ZapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import type { QueryResult } from "@ryu/ui/hooks/use-query.ts";
import {
	formatScore,
	spanDuration,
	type TraceSpan,
} from "./Observability-model.ts";
import type { AuditEntry } from "./observability-state.ts";

export function ObservabilitySelectedTrace({
	agentId,
	importing,
	importMessage,
	importTrace,
	scoreError,
	scoreOutput,
	scoreResponse,
	scoreResult,
	scoreRubric,
	scoreRunning,
	selected,
	selectedRunId,
	setScoreResponse,
	setScoreRubric,
	trace,
	traceQuery,
}: {
	agentId: string;
	importing: boolean;
	importMessage: string | null;
	importTrace: () => Promise<void>;
	scoreError: string | null;
	scoreOutput: () => Promise<void>;
	scoreResponse: string;
	scoreResult: number | null;
	scoreRubric: string;
	scoreRunning: boolean;
	selected: AuditEntry;
	selectedRunId: string | null;
	setScoreResponse: (value: string) => void;
	setScoreRubric: (value: string) => void;
	trace: TraceSpan[];
	traceQuery: QueryResult<unknown>;
}) {
	const tl = useLiteralMessages();
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h2 className="font-medium text-sm">Selected trace</h2>
				<p className="mt-1 text-muted-foreground text-xs">
					Core stores tool input fingerprints, while full prompts and responses
					stay in the conversation transcript.
				</p>
			</div>
			<div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="font-medium text-sm">
							{selected.model ?? selected.command ?? "Trace event"}
						</p>
						<p className="mt-1 break-all font-mono text-muted-foreground text-xs">
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
								{traceQuery.isLoading
									? "Loading…"
									: traceQuery.isError
										? "Unavailable"
										: tl("{length} recorded", {
												length: String(trace.length),
											})}
							</span>
						</div>
						{traceQuery.isError ? (
							<div className="flex flex-col items-start gap-2 p-3">
								<p className="text-status-destructive text-xs" role="alert">
									{tl("Couldn’t load the Core run trace. {message}", {
										message:
											traceQuery.error instanceof Error
												? traceQuery.error.message
												: "Try again.",
									})}
								</p>
								<Button
									disabled={traceQuery.isFetching}
									loading={traceQuery.isFetching}
									onClick={() => void traceQuery.refetch()}
									size="sm"
									variant="outline"
								>
									Retry trace
								</Button>
							</div>
						) : traceQuery.isLoading ? (
							<p className="p-3 text-muted-foreground text-xs" role="status">
								Loading Core run spans…
							</p>
						) : (
							trace.map((span) => (
								<div
									className="flex items-start gap-3 border-t px-3 py-2.5 text-xs"
									key={span.id}
								>
									<div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-info/10 text-status-info">
										<HugeiconsIcon
											className="size-3.5"
											icon={span.kind === "model-call" ? ZapIcon : Clock01Icon}
										/>
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-medium">{span.name}</span>
											<Badge variant="outline">{span.kind}</Badge>
											<span className="text-muted-foreground">
												{spanDuration(span)}
											</span>
										</div>
										<p className="mt-1 text-muted-foreground">
											{span.error ??
												(span.args_hash
													? tl("tool input fingerprint {fingerprint}…", {
															fingerprint: span.args_hash.slice(0, 12),
														})
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
							))
						)}
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
					className="min-h-20"
					onChange={(event) => setScoreResponse(event.target.value)}
					placeholder="Paste the completed model output here…"
					value={scoreResponse}
				/>
				<Input
					aria-label="Online scoring rubric"
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
							{tl("Online score {score}", { score: formatScore(scoreResult) })}
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
	);
}

// Keep the navigation action next to the app-owned view so a future host can
// replace the bridge implementation without leaking a direct node target.
function openActivitySession(sessionId: string): void {
	window.ryu?.shell
		.openTab({ path: "/chat", conversationId: sessionId, title: "Chat" })
		.catch(() => undefined);
}
