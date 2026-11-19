# Product decision brief

This file is intentionally short. It prevents an agent from inventing a visual direction or optimizing a screenshot instead of a user outcome.

## User and goal

- Primary user/role:
- User goal (why, not the UI action):
- Primary scenario:
- Non-goals:

## Decision policy

- What may the system suggest, draft, or execute?
- What requires explicit user authorization?
- What must remain reversible?
- What evidence must be visible before a consequential action?

## AI behavior

- Input/context shown to the model:
- Output provenance/source:
- Uncertainty or confidence communication:
- User correction/feedback path:
- Failure, timeout, and retry behavior:
- Human override or opt-out:

## Verification contract

- Completion condition observable in the UI:
- Error condition observable in the UI:
- Recovery action observable in the UI:
- Backend receipt required? If yes, where is it independently checked?

## Evidence status

Mark each item `OBSERVED`, `INFERRED`, or `NOT_VERIFIED`. A declaration here does not prove runtime behavior; it only states what must be tested.
