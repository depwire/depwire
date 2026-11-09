import { analyzeCyclicGroups, compareCyclicGroups, DIMENSIONS_VERSION, type CyclicGroupChanges } from '../graph/cyclic-groups.js';
import { canonicalPath, isWithinRoot } from '../graph/paths.js';
import { DirectedGraph } from 'graphology';
import { SimulationEngine } from '../simulation/engine.js';
import { calculateHealthScore } from '../health/index.js';
import { scanSecurity } from '../security/scanner.js';
import { getImpact, getDependents } from '../graph/queries.js';
import { getParserForFile } from '../parser/detect.js';
import { parseVerifyProject } from './verify-change-project.js';
import type { ParsedFile } from '../parser/types.js';
import type { ParseProjectResult } from '../parser/index.js';
import { initParser } from '../parser/wasm-init.js';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface VerifyChangeInput {
  file_path?: string;
  new_content?: string;
  unified_diff?: string;
  depwire_action_token?: string;
  /** Glob patterns (MCP surface): files matched are skipped like `depwire parse --exclude`. */
  exclude?: string[];
}
export interface SkippedFileRecord { file: string; reason: string }
export interface BrokenImportEntry { file: string; missing_symbol: string; reason?: string }
export interface SecurityFinding { severity: string; description: string; file: string; line: number }
export type InformationStatus = 'computed' | 'unavailable' | 'not_applicable' | 'error';
export interface InformationalContext {
  health_score_before: number | null;
  health_score_after: number | null;
  health_score_delta: number | null;
  health_status: InformationStatus;
  health_reason: string | null;
  security_findings: SecurityFinding[] | null;
  security_status: InformationStatus;
  security_reason: string | null;
  partial: boolean;
}
export interface UnrelatedContext extends InformationalContext { note: string }
export interface VerifyChangeOutput extends InformationalContext {
  safe: boolean;
  risk_level: 'low' | 'medium' | 'high' | 'error';
  error_reason: string | null;
  broken_imports: BrokenImportEntry[];
  dimensions_v: string;
  cyclicGroupChanges: CyclicGroupChanges | { status: 'not_comparable'; reason: string };
  coverage_gaps: Array<{ file: string; reason: string }> | null;
  skipped_files: SkippedFileRecord[] | null;
  syntax_errors_outside_affected_set: number | null;
  syntax_check: 'checked' | 'not_applicable' | null;
  affected_files: string[];
  blast_radius: number;
  warnings: string[];
  relevant_warnings: string[];
  unrelated_context: UnrelatedContext;
}
export interface VerifyChangeContext {
  graph: DirectedGraph;
  projectRoot: string;
  sourceCoverage?: 'complete' | 'partial' | 'unknown';
  unparsedFiles?: string[];
  parsedFiles?: ParsedFile[];
  /** Loader skip records (Addendum 7); defaults to metadata attached to parsedFiles. */
  skippedFiles?: SkippedFileRecord[];
}
const NOTE = 'Health score and security findings are informational and do NOT affect the safety verdict.';
const AFTER_UNAVAILABLE = 'A fully resolved after-graph is unavailable for edited content or unified diffs. Export comparison does not establish cyclic-group safety.';

export function failureReason(stage: string, error: unknown): string {
  let cause: string;
  try {
    cause = error instanceof Error
      ? `${error.message}${error.cause === undefined ? '' : `; ${failureReason('cause', error.cause)}`}`
      : String(error);
  } catch { cause = 'Unknown thrown value'; }
  return `${stage}: ${cause || 'Unknown failure'}`;
}
function information(reason: string): InformationalContext {
  return { health_score_before: null, health_score_after: null, health_score_delta: null,
    health_status: 'not_applicable', health_reason: reason, security_findings: null,
    security_status: 'not_applicable', security_reason: reason, partial: false };
}
function finish(result: VerifyChangeOutput): VerifyChangeOutput {
  result.partial = result.health_status === 'error' || result.security_status === 'error';
  const { health_score_before, health_score_after, health_score_delta, health_status, health_reason,
    security_findings, security_status, security_reason, partial } = result;
  result.unrelated_context = { note: NOTE, health_score_before, health_score_after, health_score_delta,
    health_status, health_reason, security_findings, security_status, security_reason, partial };
  result.relevant_warnings = [...result.warnings];
  return result;
}
export function verifyChangeError(stage: string, error: unknown): VerifyChangeOutput {
  const reason = failureReason(stage, error);
  const info = information(reason);
  return finish({ ...info, safe: false, risk_level: 'error', error_reason: reason,
    coverage_gaps: null, skipped_files: null, syntax_errors_outside_affected_set: null, syntax_check: null,
    broken_imports: [], dimensions_v: DIMENSIONS_VERSION,
    cyclicGroupChanges: { status: 'not_comparable', reason }, affected_files: [], blast_radius: 0,
    warnings: [`Security scan not applicable: ${reason}`], relevant_warnings: [],
    unrelated_context: { note: NOTE, ...info } });
}

