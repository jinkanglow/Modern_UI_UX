# Decision mechanisms and implementation boundaries

This document is original engineering guidance. It does not reproduce source text, diagrams, case studies, or protected expressive material. It separates enforceable source patterns from runtime and human research questions.

## 1. User goal versus implementation path

Record the actor, goal, entry point, completion condition, critical states, and recovery path before choosing rules. A user wants a saved profile, not to call a `POST` endpoint. An endpoint returning 200 is not sufficient proof of persisted state. Require the observable postcondition and, for consequential operations, an independent backend check.

## 2. Recognition instead of forced recall

When a user needs a hidden command, error code, or remembered procedure to recover, capture the task, current UI state, available action labels, and the exact missing instruction. Static code cannot determine whether a workflow demands memory; mark `HUMAN_REVIEW_REQUIRED` until observed in a task study.

## 3. Contextual feedback and recoverability

Model `idle -> pending -> success|failure -> retry|cancel`. Assert that a failed request does not display success; that retry remains available; that entered data survives recoverable failure; and that repeated activation does not create duplicate writes. Distinguish network requests from server-side business completion.

## 4. Consequence-weighted error handling

Prioritize failure by consequence and recovery cost, not by visual prominence. For irreversible operations, specify confirmation, authorization, reversible window if supported, and audit record. A modal is not automatically better: evaluate the task and consequence before prescribing it.

## 5. Information architecture and progressive detail

For complex workflows, verify that primary task controls remain findable, advanced controls are reachable, and changing presentation modes preserves user context. Static nesting depth is not a valid universal usability threshold. Record navigation attempts and observed abandonment in user studies.

## 6. AI output, uncertainty, and user control

For AI-generated answers, distinguish model output from verified facts. When a tool or model cannot support an answer, show uncertainty and an actionable correction or escalation route. Preserve the original input for regeneration; show what changed after a retry. Do not imply model confidence equals calibrated correctness.

## 7. Agent autonomy and interruption

Represent agent tasks with `proposed -> approved -> running -> paused|failed|completed` transitions. For external side effects, require a scope-of-authority check, clear action preview, and observable cancellation or recovery behavior. UI confirmation does not prove an external action was undone.

## 8. Cost of false positives versus false negatives

Define the cost of missing a defect and the cost of flagging a harmless pattern for each task. Review severity by consequence, exposure, recoverability, and evidence strength. Do not derive a universal numeric score without labeled outcomes. Report TP/FP/FN on frozen, independently reviewed samples.

## 9. Research evidence is not simulated evidence

Personas, needs, and task frequency require real research or explicit customer input. Generated personas are hypotheses, not participants. A browser fixture tests implementation behavior; it does not validate user comprehension or desirability.

## 10. Minimum evidence packet for a user-facing failure

`task_id`, `route`, `starting_state`, `action_sequence`, `expected_postcondition`, `observed_postcondition`, `browser_environment`, `contract_digest`, `source_revision`, `failure_class`, and links to available trace/screenshot. Missing fields must be marked `NOT_VERIFIED`, never silently inferred.

## v3.8 implementation boundary

The shipped `rules/contracts/*.json` files cover **25 existing static detectors**, with 75 executable case definitions. They do not implement all ten mechanisms above as runtime detectors. The mechanisms above define subsequent browser contracts and human review requirements. `rule-contracts --task` only filters explicit tags; it does not discover user goals, execute a browser, or establish UX effectiveness.
