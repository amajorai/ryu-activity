import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import {
	type EvalResult,
	formatScore,
	type RedteamResult,
} from "./Observability-model.ts";

export function ObservabilityEvalSecuritySections({
	agentId,
	evalError,
	evalResult,
	evalRunning,
	runQualityEval,
	runSecuritySweep,
	securityError,
	securityResult,
	securityRunning,
	setAgentId,
}: {
	agentId: string;
	evalError: string | null;
	evalResult: EvalResult | null;
	evalRunning: boolean;
	runQualityEval: () => Promise<void>;
	runSecuritySweep: () => Promise<void>;
	securityError: string | null;
	securityResult: RedteamResult | null;
	securityRunning: boolean;
	setAgentId: (value: string) => void;
}) {
	const tl = useLiteralMessages();
	return (
		<>
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
								{tl("Overall {score}", {
									score: formatScore(evalResult.aggregate.mean_overall),
								})}
							</Badge>
							<Badge variant="outline">
								{tl("Policy {score}", {
									score: formatScore(evalResult.aggregate.policy_pass_rate),
								})}
							</Badge>
							<span className="self-center text-muted-foreground">
								{tl("{total_cases} cases", {
									total_cases: String(evalResult.aggregate.total_cases),
								})}
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
								onChange={(event) => setAgentId(event.target.value)}
								placeholder="Select an event or enter an agent id"
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
									variant={
										securityResult.summary.needs_attention > 0
											? "destructive"
											: "outline"
									}
								>
									{tl("{needs_attention} needs attention", {
										needs_attention: String(
											securityResult.summary.needs_attention
										),
									})}
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
											variant={strategy.protected ? "secondary" : "destructive"}
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
		</>
	);
}
