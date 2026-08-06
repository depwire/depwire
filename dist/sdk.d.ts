import { DirectedGraph } from 'graphology';

type SymbolKind = 'function' | 'class' | 'variable' | 'constant' | 'type_alias' | 'interface' | 'enum' | 'import' | 'export' | 'method' | 'property' | 'decorator' | 'module' | 'template';
interface SymbolNode {
    id: string;
    name: string;
    kind: SymbolKind;
    filePath: string;
    startLine: number;
    endLine: number;
    exported: boolean;
    scope?: string;
    metadata?: Record<string, unknown>;
}
type EdgeKind = 'imports' | 'calls' | 'extends' | 'implements' | 'inherits' | 'decorates' | 'references' | 'type_references' | 'injects' | 'uses';
interface SymbolEdge {
    source: string;
    target: string;
    kind: EdgeKind;
    filePath: string;
    line: number;
}
interface ParsedFile {
    filePath: string;
    symbols: SymbolNode[];
    edges: SymbolEdge[];
}

/**
 * SECURITY: Parsing is READ-ONLY with respect to your source code.
 * Depwire never modifies or deletes any of your source files.
 * The only writes are: os.tmpdir() for cloned repos, and a local, git-ignored
 * parse cache at {projectRoot}/.depwire/cache.db used to skip re-parsing
 * unchanged files. The cache contains only derived data and is safe to delete;
 * disable it with parseProject(root, { useCache: false }).
 */

declare function parseProject(projectRoot: string, options?: {
    exclude?: string[];
    verbose?: boolean;
    useCache?: boolean;
}): Promise<ParsedFile[]>;

/**
 * SQLite-backed parse cache.
 *
 * Stores each ParsedFile as JSON keyed by its project-relative path, alongside
 * the file's mtime, size and a content hash. On a subsequent parse of the same
 * project, unchanged files are restored from cache instead of being re-parsed.
 *
 * The cache lives at {projectRoot}/.depwire/cache.db (git-ignored). It contains
 * only derived data — deleting it is always safe and simply forces a cold parse.
 *
 * Cache validity (per file, independent of every other file):
 *   - miss  : no cached row
 *   - miss  : current size  !== cached size
 *   - hit   : current mtime === cached mtime            (fast path)
 *   - hit   : mtime differs but content hash matches     (secondary check)
 *   - miss  : mtime differs and content hash differs
 */

/** Cache statistics: number of cached files and the on-disk db size in bytes. */
declare function getCacheStats(db: any): {
    totalFiles: number;
    cacheSize: number;
};
/**
 * Delete the cache database for a project, including WAL/SHM sidecar files.
 * Safe to call when no cache exists.
 */
declare function clearCache(projectRoot: string): void;

declare function buildGraph(parsedFiles: ParsedFile[], projectRoot?: string): DirectedGraph;

/**
 * Health Score Type Definitions
 */
interface HealthDimension {
    name: string;
    score: number;
    weight: number;
    grade: string;
    details: string;
    metrics: Record<string, number | string>;
}
interface HealthReport {
    status: 'scored' | 'no_parseable_files';
    overall: number;
    grade: string;
    dimensions: HealthDimension[];
    summary: string;
    recommendations: string[];
    projectStats: {
        files: number;
        symbols: number;
        edges: number;
        languages: Record<string, number>;
    };
    timestamp: string;
    message?: string;
    supportedExtensions?: string[];
}

/**
 * Calculate the overall health score for a project
 */
declare function calculateHealthScore(graph: DirectedGraph, projectRoot: string): HealthReport;

type ConfidenceLevel = "high" | "medium" | "low";
interface DeadSymbol {
    name: string;
    kind: string;
    file: string;
    line: number;
    exported: boolean;
    dependents: number;
    confidence: ConfidenceLevel;
    reason: string;
}
interface DeadCodeReport {
    totalSymbols: number;
    deadSymbols: number;
    deadPercentage: number;
    byConfidence: {
        high: number;
        medium: number;
        low: number;
    };
    symbols: DeadSymbol[];
}
interface DeadCodeOptions {
    confidence: ConfidenceLevel;
    includeTests: boolean;
    verbose: boolean;
    stats: boolean;
    json: boolean;
    debug: boolean;
}

declare function analyzeDeadCode(graph: DirectedGraph, projectRoot: string, options?: Partial<DeadCodeOptions>): DeadCodeReport;

interface GeneratorOptions {
    outputDir: string;
    format: 'markdown' | 'json';
    include: string[];
    update: boolean;
    only?: string[];
    verbose: boolean;
    stats: boolean;
}
interface GenerationResult {
    success: boolean;
    generated: string[];
    errors: string[];
    stats?: {
        totalTime: number;
        filesGenerated: number;
    };
}
/**
 * Main documentation generator
 */
declare function generateDocs(graph: DirectedGraph, projectRoot: string, version: string, parseTime: number, options: GeneratorOptions): Promise<GenerationResult>;

declare function getImpact(graph: DirectedGraph, symbolId: string): {
    directDependents: SymbolNode[];
    transitiveDependents: SymbolNode[];
    affectedFiles: string[];
};
declare function searchSymbols(graph: DirectedGraph, query: string): SymbolNode[];
declare function getArchitectureSummary(graph: DirectedGraph, projectRoot?: string, includeFixtures?: boolean): {
    fileCount: number;
    symbolCount: number;
    edgeCount: number;
    mostConnectedFiles: {
        filePath: string;
        connections: number;
    }[];
    orphanFiles: string[];
};

