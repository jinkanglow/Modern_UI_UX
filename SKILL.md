---
name: uiux-decision-engine
description: Evidence-first UI/UX code review, interaction verification, and regression triage for web applications.
license: MIT
---

# UI/UX Decision Engine

Use this skill when asked to audit a web app's UI/UX, verify an interaction, or diagnose a specific user-task failure. Do not infer task success from aesthetics or static code inspection.

## Execution protocol

Read [references/decision-framework.md](references/decision-framework.md) when the task involves product definition, AI behavior, a new interaction, or a UX quality decision. Use it to produce concrete contracts and scenarios; do not reproduce external source text.

1. Establish the repository root, framework, route, target user task, and permitted scope of changes. If a task is not specified, identify concrete user-facing flows and mark them as candidate tasks, not verified requirements.
   For AI-assisted flows, also establish the decision policy: what the system may suggest versus execute, what needs authorization, what uncertainty/provenance is visible, and how the user corrects or reverses an output. Use `examples/DESIGN.md` as the minimum brief shape.
2. Run `node src/cli.js audit <path> --format json --out audit.json` from the plugin repository, or use the installed `uiux` executable. Record which files were analyzed and any excluded files.
3. Treat static findings as source-level observations or inferences only. For interaction claims, write or inspect a versioned contract and run `uiux assure --tasks <tasks.json> --contract <contract.json> --execute --browser chromium --out assurance.json` against a running target. Run `uiux doctor` first when dependencies are uncertain.
4. Distinguish UX assertion failures, infrastructure failures, missing evidence, and human-review findings. Do not convert `INCOMPLETE`, `BLOCK`, or `UNVERIFIED` to success.
5. For each actionable finding, report rule ID, source location when grounded, observed behavior, task impact, reproduction steps, proposed minimal change, and a verification test. If evidence is missing, explicitly say so.
   For AI output, never treat confidence styling, fluent copy, or a successful request as evidence of correctness. Require explicit uncertainty, provenance, correction, and failure/recovery checks in the task contract.
6. Propose a patch before applying changes. Only modify project code when the user authorizes it. After a change, rerun relevant tests and compare against the same frozen baseline; never claim broad accuracy from a fixture-only test.
7. For new AI product work, require the authority class (`suggest`, `draft`, `prepare`, `execute`, or `monitor`), visible uncertainty/provenance, correction, recovery, and consequential-action evidence before treating the flow as sufficiently specified.
8. Keep output concise: prioritize blocking task failures over cosmetic inconsistencies. Load only the files and contracts needed for the task. Never copy book text or third-party licensed code into the output.

## Controlled evolution

When asked to improve the plugin from past results, use `uiux evolve` with a
versioned manifest. Treat each result as an episode with an explicit state,
action, reward, terminal outcome, and evidence link where available. Compare
against a pinned baseline and require a declared improvement threshold plus
zero safety regressions. Never invent rewards, silently rewrite rules, or
promote a candidate from one anecdotal success. `CANDIDATE_ACCEPTED` means
only that the offline gate passed; it is not deployment authorization.

## Review and benchmark controls

Before exporting an adjudicated dataset, run `uiux dataset review-audit <dataset>`; `uiux dataset export <dataset> --out <dataset>/curated.json` now enforces that gate automatically. The gate checks procedural consistency, not reviewer identity, independence, or representativeness. Never report benchmark precision or recall without clearly defining the labeled evaluation population.

## Result language

- **Observed**: directly supported by a recorded runtime or source artifact.
- **Inferred**: follows from static analysis or incomplete behavior evidence.
- **Not verified**: requires a browser run, independent reviewer, or real-world confirmation.

Do not imply a business transaction succeeded solely because browser assertions passed.

## v3.8 machine-readable rule selection

Before scanning, select a **declared** task family using `node src/cli.js rule-contracts --task form` (valid tags: `form`, `navigation`, `accessibility`, `content`, `mobile`, `keyboard`, `security`, `motion`, `design-system`, `feedback`, `destructive`, `recovery`). Combine tags with commas; use `--rule-id HTML-004` for an exact detector. Read only the selected entries in `rules/contracts/`, and load `references/decision-mechanics.md` only for relevant task mechanisms. No task tag is guessed from aesthetics.

Each existing static detector has three executable fixtures: trigger, counterexample, and boundary. Run `npm run test:rule-contracts` before changing a detector. Some boundary cases intentionally document a heuristic false positive or false negative: do not reinterpret these as validated UX outcomes. Selection status `SELECTED_NOT_EXECUTED` must never be reported as an audit result. `rule-contracts` without filters lists coverage metadata only.

For AI-assisted workflows, prioritize: clear authority to act, observable progress, uncertainty and provenance, recoverable failure, context preservation, and confirmation of consequential side effects. These require explicit task contracts and runtime/human evidence; the static catalog is not sufficient.

## v3.9 observed-state contracts

Use `uiux state-machine --contract interaction.json --policy state-policy.json [--observations observed.json]` to validate explicit task states. A state label on an interaction step is a *declaration*, never runtime proof. State-machine observations are supplied evidence, not independently authenticated. The CLI returns `NOT_VERIFIED` when absent or incomplete and a nonzero exit code. AI-assisted tasks require uncertainty evidence; agent actions require explicit authorization evidence. Business completion claims require a backend receipt but even a supplied receipt is **not authenticated** by this tool. Do not invent state observations or infer consent from a click without a declared authorization evidence check.

### Browser-to-state verification (v4.0)

Use `uiux browser-state` with an explicit policy and assertion bindings. Require each state to have a real browser check and ordered evidence; never derive state observations from step labels. Do not map DOM/network checks to human authorization or backend receipts. Treat report-supplied evidence as unauthenticated, and never assert that a transaction completed without independently verified backend evidence.

### v4.1 timed assertion discipline

When task requires ordering evidence, run `interaction` then `browser-timeline` with a matching contract, policy and bindings. Treat `ASSERTIONS_TIMED` as ordered assertion evidence only. Do not infer exact state entry times, transient-state coverage, real backend completion, human authorization or trusted browser provenance. Treat missing timestamps as `TIMING_UNVERIFIED` and refuse success claims.

## v4.2 — Continuous interaction observation

For stateful tasks, require an explicit `data-ux-state` on a stable element and a scoped observation policy. Run `uiux observe-states --contract ... --policy ... --execute` when Playwright and the application are available. Inspect `NOT_VERIFIED` separately from `FAIL`. Never infer backend persistence, actual consent, or state-transition completeness from DOM mutation records. The observer captures only state labels and scoped request metadata; no input values or response bodies.

### v4.3 observation review

When investigating asynchronous form submissions, run `audit-causality` with an explicit observation policy. Classify overlapping requests, missing outcomes, and overflow separately. Never infer user-initiated cancellation from `requestfailed`, compare browser and Node timestamps as if synchronized, or treat an HTTP response as a persisted business transaction. Require real browser execution for browser-observed claims.

### v4.4 network outcomes
Run `node src/cli.js network-outcomes --report interaction.json --out network-outcomes.json` after browser observation. Do not attribute `ERR_ABORTED` to user intent without independently recorded cancellation intent. Treat network timeout, UI waiting timeout, HTTP error, and unclassified transport failure as distinct observations. A browser observation does not prove backend persistence.
