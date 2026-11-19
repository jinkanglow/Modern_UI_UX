# Cross-framework browser fixtures (v2.3)

These are **real React and Vue applications** served by Vite, not HTML mocks. Each has separate editor, save and status components. They exercise input validation, async save, synchronous in-flight duplicate prevention, HTTP 503 recovery and network abort recovery. The API is stubbed by Playwright network routing; no production endpoint is contacted.

Run `npm install`, `npx playwright install chromium`, then `UIUX_BROWSER_E2E=1 npm run test:browser`. Tests launch Vite on a loopback ephemeral port, execute the same JSON interaction contract for each framework, and shut down the server in a `finally` block.

`npm test` runs deterministic contract and source fixture checks, but skips actual Chromium E2E unless `UIUX_BROWSER_E2E=1` is set. **Passing static checks is not proof of browser behavior.**

Limitations: these are small controlled fixtures, not external open-source projects; they do not establish production defect detection accuracy, WCAG compliance or true backend persistence. No DOM-to-source map is claimed.
