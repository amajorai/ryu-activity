// The Activity companion (Path B, ui_format:"html"). PORTED VERBATIM from the
// desktop `apps/desktop/src/pages/ActivityPage.tsx`: same @ryu/ui components, same
// layout, same helper component tree (day-group sections + ActivityRow), same
// classNames, same empty/loading/error states. ONLY the data layer changed — the
// shell-only hooks (`useActivity` = `@tanstack/react-query` + a live SSE overlay,
// `useTabsContext().openTab`) are replaced by their sandbox equivalents (the
// `window.ryu.activity` bridge + the host-owned `shell.subscribeEvents` stream + the
// `openSession` shell-nav verb), so the rendered UI is indistinguishable from the
// desktop page.
//
// Activity feed: a single chronological stream of everything the active node's
// modules emit — monitor alerts, quest changes, approvals, meetings, runs, and
// manual notes — newest first, grouped by day. Items carrying a session_id open
// that chat session on click. The desktop page overlaid a live SSE stream on the
// react-query list; under the sandbox CSP (`connect-src 'none'`) the companion
// subscribes through the generic host event bridge, so the frame never opens a socket
// or receives a node token.

import { Pulse01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@ryu/ui/components/empty.tsx";
import { PullToRefresh } from "@ryu/ui/components/pull-to-refresh.tsx";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import { useEffect, useMemo } from "react";
import {
	listActivity,
	openActivitySession,
	subscribeLiveActivity,
} from "./bridge.ts";
import { compactAge } from "./time.ts";
import type { ActivityItem, ActivityLevel } from "./types.ts";

const MS_PER_SECOND = 1000;

/** The initial page size — mirrors the desktop `useActivity` default. */
const DEFAULT_LIMIT = 100;

// Level → the accent color of the row's left rail and dot.
const LEVEL_DOT: Record<ActivityLevel, string> = {
	info: "bg-muted-foreground/50",
	success: "bg-emerald-500",
	warning: "bg-amber-500",
};

const LEVEL_BADGE: Record<ActivityLevel, "secondary" | "default" | "outline"> =
	{
		info: "secondary",
		success: "default",
		warning: "outline",
	};

// Friendly labels for the module slugs Core emits as `source`.
const SOURCE_LABEL: Record<string, string> = {
	monitors: "Monitor",
	quests: "Task",
	approvals: "Approval",
	meetings: "Meeting",
	runs: "Run",
	manual: "Note",
};

const WORD_SEPARATOR = /[_\s-]+/;

function sourceLabel(source: string): string {
	const known = SOURCE_LABEL[source];
	if (known) {
		return known;
	}
	const words = source.split(WORD_SEPARATOR).filter(Boolean);
	if (words.length === 0) {
		return "Activity";
	}
	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** A calendar-day heading like "Today", "Yesterday", or "Mar 4". */
function dayLabel(createdAtSeconds: number): string {
	const date = new Date(createdAtSeconds * MS_PER_SECOND);
	const now = new Date();
	const startOf = (d: Date) =>
		new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const today = startOf(now);
	const day = startOf(date);
	const dayMs = 24 * 60 * 60 * MS_PER_SECOND;
	if (day === today) {
		return "Today";
	}
	if (day === today - dayMs) {
		return "Yesterday";
	}
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface DayGroup {
	items: ActivityItem[];
	key: string;
	label: string;
}

/** Bucket a newest-first item list into contiguous day groups. */
function groupByDay(items: ActivityItem[]): DayGroup[] {
	const groups: DayGroup[] = [];
	let current: DayGroup | null = null;
	for (const item of items) {
		const label = dayLabel(item.created_at);
		if (!current || current.label !== label) {
			current = { key: label, label, items: [] };
			groups.push(current);
		}
		current.items.push(item);
	}
	return groups;
}

export function Activity() {
	const listQuery = useQuery({
		queryKey: ["activity", "list"],
		queryFn: () => listActivity(undefined, { limit: DEFAULT_LIMIT }),
	});
	useEffect(
		() => subscribeLiveActivity(() => void listQuery.refetch()),
		[listQuery.refetch]
	);
	const items = listQuery.data ?? [];
	const loading = listQuery.isLoading;
	const error =
		listQuery.error instanceof Error ? listQuery.error.message : null;

	const groups = useMemo(() => groupByDay(items), [items]);

	const openSession = (item: ActivityItem) => {
		if (!item.session_id) {
			return;
		}
		openActivitySession(item.session_id);
	};

	return (
		<PullToRefresh className="h-full" onRefresh={() => listQuery.refetch()}>
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
				<header>
					<h1 className="font-medium text-xl">Activity</h1>
					<p className="text-muted-foreground text-sm">
						Everything happening on this node, newest first.
					</p>
				</header>

				{loading ? (
					<div className="flex justify-center py-10">
						<Spinner className="size-5" />
					</div>
				) : null}

				{error && !loading ? (
					<div className="rounded-lg bg-card p-4">
						<p className="font-medium text-sm">Couldn't load activity</p>
						<p className="mt-1 text-muted-foreground text-sm">{error}</p>
					</div>
				) : null}

				{!(loading || error) && items.length === 0 ? (
					<Empty className="py-10">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<HugeiconsIcon className="size-6" icon={Pulse01Icon} />
							</EmptyMedia>
							<EmptyTitle>No activity yet</EmptyTitle>
							<EmptyDescription>
								Monitor alerts, finished tasks, runs, and notes from this node
								will show up here as they happen.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : null}

				{groups.map((group) => (
					<section className="flex flex-col gap-2" key={group.key}>
						<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							{group.label}
						</h2>
						<div className="flex flex-col gap-2">
							{group.items.map((item) => (
								<ActivityRow item={item} key={item.id} onOpen={openSession} />
							))}
						</div>
					</section>
				))}
			</div>
		</PullToRefresh>
	);
}

function ActivityRow({
	item,
	onOpen,
}: {
	item: ActivityItem;
	onOpen: (item: ActivityItem) => void;
}) {
	const clickable = Boolean(item.session_id);
	const content = (
		<div className="flex items-start gap-3">
			<span
				aria-hidden="true"
				className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_DOT[item.level]}`}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-sm">{item.title}</p>
					<Badge variant={LEVEL_BADGE[item.level]}>
						{sourceLabel(item.source)}
					</Badge>
					<span className="ml-auto shrink-0 text-muted-foreground text-xs">
						{compactAge(item.created_at * MS_PER_SECOND)}
					</span>
				</div>
				{item.body ? (
					<p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
						{item.body}
					</p>
				) : null}
			</div>
		</div>
	);

	if (clickable) {
		return (
			<Button
				className="rounded-lg bg-card p-3 text-left transition-colors hover:bg-accent"
				onClick={() => onOpen(item)}
				type="button"
			>
				{content}
			</Button>
		);
	}
	return <div className="rounded-lg bg-card p-3">{content}</div>;
}
