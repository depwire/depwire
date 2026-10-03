# Prospective coupling refit holdouts

Registered **before cloning, parsing, counting file pairs or calculating any coupling metric** for these three repositories. This document names the holdouts and freezes their source SHAs. The SHAs came from read-only `git ls-remote ... HEAD` queries on 2026-10-04. A later commit must state numerical predictions under a frozen candidate curve **before** any holdout parse. Predictions and measurements must remain separate commits. No holdout result may be used to choose coefficients or grade boundaries.

| Holdout | Pinned SHA | Why selected |
|---|---|---|
| [Fastify](https://github.com/fastify/fastify) | `19d5be0daf1c0daace758efe3ea788f924ca1224` | JavaScript server framework with plugin-oriented source, unlike Express's small core. |
| [Werkzeug](https://github.com/pallets/werkzeug) | `594452f6a4fe4de38a544962fbf04bfc9d37fbc2` | Python library with a different role and scale from Flask and FastAPI. |
| [TanStack Query](https://github.com/TanStack/query) | `a83ce667daa4c234724e227b95d97beac25be3ae` | Large TypeScript monorepo with packages and application examples. |

The prior blind repositories Click, ripgrep and Pinia are **not** holdouts again. The repository documentation was searched for these three new names; no Depwire calibration measurement of them was found. This is a scoped claim about recorded work, not proof that nobody has ever parsed them elsewhere.

Protocol: freeze the production classifier, parser revision, edge projection, denominator, anchors and candidate curve using only the eight calibration repositories. Record point predictions for production file count, distinct ordered pairs, mean outward relationships, p95 outward relationships and score for each holdout in the next commit. Then parse these exact SHAs with cache disabled, inspect their scope classification, measure once and report misses without adjusting the curve. If a language's relationship coverage fails the independent syntax census, label its result coverage-limited; do not discard a surprising score or replace a holdout after seeing it.
