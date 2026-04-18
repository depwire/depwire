import type { Graph } from "graphology";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { DeadSymbol, ExclusionContext, ExclusionStats } from "./types.js";

export function findDeadSymbols(
  graph: Graph,
  projectRoot: string,
  includeTests = false,
  debug = false
): { symbols: DeadSymbol[]; stats: ExclusionStats } {
  const deadSymbols: DeadSymbol[] = [];
  const context: ExclusionContext = { graph, projectRoot };
  
  const stats: ExclusionStats = {
    total: 0,
    excludedByTestFile: 0,
    excludedByEntryPoint: 0,
    excludedByConfigFile: 0,
    excludedByTypeDeclaration: 0,
    excludedByDefaultExport: 0,
    excludedByFrameworkDir: 0,
  };

  const packageEntryPoints = getPackageEntryPoints(projectRoot);

  if (debug) {
    console.log("\n🔍 Debug: Graph Structure");
    console.log(`Total nodes in graph: ${graph.order}`);
    console.log(`Total edges in graph: ${graph.size}`);
    
    let nodesWithZeroInDegree = 0;
    let nodesWithZeroOutDegree = 0;
    
    graph.forEachNode((node) => {
      if (graph.inDegree(node) === 0) nodesWithZeroInDegree++;
      if (graph.outDegree(node) === 0) nodesWithZeroOutDegree++;
    });
    
    console.log(`Nodes with inDegree=0: ${nodesWithZeroInDegree}`);
    console.log(`Nodes with outDegree=0: ${nodesWithZeroOutDegree}`);
    
    if (nodesWithZeroInDegree <= 10) {
      console.log("\nSample nodes with inDegree=0:");
      let count = 0;
      graph.forEachNode((node) => {
        if (graph.inDegree(node) === 0 && count < 10) {
          const attrs = graph.getNodeAttributes(node);
          const filePath = attrs.file || attrs.filePath || "unknown";
          console.log(`  - ${attrs.name} (${attrs.kind}) in ${path.relative(projectRoot, filePath)}`);
          count++;
        }
      });
    }
  }

  for (const node of graph.nodes()) {
    const attrs = graph.getNodeAttributes(node);

    if (!attrs.name) continue;
    
    if (!attrs.file && !attrs.filePath) {
      if (debug) {
        console.log(`Skipping node ${attrs.name} - no file attribute`);
      }
      continue;
    }
    
    const filePath = attrs.file || attrs.filePath;
    
    if (!isRelevantForDeadCodeDetection(attrs)) {
      continue;
    }

    const inDegree = graph.inDegree(node);

    if (inDegree === 0) {
      stats.total++;
      
      const exclusionReason = shouldExclude(attrs, context, includeTests, packageEntryPoints);
      
      if (exclusionReason) {
        switch (exclusionReason) {
          case "test": stats.excludedByTestFile++; break;
          case "entry": stats.excludedByEntryPoint++; break;
          case "config": stats.excludedByConfigFile++; break;
          case "types": stats.excludedByTypeDeclaration++; break;
          case "default": stats.excludedByDefaultExport++; break;
          case "framework": stats.excludedByFrameworkDir++; break;
        }
        continue;
      }

      deadSymbols.push({
        name: attrs.name,
        kind: attrs.kind || "unknown",
        file: filePath,
        line: attrs.startLine || 0,
        exported: attrs.exported || false,
        dependents: 0,
        confidence: "high",
        reason: "Zero dependents",
      });
    }
  }

  if (debug) {
    console.log("\n🔍 Debug: Exclusion Statistics");
    console.log(`Total symbols with 0 incoming edges: ${stats.total}`);
    console.log(`Excluded by test file: ${stats.excludedByTestFile}`);
    console.log(`Excluded by entry point: ${stats.excludedByEntryPoint}`);
    console.log(`Excluded by config file: ${stats.excludedByConfigFile}`);
    console.log(`Excluded by type declaration: ${stats.excludedByTypeDeclaration}`);
    console.log(`Excluded by default export: ${stats.excludedByDefaultExport}`);
    console.log(`Excluded by framework dir: ${stats.excludedByFrameworkDir}`);
    console.log(`Remaining dead symbols: ${deadSymbols.length}\n`);
  }

  return { symbols: deadSymbols, stats };
}

