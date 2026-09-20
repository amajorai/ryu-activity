// The activity feed model — ported verbatim from the desktop client
// `apps/desktop/src/lib/api/activity.ts` (snake_case, mirroring Core's serde
// shapes), which the host bridge reuses: its closure calls `listActivity` and
// forwards the result unchanged over the bridge, so the app reads exactly what the
// desktop page read.

export type ActivityLevel = "info" | "success" | "warning";

/** One record in the activity feed (mirrors Core's `ActivityItem`). */
export interface ActivityItem {
	agent_id: string | null;
	body: string | null;
	created_at: number;
	id: string;
	kind: string;
	level: ActivityLevel;
	metadata: Record<string, unknown>;
	session_id: string | null;
	source: string;
	title: string;
}
