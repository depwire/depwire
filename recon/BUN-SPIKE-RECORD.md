# Bun spike — historical record

> **HISTORICAL.** Recorded 2026-11-04 from PR #48, measured against depwire-cli 1.21.2. Measurements are preserved verbatim from the approved extraction draft and verified against the spike report; they were not rerun. This records the spike-time decision, not current runtime behavior or release readiness. Missing items are noted as "not in source."

## Context

The spike tested whether Depwire CLI could be shipped as a Bun-compiled standalone executable and as a Python-native wheel that installs via `uv` without requiring Node, Bun, or npm on the host. Success criteria were: (1) compile to a single binary for all requested platforms, (2) embed runtime assets so the CLI runs headlessly, (3) install and run through `uv tool install` in a clean, Node-free container, and (4) pass a parity gate against the npm 1.21.2 release such that graph/health outputs match byte-for-byte after removing nondeterministic timestamps.

## Measurements

### Per-platform binary sizes

Final embedded-assets prototype; no minification or size optimization.

| Platform | Bytes | Decimal MB | Execution evidence |
| --- | ---: | ---: | --- |
| macOS arm64 | 91,519,218 | 91.52 | Native: all CLI/parity checks |
| macOS x64 | 98,398,480 | 98.40 | Rosetta: version + sample parse |
| Linux x64 | 110,388,704 | 110.39 | Docker amd64 emulation: version + TS parse |
| Linux arm64 | 110,348,584 | 110.35 | Clean Docker: uv wheel install + parse; all 19 fixtures |
| Windows x64 | 115,161,088 | 115.16 | Built only; no Windows runtime available |

Additional size measurements captured in the source report:

- Python wheel `depwire_cli-1.21.2-py3-none-linux_aarch64.whl`: **39,570,923 bytes**.
- Bundled grammar assets: **25,656,770 bytes (25.66 MB)**.
- web-tree-sitter runtime WASM: **196,721 bytes**.
- Embedded temporal UI assets: temporal.html **4,673 bytes**, temporal.js **16,655 bytes**, temporal.css **6,112 bytes**.

### Install proof — `uv tool install` in a Node-free container

Container image: `python:3.12-slim`. `uv` version installed in image: `0.12.21`.

Exact Dockerfile sequence used:

```dockerfile
RUN ! command -v node && ! command -v bun && ! command -v npm
RUN uv tool install --no-index /wheel/depwire_cli-1.21.2-py3-none-linux_aarch64.whl
ENV PATH="/root/.local/bin:${PATH}" DEPWIRE_NO_TELEMETRY=1
RUN depwire --version
RUN depwire parse /fixture --output /result
```

Resulting install path / entrypoint:

- Tool entrypoint: `depwire` on `PATH`, resolved through `/root/.local/bin`.
- `depwire --version` reported `1.21.2`.
- `depwire parse /fixture --output /result` produced graph format 2 and the named-leaf-symbol assertion (`WHEEL PARSE PASS 1`).
- Follow-up verification in the same clean container ran all 19 language fixtures against npm expected JSON and passed.
- `command -v node/bun/npm/git` were all absent inside the container during the install test.

### Startup / parse timings

Only macOS ARM64 wall times are reported in the source. OS filesystem caches were **not** flushed; these are process-cold timings, not machine-cold disk timings. `DEPWIRE_NO_TELEMETRY=1`. Parse target was `sample-project` (6 files, 31 nodes, 21 edges) with `.depwire` removed before each trial.

| Operation | npm / Node median ms | Standalone median ms |
| --- | ---: | ---: |
| `--version` | 234.60 | 81.77 |
| `parse sample-project` | 310.50 | 141.38 |

Warm-start timings, per-platform timings, and parse-only (no serialization) timings: **not in source**.

## Determinism bug (parity-gate finding)

The parity gate failed on health raw metrics for two real-world corpora even though graph node/edge sets were identical and overall health scores stayed the same.

**Inputs that triggered it:**

- Nest at commit `4c751c50`.
- Drizzle at commit `b7862528`.
- Both parsed with the same source files as npm 1.21.2, comparing JSON after removing only `parsedAt` and health timestamp fields.

**Expected vs. actual raw output:**

| Corpus | Dimension | npm raw metrics (expected) | Binary raw metrics (actual) |
| --- | --- | --- | --- |
| Nest | Circular Dependencies | `{"cycles":59,"cyclesPer100":3.4}` | `{"cycles":86,"cyclesPer100":4.9}` |
| Drizzle | Circular Dependencies | `{"cycles":622,"cyclesPer100":70.3}` | `{"cycles":665,"cyclesPer100":75.1}` |

All other dimensions for Nest and Drizzle were identical.

**Historical failure mode:** at baseline `28ec599c841964d39d0bc67f0d534da50eddbf83`, `src/utils/files.ts` uses unsorted `readdirSync` results. For the exact same sample directory:

```
Node: [ '.depwire', 'index.ts', 'services', 'types.ts', 'utils' ]
Bun:  [ '.depwire', 'utils', 'types.ts', 'index.ts', 'services' ]
```

Historical reference: `src/health/metrics.ts:225@28ec599c841964d39d0bc67f0d534da50eddbf83` says `// Find cycles using DFS`; lines 226–260 use a visited-set DFS over insertion-ordered file maps, so the discovered cycle count depends on traversal order. To confirm ordering (not runtime math) was the cause, each emitted JSON graph was deserialized and `calculateCircularDepsScore` was called under both Node and Bun: both runtimes gave the same cycle count for a fixed ordering, but counts differed across orderings.

## Historical decision implied by the measurements

The distribution mechanism is feasible: all five requested platforms built, runtime assets embedded successfully, and `uv tool install` in a Node-free container installed and ran the CLI. However, the spike does **not** support shipping an identical standalone release today. Q4 failed on health raw metrics because graph traversal order is nondeterministic between runtimes, and several ordered/tie-selected outputs (temporal, docs, dead-code symbol order) also differ. The required next work is explicitly scoped: deterministic discovery/graph traversal, deterministic output tie handling, complete runtime asset enumeration, accepted cache-disabled behavior or separately tested cache integration, and platform execution/ABI/signing tests.

## Source

[PR #48](https://github.com/depwire/depwire/pull/48), [spike report](https://github.com/depwire/depwire/blob/931dd9e7dfae11e2f450440af444b7d7b0dad4dc/recon/BUN-STANDALONE-SPIKE.md) at commit `931dd9e7dfae11e2f450440af444b7d7b0dad4dc`. The report header references issue #42; that issue is distinct from PR #48. Source baseline/tag and verified PR base: `main/v1.21.2` at `28ec599c841964d39d0bc67f0d534da50eddbf83`. Branch: `spike/bun-standalone`.

The historical DFS citation was verified with `git show 28ec599c841964d39d0bc67f0d534da50eddbf83:src/health/metrics.ts` (lines 210–260). It does not describe the current cyclic-groups implementation.
