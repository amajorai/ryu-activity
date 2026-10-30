import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@ryu/ui/components/input-group.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { Switch } from "@ryu/ui/components/switch.tsx";
import {
	formatCost,
	formatScore,
	type ObservabilityFilter,
	type ObservabilityWindow,
} from "./Observability-model.ts";
import type { AuditEntry } from "./observability-state.ts";
import {
	observabilityFilterSchema,
	observabilityWindowSchema,
} from "./schemas.ts";

export function ObservabilityTraceExplorer({
	auditQuery,
	filter,
	query,
	regexQuery,
	selectedId,
	setFilter,
	setQuery,
	setRegexQuery,
	setSelectedId,
	setTimeRange,
	timeRange,
	visibleEntries,
}: {
	auditQuery: { isLoading: boolean };
	filter: ObservabilityFilter;
	query: string;
	regexQuery: boolean;
	selectedId: string | null;
	setFilter: (value: ObservabilityFilter) => void;
	setQuery: (value: string) => void;
	setRegexQuery: (value: boolean) => void;
	setSelectedId: (value: string | null) => void;
	setTimeRange: (value: ObservabilityWindow) => void;
	timeRange: ObservabilityWindow;
	visibleEntries: AuditEntry[];
}) {
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h2 className="font-medium text-sm">Trace explorer</h2>
				<p className="mt-1 text-muted-foreground text-xs">
					Search model calls, errors, slow requests, and tool events. Select a
					row to inspect correlated Core spans.
				</p>
			</div>
			<div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
				<div className="flex flex-col gap-2 sm:flex-row">
					<InputGroup className="min-w-0 flex-1">
						<InputGroupAddon>
							<HugeiconsIcon className="size-3.5" icon={Search01Icon} />
						</InputGroupAddon>
						<InputGroupInput
							aria-label="Search observability"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search model, provider, request id, or error"
							value={query}
						/>
					</InputGroup>
					<label className="flex items-center justify-between gap-2 rounded-md border px-2 text-xs">
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
							setFilter(observabilityFilterSchema.parse(event.target.value))
						}
						value={filter}
					>
						<NativeSelectOption value="all">All events</NativeSelectOption>
						<NativeSelectOption value="errors">Errors only</NativeSelectOption>
						<NativeSelectOption value="slow">Slow &gt; 1s</NativeSelectOption>
						<NativeSelectOption value="model">Model calls</NativeSelectOption>
						<NativeSelectOption value="tool">Tool calls</NativeSelectOption>
					</NativeSelect>
					<NativeSelect
						aria-label="Observability window"
						className="w-full sm:w-40"
						onChange={(event) =>
							setTimeRange(observabilityWindowSchema.parse(event.target.value))
						}
						value={timeRange}
					>
						<NativeSelectOption value="1h">Last hour</NativeSelectOption>
						<NativeSelectOption value="24h">Last 24 hours</NativeSelectOption>
						<NativeSelectOption value="7d">Last 7 days</NativeSelectOption>
						<NativeSelectOption value="all">All available</NativeSelectOption>
					</NativeSelect>
				</div>
				<div className="overflow-hidden rounded-lg border">
					<div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 bg-muted/50 px-3 py-2 text-muted-foreground text-xs uppercase tracking-wide">
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
								type="button"
							>
								<span className="flex min-w-0 items-center gap-2">
									<span
										className={`size-1.5 shrink-0 rounded-full ${entry.error ? "bg-destructive" : "bg-success"}`}
									/>
									<span
										className="min-w-0 truncate font-medium"
										title={
											entry.model ??
											entry.command ??
											entry.event_type ??
											"event"
										}
									>
										{entry.model ??
											entry.command ??
											entry.event_type ??
											"event"}
									</span>
									<Badge className="hidden sm:inline-flex" variant="outline">
										{entry.provider ?? entry.event_type ?? "event"}
									</Badge>
								</span>
								<span className="whitespace-nowrap text-muted-foreground">
									{entry.latency_ms === null ? "—" : `${entry.latency_ms}ms`}
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
	);
}
