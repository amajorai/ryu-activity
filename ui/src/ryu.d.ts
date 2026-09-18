// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect. This app uses the `activity` surface (grant `activity:read`)
// for the feed, and the generic `shell` surface (grant `shell:integrate`) for shell
// integration — opening a chat tab, subscribing to the live activity stream, and
// subscribing to the live host theme.
//
// The `list` return shape mirrors the desktop client the host reuses verbatim (the
// host closure calls `listActivity` and forwards Core's snake_case items), so
// `bridge.ts` re-declares the concrete `ActivityItem` type and casts this `unknown`.
//
// MIGRATION (docs/renderer-host-slice-1.md): the row-click previously used a BESPOKE
// `activity.openSession` host verb. It now goes through the generic, route-allowlisted
// `shell.openTab` — the same shell privilege a compiled-in panel gets from
// `useTabsContext().openTab`, now reachable from a decoupled companion.

export interface ActivityScoreInput {
	agent_id?: string;
	assertions?: unknown[];
	context?: unknown;
	cost_micro_usd?: number;
	description?: string;
	evaluators?: string[];
	expected?: string;
	id?: string;
	latency_ms?: number;
	metadata?: Record<string, unknown>;
	model?: string;
	prompt?: string;
	response: unknown;
	threshold?: number;
	vars?: Record<string, unknown>;
}

export interface RyuActivity {
	/** GET /api/gateway/audit through the trusted host, never from the frame. */
	audit(args?: {
		agent_id?: string;
		event_type?: string;
		errors_only?: boolean;
		from?: string;
		limit?: number;
		model?: string;
		provider?: string;
		until?: string;
		widget_instance_id?: string;
	}): Promise<unknown>;
	/** Run the shared Promptfoo-compatible quality evaluator for one agent. */
	eval(args: { agent_id: string; model?: string }): Promise<unknown>;
	/** Capture a run into the agent's first durable Quality suite. */
	importTrace(args: {
		agent_id?: string;
		run_id: string;
		suite_id?: string;
	}): Promise<unknown>;
	/** GET /api/activity — the unified feed (capped, newest-first). */
	list(args?: { limit?: number }): Promise<unknown>;
	/** Apply the local Gateway audit retention policy. */
	prune(): Promise<unknown>;
	/** Run the closed local security probe set for one agent. */
	redteam(args: { agent_id: string; model?: string }): Promise<unknown>;
	/** Score a completed output without replaying its provider request. */
	score(args: ActivityScoreInput): Promise<unknown>;
	/** GET /api/runs/:id/trace through the trusted host. */
	trace(args: { run_id: string }): Promise<unknown>;
}

/** A disposable handle a streaming shell subscription returns. `dispose()` releases
 *  the subscription early; it is also torn down automatically on frame unmount. */
export interface RyuShellSubscription {
	dispose(): void;
}

/** The generic shell-primitive lane (grant `shell:integrate`). Only the subset this
 *  app uses is declared; the full surface is in `docs/renderer-host-slice-1.md`. */
export interface RyuShell {
	/** Open a shell tab at an ALLOWLISTED route, forwarding `openTab` options. The
	 *  host rejects any non-allowlisted destination (anti-phishing). */
	openTab(args: {
		path: string;
		title?: string;
		conversationId?: string;
		forceNew?: boolean;
		initialPrompt?: string;
	}): Promise<void>;
	/** Subscribe to the host's generic node event stream. The host filters the
	 * requested channels against its allowlist and disposes the stream with the frame. */
	subscribeEvents?(opts: {
		channels: string[];
		onEvent: (event: { channel?: string; data?: unknown }) => void;
	}): RyuShellSubscription;
	/** Subscribe to the host's LIVE resolved theme tokens: `onChange` fires with the
	 *  current token map now and on every host theme change. */
	subscribeTheme(opts: {
		onChange: (tokens: Record<string, string>) => void;
	}): RyuShellSubscription;
}

export interface RyuBridge {
	activity: RyuActivity;
	context: { spaceId?: string; docId?: string } | null;
	shell: RyuShell;
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
