import { afterEach, describe, expect, mock, test } from "bun:test";

import {
	getObservabilityTrace,
	importObservabilityTrace,
	listActivity,
	listObservabilityAudit,
	openActivitySession,
	pruneObservabilityAudit,
	runObservabilityEval,
	runObservabilityRedteam,
	scoreObservabilityOutput,
	subscribeLiveActivity,
} from "./bridge-core.ts";
import type { RyuBridge } from "./ryu.d.ts";

Object.defineProperty(globalThis, "window", {
	configurable: true,
	value: {},
	writable: true,
});
const originalBridge = window.ryu;

afterEach(() => {
	window.ryu = originalBridge;
});

const aggregate = {
	mean_latency: 0,
	mean_overall: 1,
	mean_substring_match: null,
	mean_token_efficiency: 1,
	policy_pass_rate: 1,
	total_cases: 0,
};
const evaluated = { aggregate, cases: [] };
const score = {
	assertion_score: 1,
	assertions: [],
	assertions_pass: true,
	latency_score: 1,
	overall: 1,
	policy_pass: true,
	prompt: "",
	response_text: "answer",
	substring_match: null,
	token_efficiency: 1,
};
const scored = {
	kind: "online_score",
	score,
	scored_at: "today",
} satisfies Awaited<ReturnType<RyuBridge["activity"]["score"]>>;
const feedItem = {
	agent_id: null,
	body: null,
	created_at: 1,
	id: "event-after-grant",
	kind: "run",
	level: "info",
	metadata: {},
	session_id: null,
	source: "runs",
	title: "Run ready",
} satisfies import("./types.ts").ActivityItem;

function installBridge(
	overrides: Partial<RyuBridge["activity"]> = {}
): RyuBridge {
	const bridge: RyuBridge = {
		activity: {
			audit: mock(async () => ({ count: 0, entries: [], reachable: true })),
			eval: mock(async () => evaluated),
			importTrace: mock(async () => ({
				added: true,
				case: {},
				source_run_id: "run-7",
				suite: {
					agent_id: "agent-1",
					config: {},
					created_at: 1,
					id: "suite-3",
					name: "Quality",
					updated_at: 1,
				},
				version: null,
			})),
			list: mock(async () => []),
			prune: mock(async () => ({ deleted_rows: 0 })),
			redteam: mock(async () => ({
				campaign_id: "probe",
				model: "model-a",
				strategies: [],
				summary: { needs_attention: 0, protected: 0, total: 0 },
			})),
			score: mock(async () => scored),
			trace: mock(async () => ({ spans: [] })),
			...overrides,
		},
		context: null,
		shell: {
			openTab: mock(async () => undefined),
			subscribeTheme: mock(() => ({ dispose: () => undefined })),
		},
	};
	window.ryu = bridge;
	return bridge;
}

describe("activity production bridge", () => {
	test("forwards every read and observability control without exposing the inert target", async () => {
		const bridge = installBridge();
		const score = { agent_id: "agent-1", response: "answer", threshold: 0.8 };

		await listActivity(
			{ token: "must-not-cross-the-frame", url: "https://ignored.invalid" },
			{ limit: 37 }
		);
		await listObservabilityAudit({ errors_only: true, limit: 11 });
		await pruneObservabilityAudit();
		await scoreObservabilityOutput(score);
		await getObservabilityTrace("run-7");
		await runObservabilityRedteam("agent-1", "model-a");
		await runObservabilityEval("agent-2");
		await importObservabilityTrace({
			agent_id: "agent-1",
			run_id: "run-7",
			suite_id: "suite-3",
		});

		expect(bridge.activity.list).toHaveBeenCalledWith({ limit: 37 });
		expect(bridge.activity.audit).toHaveBeenCalledWith({
			errors_only: true,
			limit: 11,
		});
		expect(bridge.activity.prune).toHaveBeenCalledTimes(1);
		expect(bridge.activity.score).toHaveBeenCalledWith(score);
		expect(bridge.activity.trace).toHaveBeenCalledWith({ run_id: "run-7" });
		expect(bridge.activity.redteam).toHaveBeenCalledWith({
			agent_id: "agent-1",
			model: "model-a",
		});
		expect(bridge.activity.eval).toHaveBeenCalledWith({
			agent_id: "agent-2",
			model: undefined,
		});
		expect(bridge.activity.importTrace).toHaveBeenCalledWith({
			agent_id: "agent-1",
			run_id: "run-7",
			suite_id: "suite-3",
		});
	});

	test("fails closed without a granted host bridge and permits an exact retry", async () => {
		window.ryu = undefined;
		expect(() => listActivity()).toThrow(
			"The activity capability is not available for this app (grant activity:read)."
		);

		const list = mock(async () => [feedItem]);
		installBridge({ list });
		expect(await listActivity(undefined, { limit: 1 })).toEqual([feedItem]);
		expect(list).toHaveBeenCalledTimes(1);
		expect(list).toHaveBeenCalledWith({ limit: 1 });
	});

	test("filters the live channel and disposes exactly once when the caller unmounts", () => {
		let emit: ((event: { channel?: string }) => void) | undefined;
		const dispose = mock(() => undefined);
		const bridge = installBridge();
		bridge.shell.subscribeEvents = mock((options) => {
			emit = options.onEvent;
			return { dispose };
		});
		const onActivity = mock(() => undefined);

		const unsubscribe = subscribeLiveActivity(onActivity);
		emit?.({ channel: "runs" });
		emit?.({ channel: "activity" });
		unsubscribe();

		expect(bridge.shell.subscribeEvents).toHaveBeenCalledWith({
			channels: ["activity"],
			onEvent: expect.any(Function),
		});
		expect(onActivity).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	test("degrades a missing event subscription and contains rejected navigation", async () => {
		const bridge = installBridge();
		const rejectedNavigation = mock(async () => {
			throw new Error("shell grant revoked");
		});
		bridge.shell.openTab = rejectedNavigation;

		const unsubscribe = subscribeLiveActivity(mock(() => undefined));
		unsubscribe();
		openActivitySession("session-9");
		await Promise.resolve();
		await Promise.resolve();

		expect(rejectedNavigation).toHaveBeenCalledWith({
			conversationId: "session-9",
			path: "/chat",
			title: "Chat",
		});
	});
});

test("Activity validates native feed replies before publishing incomplete records", async () => {
	const bridge = installBridge();
	const malformed = mock(async () => [{ id: "incomplete" }]);
	Object.defineProperty(bridge.activity, "list", {
		configurable: true,
		value: malformed,
	});
	await expect(listActivity()).rejects.toThrow();
	expect(malformed).toHaveBeenCalledTimes(1);
});
