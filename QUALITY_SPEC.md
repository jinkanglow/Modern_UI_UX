# UI/UX Decision Engine 4.5 specification

## Product promise

The engine helps an AI agent make and verify UI/UX decisions for a declared
user task. It does not generate a universal visual style, certify usability,
or infer human satisfaction from screenshots.

## Required inputs

| Input | Required | Purpose |
|---|---:|---|
| source path | yes | code and markup to inspect |
| user goal | yes for product work | durable outcome, not a feature name |
| primary scenario | yes for product work | situation and key path |
| interaction contract | yes before success claim | executable browser assertions |
| AI brief | yes for AI behavior | authority, evidence, uncertainty, recovery |
| state policy | yes for stateful/consequential flows | allowed transitions and evidence |

The repository supplies machine-readable schemas for the AI brief, interaction
contract, task manifest, state policy, and evolution manifest. `DESIGN.md`
remains human intent; it is not silently converted into executable rules.

## Decision statuses

- `READY_FOR_VERIFICATION`: inputs are structurally sufficient; runtime proof is still required.
- `NOT_VERIFIED`: a heuristic, missing observation, or incomplete evidence remains.
- `NEEDS_INPUT`: required intent or task contract is absent.
- `BLOCK`: a confirmed source issue, invalid brief, failed assertion, or integrity failure prevents the gate.

These statuses are not a UX score and must not be averaged into one number.

## AI behavior minimum

An AI operation must declare `suggest`, `draft`, `prepare`, `execute`, or
`monitor`. If it can execute an external or durable side effect, it must also
declare authorization, scope, preview/summary, cancellation or undo policy,
and a completion receipt. AI output that affects a decision must expose a
useful uncertainty signal, evidence/source scope, and a correction path.

## Verification minimum

The primary flow must cover idle, result, and error, plus the applicable
uncertain, partial, refused, stale, timeout, retry, authorization, saved, and
undo states. Each claimed state needs a browser assertion; business completion
needs independently checked backend evidence. A contract label alone is not
an observation.

## Static audit boundary

Static rules identify source patterns and candidates. They can block confirmed
high-risk patterns, but they cannot prove task success, visual quality, human
satisfaction, backend persistence, consent, or AI correctness.

## Token and scope policy

Scan only the declared target and selected task rules. Do not load all
references or all repository files into an agent context by default. The
reported token value is a planning estimate only; it is not provider billing
telemetry.

## Definition of done for a release

1. The brief and interaction contract are versioned.
2. Static rule contracts have trigger, counterexample, and boundary fixtures.
3. Primary success and highest-risk failure paths execute in a real browser.
4. Evidence and reports are integrity-checked and privacy-reviewed.
5. The same contract passes after the change, with no new false positives or
   false negatives in the labeled evaluation set.
6. Known limitations are written beside the claim; no screenshot-only success
   statement is shipped.

## Controlled evolution

Policy changes are treated as candidates, not self-authorized upgrades. A
candidate must be evaluated against a pinned baseline using recorded episodes,
an explicit reward definition, and safety constraints. The engine may compute
action values and compare aggregate reward, but it does not invent rewards,
rewrite rules, deploy changes, or infer causality from a single outcome. A
candidate is promotable only when the improvement threshold is met and safety
regressions are zero; a human or separately authorized release process still
performs promotion.
