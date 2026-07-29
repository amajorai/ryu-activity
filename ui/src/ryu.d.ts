// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect. This app uses the `activity` surface (grant `activity:read`)
// for the feed, and the generic `shell` surface (grant `shell:integrate`) for shell
// integration — opening a chat tab and subscribing to the live host theme.
//
// The `list` return shape mirrors the desktop client the host reuses verbatim (the
// host closure calls `listActivity` and forwards Core's snake_case items), so
// `bridge.ts` re-declares the concrete `ActivityItem` type and casts this `unknown`.
//
// MIGRATION (docs/renderer-host-slice-1.md): the row-click previously used a BESPOKE
// `activity.openSession` host verb. It now goes through the generic, route-allowlisted
// `shell.openTab` — the same shell privilege a compiled-in panel gets from
// `useTabsContext().openTab`, now reachable from a decoupled companion.

export interface RyuActivity {
	/** GET /api/activity — the unified feed (capped, newest-first). */
	list(args?: { limit?: number }): Promise<unknown>;
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
