---
name: uiux-audit
description: Run an evidence-based static UI audit and interpret limitations.
---
# UI/UX Audit
Run `node src/cli.js audit . --format json --out uiux-audit.json` from the repository root. Report verified static findings separately from heuristic suspicions. Do not claim WCAG compliance, complete UX validation, or runtime coverage. Never silently rewrite source files. Prioritize errors, explain how to reproduce, and identify necessary manual checks.
