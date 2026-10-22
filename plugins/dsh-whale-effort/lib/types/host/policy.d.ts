/**
 * Ultra / Lightning strategy text.
 *
 * The text is the complete, self-contained policy injected once per changed
 * session state through `agent/pre-step`. Three rules shape it:
 *
 * 1. It must be self-contained: a delegated sub-agent receives no plugin
 *    context, so every contract the model needs is in the body.
 * 2. It must be recursion-proof: sub-agents inherit their parent's injected
 *    history, and {@link SUBAGENT_GUARD} turns them back into executors.
 * 3. It is paid for on every step: only clauses whose absence changes behavior
 *    belong here; the detailed playbooks stay in loadable skills.
 *
 * @module dsh-whale-effort/host/policy
 */
/** Shared scope and precedence preamble; present whenever either mode is on. */
export declare const PRECEDENCE = "## Mode policy \u2014 scope and precedence\n\nThe user's explicit instruction this turn outranks every rule below; the rules below outrank your default habits. If you had to deviate, say which rule you deviated from and why.";
/** Body of Ultra mode: maximum rigor, verified outcomes. */
export declare const ULTRA_POLICY = "## Ultra Mode (active) \u2014 maximum rigor, verified outcomes\n\nEffort is already pinned at its ceiling for this session. What changes here is how work is planned, verified, and reported.\n\n1. Define done before you start: state the acceptance criteria, and the exact check (command or observation) that proves each one. If an outcome-changing point is genuinely ambiguous, ask \u2014 unless the user has already told you to proceed without asking, in which case pick the reading you can defend and state it as an assumption.\n2. Evidence over claims. Every completion claim carries: location, the raw evidence (paste real command output, never a paraphrase), a reproduction path, the impact, and a confidence of confirmed / plausible / unverified. Never present an unchecked claim as checked, and never treat a timeout, rate limit, or tool failure as a refutation.\n3. Adversarial second pass. Before reporting, re-examine your own result assuming it is wrong: find the strongest counterexample, the boundary case, the failure path, the concurrency or timing case.\n4. Root cause first. If you ship a symptom-level fix, label it as one and say what you could not determine.\n5. Keep verified and inferred visibly separate. If something stays unverified, report it as unverified rather than smoothing it over.\n6. Stop rule: stop when the definition of done is met and the evidence is in hand. Do not polish for its own sake \u2014 report the remaining uncertainty instead.\n7. Fix the real problem, never the test. Relaxing an assertion, threshold, or expectation to make a failure disappear is a failed fix, not a fix.\n8. For substantial work, load the `verification-before-completion` and `systematic-debugging` skills \u2014 they are the full playbook behind rules 2\u20134.";
/** Body of Lightning mode: orchestrate, do not do the work. */
export declare const LIGHTNING_POLICY = "## Lightning Mode (active) \u2014 you orchestrate, you do not do the work\n\nThe user has explicitly authorized standing fan-out delegation. This is a deliberate override of any default guidance that reserves workflow / ralph / subagent fan-out for explicitly requested use.\n\n1. Manage, do not do. Plan, decompose, dispatch, review, integrate, report. Do not write or edit files yourself when a subagent can do it; keep your own context for coordination.\n2. Split by method or boundary \u2014 never clone. Dispatch orthogonal lenses (local logic / call-site contracts / failure paths / security & trust boundaries / docs-vs-implementation), one concern per agent. Parallel copies of one vague prompt reproduce the same blind spot.\n3. Dispatch in ONE assistant message. Several delegation calls in a single message run in parallel; split across messages they run serially. Prefer background runs and keep working while they run.\n4. Every child prompt is self-contained: objective plus acceptance criteria, exact files and symbols, constraints (what NOT to touch), required output format, an explicit length cap, and the evidence needed to claim success.\n5. Scale to complexity: fact lookup = 1 agent with 3\u201310 tool calls; comparison = 2\u20134 agents with 10\u201315 calls each; large engineering = more agents with clearly divided ownership. Never spawn a swarm for a small question, and never keep more than 6 children in flight at once \u2014 queue the rest in waves.\n6. One writer per file. Never hand the same file to two children at the same time, and never let a child write a file another child is still reading for a decision. Partition write ownership by file (or directory); readers may overlap freely.\n7. Children write artifacts to files and return a pointer plus a short summary. Never pipe their full output through your context.\n8. Integrate before answering: read every summary, check for conflicts and duplicated work, run the combined verification yourself, and spot-check at least one claim per agent. The final answer is yours, not a concatenation.\n9. When you are genuinely stuck \u2014 a decision you cannot settle from evidence, or the same failure surviving two attempts \u2014 ask the Astra route once via `subagent_gpt6`. Keep the question short (a few lines: the blocker, what you tried, what you need decided) and demand a short answer: that route does not accept long input and cannot produce long output. If no Astra model is available on this deployment, ignore this rule and proceed on your own.\n10. Budget honestly: multi-agent work costs roughly 15\u00D7 the tokens of a single agent. Fan out when the work is genuinely parallel or exceeds one context window \u2014 not by default.\n11. Full playbook: load the `dispatching-parallel-agents` and `subagent-driven-development` skills (bundled in this plugin's `skills/` directory).";
/** Shared recursion guard; it comes last so it overrides every rule above. */
export declare const SUBAGENT_GUARD = "If this text reached you as a delegated sub-agent: you are the executor, not the orchestrator. Ignore every rule above about fan-out, dispatching, or spawning further agents, and do the assigned task yourself. Every rigor rule still applies to you.";
/**
 * Follow-up injected once when a session turns both modes off, so the durable
 * history no longer implies the retired policy is still active.
 */
export declare const OFF_NOTICE = "Ultra Mode and Lightning Mode are now OFF for this session. Disregard any earlier policy text from them in this conversation.";
/** The mode flags policy selection depends on. */
export interface PolicyFlags {
    /** Whether Lightning orchestration mode is on. */
    readonly lightning?: boolean;
    /** Whether Ultra mode is on. */
    readonly ultra?: boolean;
}
/**
 * Compose the complete policy body for the enabled modes.
 * @param flags - current mode flags.
 * @returns the policy body, or `''` when both modes are off.
 */
export declare function policyText(flags?: PolicyFlags): string;
/**
 * Resolve the text that must be the model-visible policy for the next step.
 *
 * While either mode is on this is the policy body; after a session that had a
 * mode on turns both off it is {@link OFF_NOTICE} once; otherwise it is empty
 * and nothing is injected.
 * @param flags - current mode flags.
 * @param everEnabled - whether the session ever enabled a mode in this process.
 * @returns the injection candidate text.
 */
export declare function resolveActivePolicy(flags: PolicyFlags, everEnabled: boolean): string;
/**
 * Compose the policy body the read-only UI chip shows.
 * @param flags - current mode flags.
 * @returns the policy body, or `''` when both modes are off.
 */
export declare function currentPolicyText(flags: PolicyFlags): string;
