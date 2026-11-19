# Third-party notices

This repository is licensed under MIT for its original code. It does not copy text, figures, or source files from the referenced books or repositories.

- TypeScript compiler API (`typescript`) is an npm dependency licensed under Apache-2.0. Its source code is not bundled in this repository ZIP. See the dependency's own license upon installation.
- Playwright and axe-core are optional, separately installed runtime-audit dependencies, with their respective licenses.

The MIT license for this repository does not alter the licenses of installed dependencies.

The v0.6 behavior analyzer uses the existing TypeScript compiler dependency for AST traversal. No TypeScript compiler source is vendored in this repository.

Interaction browser verification uses Playwright as an optional, separately installed dependency; Playwright is licensed under Apache-2.0. No Playwright code or browser binaries are bundled in this repository ZIP.

Playwright (optional browser test/runtime dependency) is distributed under the Apache License 2.0 license by Microsoft and contributors. Browser binaries may have additional notices. It is not bundled in this repository ZIP.