/** Validate supported unified patches including hunk counts; never infer a patch from headers alone. */
export function parseVerifyDiff(diff: string): string[] {
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  let i = 0;
  const paths: string[] = [];
  const fail = () => { throw new Error(`Malformed or unsupported unified diff near line ${i + 1}`); };
  const path = (line: string, prefix: string) => {
    const raw = line.slice(4).split('\t')[0];
    if (raw === '/dev/null') return null;
    if (!raw.startsWith(prefix) || !raw.slice(2).trim() || /["\x00]/.test(raw)) return fail();
    return canonicalPath(raw.slice(2));
  };
  while (i < lines.length) {
    if (lines[i].startsWith('diff --git ')) {
      i++;
      while (i < lines.length && /^(index [0-9a-f]+\.\.[0-9a-f]+(?: \d+)?|(?:new file|deleted file) mode \d+)$/.test(lines[i])) i++;
    }
    if (!lines[i]?.startsWith('--- ') || !lines[i + 1]?.startsWith('+++ ')) fail();
    const before = path(lines[i++], 'a/');
    const after = path(lines[i++], 'b/');
    if ((!before && !after) || (before && after && before !== after)) fail();
    paths.push((after ?? before)!);
    let hunks = 0;
    while (i < lines.length && lines[i].startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(lines[i++]);
      if (!m) fail();
      let oldCount = Number(m![2] ?? 1), newCount = Number(m![4] ?? 1);
      const oldStart = Number(m![1]), newStart = Number(m![3]);
      if (![oldStart, newStart, oldCount, newCount].every(Number.isSafeInteger) ||
          (oldCount > 0 && oldStart === 0) || (newCount > 0 && newStart === 0) ||
          (oldCount === 0 && newCount === 0)) fail();
      if ((!before && oldCount !== 0) || (!after && newCount !== 0)) fail();
      hunks++;
      while (i < lines.length && (oldCount > 0 || newCount > 0)) {
        const line = lines[i++];
        if (line === '\\ No newline at end of file') continue;
        if (line.startsWith(' ')) { oldCount--; newCount--; }
        else if (line.startsWith('-')) oldCount--;
        else if (line.startsWith('+')) newCount--;
        else fail();
        if (oldCount < 0 || newCount < 0) fail();
      }
      if (oldCount || newCount) fail();
      if (lines[i] === '\\ No newline at end of file') i++;
    }
    if (!hunks) fail();
  }
  if (!paths.length) fail();
  return [...new Set(paths)];
}
function validateInput(args: VerifyChangeInput, root: string): { paths: string[]; content?: string } {
  if (!args || typeof args !== 'object') throw new Error('Provide one typed change input');
  const hasFile = args.file_path !== undefined || args.new_content !== undefined;
  const hasDiff = args.unified_diff !== undefined;
  if (hasFile === hasDiff) throw new Error('Provide exactly one of file_path + new_content or unified_diff');
  let paths: string[];
  if (hasFile) {
    if (typeof args.file_path !== 'string' || !args.file_path.trim() || typeof args.new_content !== 'string')
      throw new Error('file_path must be nonempty and new_content must be a string');
    paths = [canonicalPath(args.file_path, root)];
  } else {
    if (typeof args.unified_diff !== 'string' || !args.unified_diff.trim()) throw new Error('unified_diff must be a nonempty string');
    paths = parseVerifyDiff(args.unified_diff);
  }
  if (paths.some(p => !p || p.includes('\0') || !isWithinRoot(resolve(root, p), resolve(root)))) throw new Error('Change path must be inside the project');
  return { paths, content: hasFile ? args.new_content : undefined };
}
const nodesInFile = (g: DirectedGraph, path: string, root: string) => g.filterNodes((_id, a) => canonicalPath(a.filePath, root) === path);
function assertTopology(result: ReturnType<typeof analyzeCyclicGroups>): void {
  if (result.status === 'unavailable') throw new Error(result.reason);
}
/** Structural verdict only: recon/VERIFY-CHANGE-VERDICT-CONTRACT.md §§1–3.
 * Addendum 5: affected syntax gaps impose a medium floor; outside errors never gate.
 * Required analysis failures dominate; informational crashes never enter this function. */
export function structuralVerdict(broken: BrokenImportEntry[], changes: VerifyChangeOutput['cyclicGroupChanges']): 'low' | 'medium' | 'high' {
  if ('before' in changes) { assertTopology(changes.before); assertTopology(changes.after); }
  if (broken.length || (changes.status === 'compared' && (changes.newlyCyclicFiles.length || changes.addedCyclicFiles.length || changes.groupsMerged.length))) return 'high';
  return changes.status === 'compared' ? 'low' : 'medium';
}

export async function verifyChange(args: VerifyChangeInput, ctx: VerifyChangeContext): Promise<VerifyChangeOutput> {
  let stage = 'input';
  let result = verifyChangeError(stage, 'No admissible change');
  let afterGraph: DirectedGraph | undefined;
  let paths: string[] = [];
  let deletion = false;
  let valid = false;
  try {
    const { graph, projectRoot } = ctx;
    const input = validateInput(args, projectRoot);
    paths = input.paths;
    valid = true;
    result = { ...result, ...information('Structural analysis has not completed'), warnings: [] };
    result.health_status = 'unavailable'; result.security_status = 'unavailable';
    if (ctx.unparsedFiles?.length) result.warnings.push(`Syntax census incomplete; skipped files: ${ctx.unparsedFiles.join(', ')}`);
    stage = 'baseline topology';
    assertTopology(analyzeCyclicGroups(graph));
    const drops = [...(graph.getAttribute('edgeDrops') ?? []), ...(graph.getAttribute('crossLanguageDrops') ?? [])];
    const coverage = ctx.sourceCoverage === 'partial' || graph.getAttribute('sourceCoverage') === 'partial' || drops.some(d => String(d.reason).startsWith('missing-')) ? 'partial' : ctx.sourceCoverage;
    result.cyclicGroupChanges = { status: 'not_comparable', reason: AFTER_UNAVAILABLE };
    const engine = new SimulationEngine(graph);
    const affected = new Set<string>(paths);
    for (const file of paths) {
      stage = `changed-file coverage (${file})`;
      if (ctx.unparsedFiles?.includes(file)) throw new Error('Required changed file was not parsed');
      const nodes = nodesInFile(graph, file, projectRoot);
      // Parse even unmatched proposed content: a missing parser must not disappear as a new-path limitation.
      if (input.content !== undefined) {
        stage = `parser (${file})`;
        await initParser();
        const parser = getParserForFile(file, input.content);
        if (!parser) throw new Error('No required parser available');
        const parsed = parser.parseFile(file, input.content, projectRoot);
        result.syntax_check = parsed.syntaxCheck ?? null;
        if (parsed.syntaxErrors?.length) {
          const { file, line, text } = parsed.syntaxErrors[0];
          throw new Error(`Syntax error at ${file}:${line}: ${text}`);
        }
        const errors = (parsed as typeof parsed & { errors?: unknown[]; errorFiles?: unknown[] }).errors ?? (parsed as typeof parsed & { errorFiles?: unknown[] }).errorFiles;
        if (errors?.length) throw new Error(`Parser reported errors: ${JSON.stringify(errors)}`);
        stage = `removed exports (${file})`;
        const exports = new Set(parsed.symbols.filter(s => s.exported).map(s => s.name));
        for (const node of input.content === '' ? [] : nodes) {
          const attrs = graph.getNodeAttributes(node);
          if (!attrs.exported || exports.has(attrs.name)) continue;
          for (const dep of getDependents(graph, node)) {
            if (canonicalPath(dep.filePath, projectRoot) !== file) result.broken_imports.push({ file: canonicalPath(dep.filePath, projectRoot), missing_symbol: attrs.name, reason: `${attrs.name} was removed from ${file} but is still imported here` });
          }
        }
      }
      if (!nodes.length) result.warnings.push(`File ${file} is new (not in current graph)`);
      else if (input.content === '' || input.content === undefined) {
        stage = `simulation (${file})`;
        const sim = engine.simulate({ type: 'delete', target: file }, { structuralOnly: true });
        // Reading the entire structural result belongs to the failure boundary too.
        assertTopology(sim.diff.cyclicGroupChanges.before); assertTopology(sim.diff.cyclicGroupChanges.after);
        for (const bi of sim.diff.brokenImports) result.broken_imports.push({ file: canonicalPath(bi.file, projectRoot), missing_symbol: bi.importedSymbol, reason: bi.reason });
        for (const node of sim.diff.affectedNodes) if (graph.hasNode(node)) affected.add(canonicalPath(graph.getNodeAttribute(node, 'filePath'), projectRoot));
        if (input.content === '') {
          deletion = true;
          afterGraph = sim.simulatedGraphInstance;
          // The engine also supports suffix targets; this API accepts an exact
          // canonical file path and must not certify deletion of sibling paths.
          const removed = graph.nodes().filter(node => !afterGraph!.hasNode(node));
          if (removed.length !== nodes.length || removed.some(node => !nodes.includes(node))) {
            throw new Error('Simulation did not represent the exact proposed file deletion');
          }
          result.cyclicGroupChanges = compareCyclicGroups(graph, afterGraph, { sourceCoverage: coverage });
        } else result.warnings.push(`Conservative full-file import analysis for ${file}; unified diff has no faithful after-graph.`);
      }
      stage = `impact (${file})`;
      for (const node of nodes) for (const impacted of getImpact(graph, node).affectedFiles) affected.add(canonicalPath(impacted, projectRoot));
    }
    stage = 'structural verdict';
    result.broken_imports = [...new Map(result.broken_imports.map(b => [JSON.stringify([b.file, b.missing_symbol]), b])).values()];
    result.affected_files = [...affected].sort(); result.blast_radius = result.affected_files.length;
    stage = 'project syntax census';
    const census = ctx.parsedFiles
      ? { parsed: ctx.parsedFiles, unparsedFiles: ctx.unparsedFiles ?? [],
          skippedFiles: ctx.skippedFiles ?? (ctx.parsedFiles as ParseProjectResult).skippedFiles ?? [] }
      : await parseVerifyProject(projectRoot);
    const records = new Map(census.parsed.map(file => [canonicalPath(file.filePath, projectRoot), file]));
    const skipRecords = new Map(census.skippedFiles.map(skip => [canonicalPath(skip.file, projectRoot), skip]));
    // Addendum 7/D2 nulling rule: oversized, path-containment and no-parser skips on a
    // SUPPORTED extension make the affected-set coverage check incomplete anywhere in
    // the project. Configured exclusions and no-parser skips on unsupported extensions
    // are listed in skipped_files only and do NOT null coverage_gaps. (A no-parser skip
    // on a supported extension cannot arise today: grammar-init failure short-circuits
    // before the parse loop and getParserForFile is static extension matching.)
    const nullingSkip = (skip: SkippedFileRecord) =>
      !skip.reason.startsWith('Excluded by')
      && !(skip.reason.startsWith('No parser') && !getParserForFile(skip.file));
    const censusIncomplete = census.skippedFiles.some(nullingSkip);
    const skipped = [...new Set([...census.unparsedFiles, ...(ctx.unparsedFiles ?? []),
      ...skipRecords.keys(),
      ...census.parsed.filter(file => file.syntaxCheck === undefined).map(file => canonicalPath(file.filePath, projectRoot))])].sort();
    if (skipped.length && !result.warnings.some(w => w.startsWith('Syntax census incomplete;'))) result.warnings.push(`Syntax census incomplete; skipped files: ${skipped.join(', ')}`);
    result.skipped_files = [...skipRecords.values()].sort((a, b) => a.file.localeCompare(b.file));
    // Proposed changed content was checked above; baseline records cover the rest.
    // Affected files skipped for a non-nulling reason (exclusion/unsupported) stay
    // covered; parsed-but-unchecked and unaccounted files keep the check incomplete.
    const uncheckedAffected = result.affected_files.filter(file => {
      if (paths.includes(file)) return false;
      const record = records.get(file);
      if (record) return record.syntaxCheck === undefined;
      const skip = skipRecords.get(file);
      return !skip || nullingSkip(skip);
    });
    const changedChecked = result.syntax_check !== null;
    if (changedChecked && !uncheckedAffected.length && !censusIncomplete) {
      result.coverage_gaps = result.affected_files.filter(file => !paths.includes(file)).flatMap(file => {
        const first = records.get(file)?.syntaxErrors?.[0];
        return first ? [{ file, reason: `Syntax error at ${file}:${first.line}: ${first.text}` }] : [];
      });
    }
    if (!skipped.length) result.syntax_errors_outside_affected_set = census.parsed.filter(file =>
      !affected.has(canonicalPath(file.filePath, projectRoot)) && file.syntaxErrors?.length).length;
    stage = 'structural verdict';
    result.risk_level = structuralVerdict(result.broken_imports, result.cyclicGroupChanges);
    if (result.risk_level === 'low' && (result.coverage_gaps?.length || skipped.length || uncheckedAffected.length)) result.risk_level = 'medium';
    result.safe = result.risk_level === 'low'; result.error_reason = null;
    if (result.cyclicGroupChanges.status === 'not_comparable') result.warnings.push(result.cyclicGroupChanges.reason);
  } catch (error) {
    if (!valid) return verifyChangeError(stage, error);
    result.safe = false; result.risk_level = 'error'; result.error_reason = failureReason(stage, error);
    result.cyclicGroupChanges = { status: 'not_comparable', reason: result.error_reason };
    afterGraph = undefined;
  }

  // recon/VERIFY-CHANGE-VERDICT-CONTRACT.md §§1,4: isolated informational
  // operations, one workspace scorer call per state, no history on any path.
  let workspace: string | undefined;
  try {
    const before = calculateHealthScore(ctx.graph, ctx.projectRoot, { persistHistory: false }).overall;
    result.health_score_before = typeof before === 'number' && Number.isFinite(before) ? before : null;
    result.health_reason = 'No faithful scored after-state is available';
    if (afterGraph && deletion) {
      // Preserve real workspace context, removing only the proposed file in a
      // disposable copy; source files and health history in the original stay untouched.
      workspace = mkdtempSync(join(tmpdir(), 'depwire-verify-health-'));
      cpSync(ctx.projectRoot, workspace, { recursive: true, filter: source => {
        const rel = relative(ctx.projectRoot, source).replaceAll('\\', '/');
        return !rel.split('/').some(p => ['.git', '.depwire', 'node_modules'].includes(p)) && !paths.includes(rel);
      } });
      const after = calculateHealthScore(afterGraph, workspace, { persistHistory: false }).overall;
      result.health_score_after = typeof after === 'number' && Number.isFinite(after) ? after : null;
      if (result.health_score_before !== null && result.health_score_after !== null && Number.isFinite(result.health_score_after - result.health_score_before)) {
        result.health_score_delta = result.health_score_after - result.health_score_before;
        result.health_status = 'computed'; result.health_reason = null;
      } else result.health_reason = 'Before or after graph has no finite health score';
    }
  } catch (error) {
    result.health_score_before = result.health_score_after = result.health_score_delta = null;
    result.health_status = 'error'; result.health_reason = failureReason('health scorer', error);
  } finally {
    if (workspace) {
      try { rmSync(workspace, { recursive: true, force: true }); }
      catch (error) {
        result.health_score_before = result.health_score_after = result.health_score_delta = null;
        result.health_status = 'error'; result.health_reason = failureReason('health workspace cleanup', error);
      }
    }
  }

  try {
    const findings: SecurityFinding[] = [];
    for (const file of paths) {
      if (!existsSync(resolve(ctx.projectRoot, file)) || !getParserForFile(file)) {
        result.security_reason = `No parseable on-disk security target: ${file}`;
        break;
      }
      const scan = await scanSecurity(ctx.projectRoot, ctx.graph, { target: file, graphAware: true });
      if (!scan || !Array.isArray(scan.findings) || scan.filesScanned === 0) {
        result.security_reason = `Security scan unavailable for ${file}`; break;
      }
      for (const f of scan.findings) findings.push({ severity: f.severity || 'low', description: f.description || f.title || '', file: canonicalPath(f.file || file, ctx.projectRoot), line: typeof f.line === 'number' && Number.isInteger(f.line) && f.line >= 0 ? f.line : 0 });
      if (file === paths.at(-1)) { result.security_findings = findings; result.security_status = 'computed'; result.security_reason = null; }
    }
  } catch (error) {
    result.security_findings = null; result.security_status = 'error'; result.security_reason = failureReason('security scan', error);
  }
  if (result.health_status !== 'computed') result.warnings.push(`Health ${result.health_status}: ${result.health_reason}`);
  if (result.security_status !== 'computed') result.warnings.push(`Security ${result.security_status}: ${result.security_reason}`);
  return finish(result);
}
