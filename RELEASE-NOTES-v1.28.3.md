# v1.28.3 — Symlink bypass security patch

Draft; not published. Atef publishes to npm first, then the MCP registry.

Fixed a symlink bypass in `connect_repo` protected-directory validation. The path comes from the MCP client, so a prompt-injected or confused agent could supply a symlink in a permitted directory pointing into a protected target. The guard now checks canonical paths, including nested symlinks, with path-separator boundaries. Missing paths return clean errors. The macOS managed temporary-directory allowance is preserved.

Permanent regression coverage includes direct protected paths, protected and permitted symlink targets, macOS `/var/folders` temp paths, missing paths, relative traversal, nested symlinks, prefix-only names, and subdirectory validation. The exploit was reproduced before the fix using only a synthetic fake HOME and synthetic `.ssh` content.

Credit: Yusif Mammadzada, reported privately, symlink bypass of protected-directory validation, November 2026. No GitHub collaborator status or repository access was granted.

Resolution behavior for valid connections is unchanged: canonical paths are used only for validation; returned project roots and graph resolution remain unchanged. `RESOLUTION_VERSION` remains 13.

Issue #69, Issue #52, P1–P5 writer work, PR #48 (Bun spike), PR #58, and the website are not done in this release and are deferred to v1.29.0.

Validation: `npm test` passed all 422 tests in 54 files, including 10 new guard tests (412 existing tests in this checkout; 7 more total than the reporter's observed 415). The targeted connect tests passed 19/19. `npx vitest run test/edge-contract.test.ts test/import-site-ledger.test.ts` passed 11/11, including the reconciliation invariant and import-site ledger. No existing test failed. The pre-fix symlink regression test failed as expected because the synthetic protected source was parsed.

Additional check: `npx tsc --noEmit` exits 2 with 386 existing diagnostics; replacing only the patched guard with the HEAD version produces byte-identical diagnostics. No unrelated type errors were changed. The protected list and its validation calls exist only in the connect module; no duplicate lexical protected-list guard was found elsewhere in source.
