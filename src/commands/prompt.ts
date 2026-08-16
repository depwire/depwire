const WORKFLOW_PROMPTS: Record<string, string> = {
  generic: `DEPWIRE WORKFLOW — Graph-first workflow for complex multi-file tasks.

## STEP 1 — Orient (before touching anything)

connect_repo <project_root>
get_architecture_summary

→ Understand the module structure. Note which packages
  and directories exist.

## STEP 2 — Get the blast radius FIRST

affected_files <target_file> --depth 5

→ This is the most important step.
→ Save the COMPLETE list of affected files.
→ Do not write a single line of code until you have this.
→ This list tells you every file you must update.

## STEP 3 — Understand each affected file

For each file in the affected list:
get_file_context <file>

→ Understand how it uses the target symbol
→ Note what change is needed

## STEP 4 — Make the core change first

Change only the target file/symbol first.
Then use the compiler as your oracle:
  npx tsc --noEmit    (TypeScript)
  python -m mypy .    (Python)
  go build ./...      (Go)

→ Each error = one file you missed
→ Fix files in order of depth (direct callers first)

## STEP 5 — Verify completeness

verify_change <target_file> <new_content>

→ Confirm the change is safe
→ Zero broken imports = you got everything

## STEP 6 — Run tests

npm test / pytest / go test

→ Tests failing after 0 compiler errors =
  runtime dependency Depwire can't detect
→ Fix those manually

## CRITICAL RULES

1. Run affected_files BEFORE writing any code
   (not after — this is the key insight)
2. Depwire finds static dependencies only.
   Runtime concerns (ORM registries, module caching,
   dynamic imports) are invisible to Depwire.
   Use the compiler/test suite for those.
3. AGENTS.md in .depwire/ contains project-specific
   context. Read it first before any analysis.`,

  claude: `DEPWIRE WORKFLOW (Claude/Cursor) — Graph-first workflow for complex multi-file tasks.

## STEP 1 — Orient (before touching anything)
\`\`\`
connect_repo .
get_architecture_summary
\`\`\`
→ Understand the module structure. Note which packages and directories exist.
→ Read .depwire/AGENTS.md if present — it has project-specific context.

## STEP 2 — Get the blast radius FIRST
\`\`\`
affected_files <target_file> --depth 5
\`\`\`
→ This is the most important step.
→ Save the COMPLETE list of affected files.
→ Do not write a single line of code until you have this.
→ This list tells you every file you must update.

## STEP 3 — Understand each affected file
\`\`\`
get_file_context <file>
\`\`\`
→ For each file in the affected list
→ Understand how it uses the target symbol
→ Note what change is needed

## STEP 4 — Make the core change first
Change only the target file/symbol first.
Then use the compiler as your oracle:
\`\`\`
npx tsc --noEmit    # TypeScript
python -m mypy .    # Python
go build ./...      # Go
\`\`\`
→ Each error = one file you missed
→ Fix files in order of depth (direct callers first)

## STEP 5 — Verify completeness
\`\`\`
verify_change <target_file> <new_content>
\`\`\`
→ Confirm the change is safe
→ Zero broken imports = you got everything

## STEP 6 — Run tests
\`\`\`
npm test / pytest / go test
\`\`\`
→ Tests failing after 0 compiler errors = runtime dependency Depwire can't detect
→ Fix those manually

## CRITICAL RULES
1. Run affected_files BEFORE writing any code (not after — this is the key insight)
2. Depwire finds static dependencies only. Runtime concerns (ORM registries, module caching, dynamic imports) are invisible to Depwire. Use the compiler/test suite for those.
3. AGENTS.md in .depwire/ contains project-specific context. Read it first before any analysis.`,

  cline: `DEPWIRE WORKFLOW (Cline) — Graph-first workflow for complex multi-file tasks.

STEP 1 — ORIENT: connect_repo . then get_architecture_summary
  → Understand the module structure. Note which packages and directories exist.
  → Read .depwire/AGENTS.md if present for project-specific context.

STEP 2 — BLAST RADIUS FIRST: affected_files <target_file> --depth 5
  → This is the most important step.
  → Save the COMPLETE list of affected files.
  → Do not write a single line of code until you have this.
  → This list tells you every file you must update.

STEP 3 — UNDERSTAND: For each file in the affected list:
  - get_file_context <file>
  - Understand how it uses the target symbol
  - Note what change is needed

STEP 4 — CHANGE: Make the core change first (target file/symbol only).
  Then use the compiler as your oracle:
  - npx tsc --noEmit (TypeScript)
  - python -m mypy . (Python)
  - go build ./... (Go)
  → Each error = one file you missed
  → Fix files in order of depth (direct callers first)

STEP 5 — VERIFY: verify_change <target_file> <new_content>
  → Confirm the change is safe
  → Zero broken imports = you got everything

STEP 6 — TEST: npm test / pytest / go test
  → Tests failing after 0 compiler errors = runtime dependency Depwire can't detect
  → Fix those manually

RULES:
- Run affected_files BEFORE writing any code (not after — this is the key insight)
- Depwire finds static dependencies only. Runtime concerns are invisible to Depwire. Use the compiler/test suite.
- AGENTS.md in .depwire/ contains project-specific context. Read it first.`,

  codex: `DEPWIRE WORKFLOW (Codex/CLI) — Graph-first workflow for complex multi-file tasks.

1. connect_repo .
2. get_architecture_summary → understand module structure
3. Read .depwire/AGENTS.md if present → project-specific context
4. affected_files <target_file> --depth 5 → COMPLETE blast radius
   THIS IS THE MOST IMPORTANT STEP. Do not write code until you have this list.
5. For each affected file:
   a. get_file_context <file> → understand usage of target symbol
   b. Note what change is needed
6. Make the core change (target file/symbol only)
7. Compiler as oracle:
   - npx tsc --noEmit (TypeScript)
   - python -m mypy . (Python)
   - go build ./... (Go)
   → Each error = one file you missed
   → Fix in order of depth (direct callers first)
8. verify_change <target_file> <new_content> → zero broken imports = done
9. npm test / pytest / go test → runtime deps Depwire can't detect

CRITICAL RULES:
- Run affected_files BEFORE writing any code (not after — key insight)
- Depwire finds static dependencies only. Runtime concerns invisible. Use compiler/tests.
- AGENTS.md in .depwire/ has project context. Read it first.`,
};

export interface PromptOptions {
  tool?: string;
}

export function promptCommand(options: PromptOptions): void {
  const tool = (options.tool || 'generic').toLowerCase();

  const prompt = WORKFLOW_PROMPTS[tool];
  if (!prompt) {
    const valid = Object.keys(WORKFLOW_PROMPTS).join(', ');
    console.error(`Unknown tool: ${tool}. Valid options: ${valid}`);
    process.exit(1);
  }

  // Output to stdout (machine-readable, pipe-friendly)
  console.log(prompt);
}