function isRelevantForDeadCodeDetection(attrs: any): boolean {
  const kind = attrs.kind;
  
  const relevantKinds = [
    "function",
    "class",
    "interface",
    "type",
    "type_alias",
    "enum",
    "const",
    "constant",
    "let",
    "var",
    "method",
    "property"
  ];
  
  if (!relevantKinds.includes(kind)) {
    return false;
  }
  
  if (kind === "const" || kind === "let" || kind === "var" || kind === "variable") {
    return attrs.exported === true;
  }
  
  return true;
}

function getPackageEntryPoints(projectRoot: string): Set<string> {
  const entryPoints = new Set<string>();
  const resolvedRoot = path.resolve(projectRoot);
  const packageJsonPath = path.resolve(resolvedRoot, "package.json");
  
  if (!packageJsonPath.startsWith(resolvedRoot) || !existsSync(packageJsonPath)) {
    return entryPoints;
  }
  
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    
    if (packageJson.main) {
      entryPoints.add(path.resolve(projectRoot, packageJson.main));
    }
    
    if (packageJson.module) {
      entryPoints.add(path.resolve(projectRoot, packageJson.module));
    }
    
    if (packageJson.exports) {
      const addExports = (exp: any) => {
        if (typeof exp === "string") {
          entryPoints.add(path.resolve(projectRoot, exp));
        } else if (typeof exp === "object") {
          for (const key in exp) {
            if (typeof exp[key] === "string") {
              entryPoints.add(path.resolve(projectRoot, exp[key]));
            } else if (typeof exp[key] === "object") {
              addExports(exp[key]);
            }
          }
        }
      };
      addExports(packageJson.exports);
    }
  } catch (e) {
  }
  
  return entryPoints;
}

function shouldExclude(
  attrs: any,
  context: ExclusionContext,
  includeTests: boolean,
  packageEntryPoints: Set<string>
): string | null {
  const filePath = attrs.file || attrs.filePath;
  
  if (!filePath) {
    return null;
  }
  
  const relativePath = path.relative(context.projectRoot, filePath);

  if (!includeTests && isTestFile(relativePath)) {
    return "test";
  }

  if (isRealPackageEntryPoint(filePath, packageEntryPoints)) {
    return "entry";
  }

  if (isConfigFile(relativePath)) {
    return "config";
  }

  if (isTypeDeclarationFile(relativePath)) {
    return "types";
  }

  if (attrs.kind === "default") {
    return "default";
  }

  if (isFrameworkAutoLoadedFile(relativePath)) {
    return "framework";
  }

  // C++ specific exclusions
  if (isCppExcluded(attrs)) {
    return "framework";
  }

  // Kotlin specific exclusions
  if (isKotlinExcluded(attrs)) {
    return "framework";
  }

  // PHP specific exclusions
  if (isPhpExcluded(attrs)) {
    return "framework";
  }

  return null;
}

function isRealPackageEntryPoint(filePath: string, packageEntryPoints: Set<string>): boolean {
  const normalizedPath = path.normalize(filePath);
  
  for (const entryPoint of packageEntryPoints) {
    const normalizedEntry = path.normalize(entryPoint);
    if (normalizedPath === normalizedEntry || 
        normalizedPath === normalizedEntry.replace(/\.(js|ts)$/, ".ts") ||
        normalizedPath === normalizedEntry.replace(/\.(js|ts)$/, ".js")) {
      return true;
    }
  }
  
  return false;
}

function isTestFile(filePath: string): boolean {
  return (
    filePath.includes("__tests__/") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.") ||
    filePath.includes("/test/") ||
    filePath.includes("/tests/")
  );
}

function isConfigFile(filePath: string): boolean {
  return (
    filePath.includes(".config.") ||
    filePath.includes("config/") ||
    filePath.includes("vite.config") ||
    filePath.includes("rollup.config") ||
    filePath.includes("webpack.config")
  );
}

function isTypeDeclarationFile(filePath: string): boolean {
  return filePath.endsWith(".d.ts");
}

