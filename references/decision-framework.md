# Decision framework for AI product UI

This is an implementation guide, not a style guide. Use it to turn a product
idea into inspectable behavior. Do not copy prose from external publications
into generated work.

## 1. Start from a human outcome

Write one sentence in this form:

`[role] wants to [goal] because [motivation], while [constraint/risk].`

Then separate:

- Goal: the durable outcome the person wants.
- Scenario: the situation that triggers the work.
- Task: the concrete UI operation used in this product.
- Completion: an observable product state, not “the user feels satisfied”.

Reject a brief that only lists features, screens, components, or model APIs.

## 2. Define the behavior before the surface

For each primary scenario, specify the smallest state machine:

`idle -> working -> result | uncertain | error -> recover | abandon`

For every state define:

| Field | Required decision |
|---|---|
| user can see | exact status, result, or missing information |
| user can do | allowed action and its target |
| system can do | network/model/side-effect operation |
| exit condition | observable DOM or backend evidence |
| recovery | retry, edit, undo, dismiss, or escalation |

Never use a single “loading” state for an AI action that can be queued,
streaming, partially complete, stale, refused, or failed.

## 3. AI-specific authority contract

Every AI capability must declare one of these operation classes:

- `suggest`: proposes content or a decision; no side effect.
- `draft`: creates editable work; user must review before commit.
- `prepare`: gathers inputs or stages a side effect; no commit.
- `execute`: performs an external or durable side effect.
- `monitor`: observes and reports; it must not silently act.

For `draft`, `prepare`, and `execute`, require:

1. scope of data and tools used;
2. authorization boundary;
3. visible provenance or source coverage;
4. uncertainty or insufficiency signal;
5. user correction path;
6. cancellation or undo policy;
7. failure and retry behavior;
8. receipt or durable completion evidence where applicable.

Do not make the user confirm a low-risk reversible edit repeatedly. Do require
an explicit confirmation immediately before an irreversible or externally
visible action, with a summary of what will happen.

## 4. Information and control rules

- Put the next useful action near the current result.
- Show enough system status to answer “what is happening, what is it using,
  and what can I do now?”
- Preserve user input and context across retry, validation, and model failure.
- Prefer inline, local feedback over a detached global notification for errors.
- Make destructive operations reversible when technically possible; otherwise
  preview the effect and require targeted confirmation.
- Do not use color, animation, or a confidence number as the only explanation.
- Keep terminology consistent with the user's mental model, not internal API
  names.

## 5. Scenario coverage matrix

At minimum, a primary AI flow should cover:

| Scenario | Required evidence |
|---|---|
| first use / empty | user knows what to provide and what will happen |
| valid result | result, source/context, next action |
| ambiguous or low confidence | uncertainty, clarification or safe alternative |
| partial result | what completed, what did not, continuation path |
| model refusal / policy block | reason at useful level, safe next action |
| stale or missing source | freshness/scope signal and recovery |
| network/model timeout | preserved input, retry, no duplicate side effect |
| user correction | correction is accepted and visibly applied |
| consequential commit | authorization, summary, receipt |
| undo / abandon | reversible outcome or explicit exit |

Each row becomes a scenario in an interaction contract. A row without a
selector, state, expected DOM assertion, or independent backend evidence is a
design intention, not a verification result.

## 6. Anti-slop quality gate

Do not reject a UI because it uses a particular color, radius, gradient, or
component library. Reject it when the implementation has evidence of a user
problem:

- generic controls with no accessible name or action outcome;
- a primary action whose progress, result, or failure is not observable;
- AI output with no source/uncertainty/correction path where the decision risk
  requires one;
- irreversible action without scope, authorization, or recovery evidence;
- placeholder/demo content presented as a completed product flow;
- decorative complexity that competes with the primary task or hides status;
- mobile, keyboard, reduced-motion, or text-scaling behavior not covered by
  the declared task.

Static detectors may identify candidates. Only a browser contract, state
observation, backend receipt, or human review can establish the corresponding
behavior.

## 7. Evaluation loop

Use a tight loop:

1. declare one goal and one primary scenario;
2. write the state and authority contract;
3. implement the smallest key path;
4. test the success path and the highest-risk failure path;
5. observe where the person hesitates, misunderstands, or loses work;
6. change the smallest causal part;
7. rerun the same contract and compare evidence;
8. only then expand the surface or add secondary scenarios.

The output of each iteration is a decision record: changed assumption, evidence
used, result, unresolved risk, and next test. Do not report a visual polish
change as a UX improvement without task evidence.
