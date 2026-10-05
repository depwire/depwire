# PR #64 re-export module-load target audit

Seed: `pr64-reexport-2026-10-04-v1`. The 130 positive sites and their source statement, target module path, value declaration where applicable, form, chain checks and verdict are in `REEXPORT-TARGET-SAMPLE.jsonl`. Redraw with `recon/reexport-sample.mjs` after building the branch. The sample is selected only from the independent census's relationships absent on split PR #63 and present as runtime file edges on this branch. SHA-256 of the final ledger and a second byte-identical redraw are recorded below.

| Pinned root | SHA | Draw | Star | Named | Mixed | Namespace | Default |
|---|---|---:|---:|---:|---:|---:|---:|
| Nest | `35142c3eca8edaaf6abc5984d915da2fbd458aa2` | 40 | 23 | 16 | 1 | 0 | 0 |
| Zod | `004d800c9e3cd4c79930f55aa4ad080225b22efd` | 40 | 15 | 12 | 2 | 7 | 4 |
| Drizzle | `48e5406027103a9fca6eb66417187c4a8b5c6aa3` | 20 | 12 | 5 | 0 | 0 | 3 |
| TanStack Query | `a83ce667daa4c234724e227b95d97beac25be3ae` | 20 | 10 | 7 | 3 | 0 | 0 |
| code-graph | `a166f14581e44dea71fa9387fa7986ec2365d3bb` | 10 | 3 | 4 | 2 | 1 | 0 |
| **Total** | | **130** | **63** | **44** | **8** | **8** | **7** |

The drawn unit is a **module file relationship**, not a symbol call. Its built target is a `::__file__` node at line 1; it has no symbol declaration. For 59 named, mixed and default sites the ledger additionally records a runtime value's declaration `file:line`. An independent TypeScript AST walk reads the target source and traces named and wildcard re-export chains to that declaration. The 71 star/namespace sites load their target regardless of its exports, as the `tsc` oracle proves. Every sampled source statement matches bytes at its recorded line and every target file exists. Relative specifiers are independently normalized to the target; seven non-relative sites are checked against their pinned `tsconfig` path mapping, package self-reference or workspace package name. The script throws on any mismatch.

The draw deliberately contains 30 targets with further re-export syntax and 20 targets named `index.*`. For the selected target modules, the script checked 385 runtime onward hops for built edges and 34 type-only or emit-dependent onward hops for absence of a site-level runtime edge. These counts include repeated inspection of a target module drawn by more than one site. The check follows each hop's actual `reExportSites` classification, so a type-only hop is not fabricated into a runtime relationship.

| Verdict | Positive relationships |
|---|---:|
| CORRECT | 130 |
| WRONG | 0 |
| AMBIGUOUS | 0 |

The corpus contains only eight mixed statements and one inline-only type statement; **all eight mixed** appear in the positive draw. The supplemental negative ledger `REEXPORT-NEGATIVE-SAMPLE.jsonl` contains 20 seeded `export type` sites (five each from Nest, Zod, TanStack Query and code-graph) and the **sole** inline-only site, `src/dead-code/index.ts:76` in code-graph. All 20 explicit type-only sites are classified `type-only` with no runtime edge at their source line. The inline-only site is classified `emit-dependent` with no runtime edge at its line. Construct fixtures cover additional inline-only, implicit type-only named/default, private target, mixed, wildcard-to-value, wildcard-to-type and local-export-chain forms absent or rare in the corpus. The compiler-oracle fixtures confirm default ESNext, CommonJS and verbatim behavior.

**Gate verdict:** 130 correct, zero wrong, zero ambiguous; 21 supplemental non-runtime outcomes correctly separated. This verifies the sampled population and the listed constructs at the pinned commits. It does not claim every possible TypeScript build emit is known. The parser records emit-dependent sites separately precisely because a unique build emit has not been proved.

Redraw command (substitute equivalent checkouts at the pinned SHAs):

```sh
node recon/reexport-sample.mjs '{"nest":"/Users/atefataya/Developer/nest","zod":"/Users/atefataya/Developer/zod","drizzle":"/Users/atefataya/Developer/drizzle-orm","tanstack-query":"/tmp/depwire-tanstack-audit","code-graph":"/tmp/depwire-codegraph-baseline"}' > /tmp/reexport-sample.jsonl
node recon/reexport-sample.mjs '{"nest":"/Users/atefataya/Developer/nest","zod":"/Users/atefataya/Developer/zod","drizzle":"/Users/atefataya/Developer/drizzle-orm","tanstack-query":"/tmp/depwire-tanstack-audit","code-graph":"/tmp/depwire-codegraph-baseline"}' --negative > /tmp/reexport-negative.jsonl
```

Positive SHA-256: `8587b69ed25783341a150326d2f11cc19e572ea59e1858c34c83a7f04a83d0e5`. Negative SHA-256: `ac2f8ba70a56eef4fe01703f04b43b2518d9b2a9d6c964228179a8903abb224e`. A second positive redraw is byte-identical.