function isFrameworkAutoLoadedFile(filePath: string): boolean {
  return (
    filePath.includes("/pages/") ||
    filePath.includes("/routes/") ||
    filePath.includes("/middleware/") ||
    filePath.includes("/commands/") ||
    filePath.includes("/api/") ||
    filePath.includes("/app/") ||
    filePath.includes("/Controllers/") ||
    filePath.includes("/Hubs/") ||
    filePath.includes("/Migrations/") ||
    // Java / Spring / Jakarta
    filePath.includes("/controller/") ||
    filePath.includes("/controllers/") ||
    filePath.includes("/service/") ||
    filePath.includes("/repository/") ||
    filePath.includes("/config/") ||
    filePath.includes("/configuration/")
  );
}

/**
 * C++ specific dead code exclusions
 */
function isCppExcluded(attrs: any): boolean {
  const filePath = attrs.file || attrs.filePath || '';
  const name = attrs.name || '';
  const kind = attrs.kind || '';

  // Header files may be used by external consumers
  if (/\.(?:h|hpp|hh|hxx|h\+\+|inl|ipp)$/.test(filePath)) {
    return true;
  }

  // main() is always an entry point
  if (name === 'main') return true;

  // Operator overloads may be called implicitly
  if (name.startsWith('operator')) return true;

  // Destructors are called implicitly
  if (name.startsWith('~')) return true;

  // Virtual functions may be called via vtable
  // (We check the source text for 'virtual' keyword — heuristic)

  // [[nodiscard]] functions are intentionally exported
  // (checked via source text in caller)

  // Macros and constants in headers are meant to be consumed
  if (kind === 'constant' && /\.(?:h|hpp)$/.test(filePath)) return true;

  return false;
}

/**
 * Kotlin specific dead code exclusions
 */
function isKotlinExcluded(attrs: any): boolean {
  const filePath = attrs.file || attrs.filePath || '';
  const name = attrs.name || '';

  // Only apply to Kotlin files
  if (!filePath.endsWith('.kt') && !filePath.endsWith('.kts')) return false;

  // main() is always an entry point
  if (name === 'main') return true;

  // Override functions are called polymorphically
  // (Heuristic — the name itself isn't enough, but we err on the side of exclusion)

  // Android lifecycle functions
  const androidLifecycle = ['onCreate', 'onStart', 'onResume', 'onPause', 'onStop', 'onDestroy',
    'onCreateView', 'onViewCreated', 'onDestroyView', 'onSaveInstanceState', 'onRestoreInstanceState',
    'onActivityResult', 'onRequestPermissionsResult', 'onConfigurationChanged', 'onNewIntent'];
  if (androidLifecycle.includes(name)) return true;

  // Serialization functions
  if (['readObject', 'writeObject', 'readResolve', 'writeReplace'].includes(name)) return true;

  // Operator overloads (operator fun)
  if (name.startsWith('operator')) return true;

  return false;
}

/**
 * PHP specific dead code exclusions
 */
function isPhpExcluded(attrs: any): boolean {
  const filePath = attrs.file || attrs.filePath || '';
  const name = attrs.name || '';

  if (!filePath.endsWith('.php')) return false;

  const magicMethods = [
    '__construct', '__destruct', '__call', '__callStatic',
    '__get', '__set', '__isset', '__unset',
    '__sleep', '__wakeup', '__serialize', '__unserialize',
    '__toString', '__invoke', '__set_state', '__clone', '__debugInfo',
  ];
  if (magicMethods.includes(name)) return true;

  const wpHooks = ['init', 'admin_init', 'wp_enqueue_scripts', 'admin_enqueue_scripts',
    'widgets_init', 'register_activation_hook', 'register_deactivation_hook',
    'add_action', 'add_filter', 'activate', 'deactivate'];
  if (wpHooks.includes(name)) return true;

  const laravelMethods = ['register', 'boot', 'handle', 'authorize',
    'rules', 'messages', 'prepareForValidation', 'failed',
    'broadcastOn', 'broadcastAs', 'broadcastWith'];
  if (laravelMethods.includes(name)) return true;

  const symfonyMethods = ['__invoke', 'getSubscribedEvents', 'getSubscribedServices',
    'configureOptions', 'buildForm', 'load', 'getConfigTreeBuilder'];
  if (symfonyMethods.includes(name)) return true;

  if (name.startsWith('test') || name === 'setUp' || name === 'tearDown' ||
    name === 'setUpBeforeClass' || name === 'tearDownAfterClass') return true;

  return false;
}
