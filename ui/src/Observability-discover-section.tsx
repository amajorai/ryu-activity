import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import styles from "./activity.module.css";
import type {
	ActivityDiscoverStyle,
	DiscoverGroup,
	ObservabilityFilter,
	ObservabilityWindow,
	SavedObservabilityView,
} from "./Observability-model.ts";

export function ObservabilityDiscoverSection({
	deleteView,
	discoveredGroups,
	saveView,
	savedViews,
	setFilter,
	setQuery,
	setTimeRange,
	setViewName,
	viewName,
}: {
	deleteView: (id: string) => void;
	discoveredGroups: DiscoverGroup[];
	saveView: () => void;
	savedViews: SavedObservabilityView[];
	setFilter: (value: ObservabilityFilter) => void;
	setQuery: (value: string) => void;
	setTimeRange: (value: ObservabilityWindow) => void;
	setViewName: (value: string) => void;
	viewName: string;
}) {
	const tl = useLiteralMessages();
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h2 className="font-medium text-sm">Discover</h2>
				<p className="mt-1 text-muted-foreground text-xs">
					Find the dominant provider/model and failure patterns in the current
					window.
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
									onClick={() => {
										setFilter(view.filter);
										setQuery(view.query);
										setTimeRange(view.timeRange);
									}}
									size="xs"
									variant="outline"
								>
									{view.name}
								</Button>
								<Button
									aria-label={tl("Remove saved view {name}", {
										name: view.name,
									})}
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
						{discoveredGroups.map((group) => {
							const coverage: ActivityDiscoverStyle = {
								"--activity-discover-width": `${Math.max(4, group.percent * 100)}%`,
							};
							return (
								<div className="flex flex-col gap-1" key={group.key}>
									<div className="flex items-center justify-between gap-2 text-xs">
										<span
											className="min-w-0 truncate font-medium"
											title={group.key}
										>
											{group.key}
										</span>
										<span className="shrink-0 text-muted-foreground">
											{group.count} · {Math.round(group.percent * 100)}%
										</span>
									</div>
									<div className="h-2 overflow-hidden rounded-full bg-muted">
										<div
											className={`${styles.discoverFill} h-full rounded-full ${group.errorCount > 0 ? "bg-destructive" : "bg-primary"}`}
											style={coverage}
										/>
									</div>
									<span className="text-muted-foreground text-xs">
										{tl("{errorCount} errors", {
											errorCount: String(group.errorCount),
										})}
									</span>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</section>
	);
}