type SimulationAction = {
    type: 'move';
    target: string;
    destination: string;
} | {
    type: 'delete';
    target: string;
} | {
    type: 'rename';
    target: string;
    newName: string;
} | {
    type: 'split';
    target: string;
    newFile: string;
    symbols: string[];
} | {
    type: 'merge';
    target: string;
    source: string;
};
interface SimulationResult {
    action: SimulationAction;
    originalGraph: GraphSnapshot;
    simulatedGraph: GraphSnapshot;
    diff: GraphDiff;
    healthDelta: HealthDelta;
    /** The cloned graph with the simulation applied — available for viz data generation */
    simulatedGraphInstance?: DirectedGraph;
}
interface GraphSnapshot {
    nodeCount: number;
    edgeCount: number;
    healthScore: number;
}
interface GraphDiff {
    addedEdges: EdgeInfo[];
    removedEdges: EdgeInfo[];
    affectedNodes: string[];
    brokenImports: BrokenImport[];
    circularDepsIntroduced: string[][];
    circularDepsResolved: string[][];
}
interface HealthDelta {
    before: number;
    after: number;
    delta: number;
    improved: boolean;
    dimensionChanges: DimensionChange[];
}
interface DimensionChange {
    name: string;
    before: number;
    after: number;
    delta: number;
}
interface BrokenImport {
    file: string;
    importedSymbol: string;
    reason: string;
}
interface EdgeInfo {
    source: string;
    target: string;
    kind?: string;
}
declare class SimulationEngine {
    private readonly original;
    constructor(graph: DirectedGraph);
    simulate(action: SimulationAction): SimulationResult;
    private applyMove;
    private applyDelete;
    private applyRename;
    private applySplit;
    private applyMerge;
    private computeDiff;
    private collectEdges;
    private edgeKey;
    private detectCycles;
    private computeHealthScore;
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type VulnerabilityClass = 'dependency-cve' | 'shell-injection' | 'code-injection' | 'secrets' | 'path-traversal' | 'auth' | 'input-validation' | 'information-disclosure' | 'architecture' | 'cryptography' | 'supply-chain' | 'frontend-xss';
interface SecurityFinding {
    id: string;
    severity: Severity;
    vulnerabilityClass: VulnerabilityClass;
    file: string;
    line?: number;
    symbol?: string;
    title: string;
    description: string;
    attackScenario: string;
    suggestedFix: string;
    graphReachability?: {
        entryPoints: string[];
        reachableFrom: number;
        elevatedBy: string;
    };
}
interface SecurityScanResult {
    scannedAt: string;
    projectRoot: string;
    filesScanned: number;
    findings: SecurityFinding[];
    summary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
        total: number;
    };
    dependencyAudit: {
        ran: boolean;
        packageManager: string | null;
        rawOutput: string;
    };
}
interface SecurityScanOptions {
    target?: string;
    classes?: VulnerabilityClass[];
    format?: 'table' | 'json' | 'sarif';
    failOn?: Severity;
    graphAware?: boolean;
}

declare function scanSecurity(projectRoot: string, graph: DirectedGraph, options?: SecurityScanOptions): Promise<SecurityScanResult>;

type CrossLanguageEdgeType = 'rest-api' | 'subprocess';
interface CrossLanguageEdge {
    sourceFile: string;
    targetFile: string;
    edgeType: CrossLanguageEdgeType;
    confidence: 'high' | 'medium' | 'low';
    sourceLanguage: string;
    targetLanguage: string;
    sourceLine?: number;
    targetLine?: number;
    metadata: {
        httpMethod?: string;
        path?: string;
        command?: string;
        calledFile?: string;
    };
}
interface CrossLanguageDetectionResult {
    edges: CrossLanguageEdge[];
    stats: {
        restApiEdges: number;
        subprocessEdges: number;
        filesAnalyzed: number;
        detectionTimeMs: number;
    };
}

declare function detectCrossLanguageEdges(files: ParsedFile[], projectRoot: string, graph: DirectedGraph): CrossLanguageDetectionResult;

/**
 * depwire-cli SDK — Public API Surface
 *
 * This is the ONLY file the cloud (Railway parser) should import from.
 * Never import from internal paths like depwire-cli/dist/graph/index.js.
 *
 * Rule: if the cloud needs something not exported here, add it here —
 * do not reach into internal paths.
 */
/** Current SDK version — matches depwire-cli npm version */
declare const DepwireSDKVersion: string;

export { type BrokenImport, type CrossLanguageDetectionResult, type CrossLanguageEdge, DepwireSDKVersion, type GraphDiff, type HealthDelta, type SecurityFinding, type SecurityScanOptions, type SecurityScanResult, type Severity, type SimulationAction, SimulationEngine, type SimulationResult, type VulnerabilityClass, analyzeDeadCode, buildGraph, calculateHealthScore, clearCache, detectCrossLanguageEdges, generateDocs, getArchitectureSummary, getCacheStats, getImpact, parseProject, scanSecurity, searchSymbols };
