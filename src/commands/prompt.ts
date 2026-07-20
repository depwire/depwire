const WORKFLOW_PROMPTS: Record<string, string> = {
  generic: `DEPWIRE WORKFLOW — You have access to Depwire MCP tools.
Follow this decision tree exactly:

## BEFORE touching any file

Run these in order:
1. connect_repo <project_root> — initialize the graph
2. get_architecture_summary — understand module structure
3. get_health_score — baseline health score

For EACH file you plan to modify:
4. get_file_context <file> — understand its symbols, imports, and who depends on it
5. get_dependents <symbol> — what depends on each symbol you plan to change?
6. impact_analysis <file> — full blast radius before making changes

## BEFORE writing any code

7. search_symbols <name> — find the exact symbol definition you need to modify
8. simulate_change — preview what happens if you move/delete/rename a file
9. get_dependencies <symbol> — understand what the symbol depends on

## AFTER making changes

10. verify_change — verify your changes don't break imports or degrade health
11. security_scan — check for newly introduced vulnerabilities
12. get_health_score — confirm health score didn't regress
13. affected_files <changed_file> — find all test files that need to run

## MULTI-AGENT COORDINATION

When multiple agents work on the same repo:
14. claim_files [files] — lock files you're editing to prevent conflicts
15. get_active_claims — see what other agents are working on
16. release_files [files] — release your locks when done
17. record_decision <decision> — document architectural decisions for other agents
18. get_decisions — review decisions made by other agents

## KEY RULES

- ALWAYS run impact_analysis before deleting or moving files
- ALWAYS run verify_change after modifying imports or exports
- NEVER skip get_file_context — it reveals hidden dependencies
- If health score drops by more than 3 points, reconsider the change
- Use affected_files to run only the tests that matter
- Claim files before editing in multi-agent setups`,

  claude: `DEPWIRE WORKFLOW (Claude/Cursor)
You have Depwire MCP tools. Use them before and after every code change.

## Start of session
\`\`\`
connect_repo .
get_architecture_summary
get_health_score
\`\`\`

## Before editing a file
\`\`\`
get_file_context <file>          # symbols, imports, dependents
impact_analysis <file>           # blast radius
search_symbols <name>            # find exact definitions
\`\`\`

## After editing
\`\`\`
verify_change --file <file>      # import safety check
security_scan                    # no new vulnerabilities
get_health_score                 # no regression
affected_files <file>            # which tests to run
\`\`\`

## Before moving/deleting files
\`\`\`
simulate_change --type delete --target <file>    # preview impact
simulate_change --type move --target <file> --destination <new_path>
\`\`\`

## Multi-agent
\`\`\`
claim_files [files]              # lock before editing
release_files [files]            # unlock when done
record_decision <text>           # share decisions
\`\`\`

KEY: Always check impact_analysis before destructive changes. Never skip verify_change after modifying exports.`,

  cline: `DEPWIRE WORKFLOW (Cline)
You have Depwire MCP tools available. Follow this workflow for every task.

STEP 1 — CONNECT: connect_repo .
STEP 2 — ORIENT: get_architecture_summary, get_health_score
STEP 3 — INVESTIGATE: For each file you'll touch:
  - get_file_context <file>
  - impact_analysis <file>
  - get_dependents <symbol> (for each symbol you'll change)
STEP 4 — PLAN: If moving/deleting files, run simulate_change first
STEP 5 — EXECUTE: Make your code changes
STEP 6 — VERIFY:
  - verify_change --file <file>
  - security_scan
  - get_health_score (compare to Step 2 baseline)
  - affected_files <file> (run those tests)
STEP 7 — COORDINATE (multi-agent):
  - claim_files before editing, release_files when done
  - record_decision for architectural choices

RULES:
- Never skip Step 3 — hidden dependencies cause cascading breakage
- If health drops >3 points, stop and reconsider
- Always run verify_change after modifying imports/exports`,

  codex: `DEPWIRE WORKFLOW (Codex/CLI)
Depwire MCP tools are available. Use this linear workflow:

1. connect_repo .
2. get_architecture_summary
3. get_health_score → save as BASELINE
4. For each target file:
   a. get_file_context <file>
   b. impact_analysis <file>
   c. search_symbols <name> → find definitions
5. simulate_change before move/delete/rename
6. Make code changes
7. verify_change --file <changed_file>
8. security_scan
9. get_health_score → compare to BASELINE
10. affected_files <changed_file> → run those tests

Multi-agent: claim_files → edit → release_files
Decisions: record_decision / get_decisions

EXIT CONDITIONS:
- Health regression >3 points → revert and rethink
- verify_change fails → fix broken imports before continuing
- security_scan HIGH findings → address before merging`,
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
