# Independent evaluation protocol (v1.2)

This repository does **not** include an independently reviewed real-project corpus. The bundled `evaluation-v12` fixtures are synthetic regression tests only. They cannot establish field precision, recall, WCAG conformance or user-task quality.

## Reproducible project sampling

1. Pre-register a sampling frame (technology, project inclusion criteria, repository license, project revision and date of selection). Avoid selecting projects only because the scanner already detects their problems.
2. Obtain a legally distributable, pinned snapshot of each repository. Record HTTPS repository URL, immutable Git commit SHA, relative source path and SHA-256 of each evaluated file. Do not redistribute third-party code without complying with its license.
3. Create a manifest with `schema_version: "1.2"`. Each case needs a unique `id`, `technology`, `origin`, `sha256`, `review`, and `annotations`.
4. Define the ground-truth annotation guideline **before** running the scanner. Use rule ID + source line + expected status. Annotate negatives as empty `annotations: []` only after reviewing the file.
5. For a strong independent evaluation, use two reviewers who label cases independently and adjudicate disagreements. Record reviewer identifiers (pseudonyms are acceptable), guideline version and the adjudication process in a separate review log. `independent-double` is metadata provided by dataset authors; the CLI checks its structure but cannot prove that independent review occurred.
6. Freeze the corpus and run `uiux evaluate path/to/manifest.json --out evaluation.json`. Retain scanner version, Node version, operating system and command invocation with the result.
7. Run the new scanner against the **same** frozen dataset, then `uiux evaluate path/to/manifest.json --baseline prior-evaluation.json`. Comparison fails when case IDs, source hashes, annotation hashes or schema versions differ. Check the review guideline separately.
8. Publish per-rule TP, FP, FN and unresolved `UNVERIFIED` cases; report stratified counts for synthetic vs real-project and by technology. Precision or recall with a zero denominator is `null`, not 100%.
9. Evaluate rendered behavior independently with browser tests, keyboard checks and human review. Static source-pattern labels cannot establish complete accessibility or task success.

## Manifest example

```json
{
  "schema_version": "1.2",
  "description": "Frozen evaluation cohort — description of sampling frame",
  "cases": [
    {
      "id": "react-project-a-001",
      "file": "snapshots/a/src/Page.tsx",
      "technology": "react",
      "origin": "real-project",
      "sha256": "<64-character SHA-256 of actual file>",
      "provenance": {
        "repository": "https://github.com/organization/repository",
        "revision": "<pinned Git commit SHA>",
        "source_path": "src/Page.tsx"
      },
      "review": {
        "method": "independent-double",
        "reviewers": ["reviewer-a", "reviewer-b"],
        "guideline_version": "annotation-guideline-1"
      },
      "annotations": []
    }
  ]
}
```

The example above is a **template**, not a verified project or usable dataset. Replace every placeholder with observed evidence. An empty annotation list is a claim that reviewers examined the file and found no expected findings.

## Known methodological limits

- The matching unit is `(rule_id, line, status)`; refactoring that moves code changes the evaluation outcome even when the semantic issue is unchanged.
- A missing expected `UNVERIFIED` candidate currently contributes to `fn` in the legacy evaluator. Treat it as an annotation mismatch, not a confirmed accessibility defect.
- Precision and recall are micro-averaged over confirmed source-pattern findings; they are not estimates of user experience quality.
- Source file SHA-256 protects snapshot integrity, not the validity of human annotations. Annotation hashes support change detection, not reviewer independence.
- The tool does not fetch repositories, verify remote commit existence, or authenticate reviewer identities. Such evidence must be obtained separately.

## v1.3 — Local real-project snapshot intake

The `uiux dataset add` command imports an **already acquired local file** into a
versioned draft dataset. It never fetches repositories, does not infer labels,
and does not claim to authenticate the supplied repository URL or revision.

```bash
node src/cli.js dataset add ./research-dataset \
  --source ./checked-out-project/src/App.tsx \
  --id project-a-app \
  --technology react \
  --repository https://github.com/owner/repo \
  --revision 0123456789abcdef0123456789abcdef01234567 \
  --source-path src/App.tsx
node src/cli.js dataset check ./research-dataset
```

This produces `research-dataset/manifest.json` with schema `1.3-draft` and a
copied source file under `snapshots/`. Each imported case is explicitly
`review.status = PENDING` with no annotations. The draft format is **not**
accepted by `uiux evaluate`; this prevents unreviewed data from being treated
as ground truth.

A research team must independently establish the repository license, confirm
that the checked-out commit matches the declared revision, record permitted
redistribution, develop rule-specific annotation guidance, and perform manual
review before preparing a separate evaluated manifest. The existing v1.2
review fields are declarations, not proof that two independent reviews occurred.

`dataset check` verifies SHA-256 snapshot integrity, not copyright, source
authenticity, user-task validity, accessibility conformance, or reviewer quality.
The tool intentionally does not bundle third-party source files in this release.

### Production readiness gates

1. Obtain permission to redistribute each selected fixture, or store only
   metadata and reproducible acquisition instructions.
2. Freeze repository URL, commit, source path, file SHA-256, analyzer version,
   and annotation protocol version.
3. Use two independent reviewers, retain disagreements, and adjudicate before
   calculating TP/FP/FN.
4. Separate synthetic from real-project results and report each technology
   independently; do not extrapolate from a small convenience sample.
5. Execute Chromium E2E in an actual browser environment and preserve CI logs.
6. Publish denominator counts and confidence intervals only when sample design
   supports them; otherwise publish raw counts and stated limitations.

## v1.4 operational review workflow

- Freeze the source snapshot and verify SHA-256 before annotation.
- Declare the **rule coverage** each reviewer examined. No annotation is not a
  blanket declaration that the entire file is defect-free.
- Collect two separate, write-once reviews using different reviewer IDs and the
  same guideline version and rule coverage.
- Compare explicit rule/line/status findings. A third adjudicator must explicitly
  accept or reject each disputed finding, with a recorded rationale.
- Export only adjudicated cases; preserve source hashes, reviewer IDs, and the
  covered rule set. Do not treat a self-reported reviewer ID as proof of independent
  human review. The workflow does not measure inter-rater agreement over all
  negative lines or establish a statistically representative benchmark.

## v1.5 Evidence handling

1. Freeze source snapshots and verify hashes before attaching evidence.
2. Collect browser artifacts only in controlled environments; redact credentials and user information before attaching.
3. Attach each artifact with an immutable evidence ID and an explicit case ID. Optional source line/column and scenario/step are reviewer-supplied associations, not machine-verified mappings.
4. Run `uiux dataset evidence-check DATASET` before distributing an evidence bundle. Any invalid record must be investigated; do not silently omit failures.
5. Keep source findings, human review decisions and browser artifacts as distinct types of evidence. File hashes establish byte integrity only; reviewer identity and browser behavior require independent corroboration.

## v1.6: Browser-report correlation protocol

For every attached browser artifact, record a stable case ID, evidence ID, scenario ID, step number, and exact failed `FLOW-*` rule. Correlate the artifact against the original interaction JSON report, and retain the report privately for future SHA-256 verification. A correlation is valid only when the source snapshot and evidence attachment remain intact and exactly one failed finding matches the declared scenario/step/rule. This process establishes **record consistency**, not independent provenance or browser authenticity. Do not use the number of correlated records as a UX accuracy metric or treat a caller-supplied source position as a verified DOM-to-source mapping.
