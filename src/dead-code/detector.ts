import type { Graph } from "graphology";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { DeadSymbol, ExclusionContext, ExclusionStats } from "./types.js";
import { isExcludedFromOrphanReporting } from "../core/exclusions.js";

export function findDeadSymbols(
  graph: Graph,
  projectRoot: string,
  includeTests = false,
  debug = false,
  includeFixtures = false
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
      
      const exclusionReason = shouldExclude(attrs, context, includeTests, packageEntryPoints, includeFixtures);
      
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
  packageEntryPoints: Set<string>,
  includeFixtures = false
): string | null {
  const filePath = attrs.file || attrs.filePath;
  
  if (!filePath) {
    return null;
  }
  
  const relativePath = path.relative(context.projectRoot, filePath);

  if (!includeTests && isTestFile(relativePath)) {
    return "test";
  }

  if (isExcludedFromOrphanReporting(relativePath, { includeFixtures })) {
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

  // Swift specific exclusions
  if (isSwiftExcluded(attrs)) {
    return "framework";
  }

  // Mojo specific exclusions
  if (isMojoExcluded(attrs)) {
    return "framework";
  }

  // Ruby specific exclusions
  if (isRubyExcluded(attrs)) {
    return "framework";
  }

  // Dart specific exclusions
  if (isDartExcluded(attrs)) {
    return "framework";
  }

  // R specific exclusions
  if (isRExcluded(attrs)) {
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

/**
 * Swift specific dead code exclusions
 */
function isSwiftExcluded(attrs: any): boolean {
  const filePath = attrs.file || attrs.filePath || '';
  const name = attrs.name || '';

  if (!filePath.endsWith('.swift')) return false;

  // @main entry points
  if (name === 'main') return true;

  // AppDelegate / SceneDelegate lifecycle methods
  const appLifecycle = [
    'application', 'applicationDidFinishLaunching', 'applicationWillTerminate',
    'applicationDidBecomeActive', 'applicationWillResignActive',
    'applicationDidEnterBackground', 'applicationWillEnterForeground',
    'scene', 'sceneDidDisconnect', 'sceneDidBecomeActive',
    'sceneWillResignActive', 'sceneWillEnterForeground', 'sceneDidEnterBackground',
  ];
  if (appLifecycle.includes(name)) return true;

  // SwiftUI View body property and PreviewProvider
  if (name === 'body' || name === 'previews') return true;

  // Protocol conformance methods (common required methods)
  const protocolMethods = [
    'hash', 'encode', 'init', 'deinit',
    'tableView', 'collectionView', 'numberOfSections', 'numberOfRowsInSection',
    'cellForRowAt', 'didSelectRowAt',
  ];
  if (protocolMethods.includes(name)) return true;

  // @IBAction / @IBOutlet are called from Interface Builder
  // @objc methods are called from Objective-C runtime

  // Codable auto-synthesis
  if (['encode', 'decode', 'init(from:)'].includes(name)) return true;

  // XCTestCase test methods
  if (name.startsWith('test') || name === 'setUp' || name === 'tearDown' ||
    name === 'setUpWithError' || name === 'tearDownWithError') return true;

  return false;
}

/**
 * Mojo specific dead code exclusions
 */
function isMojoExcluded(attrs: any): boolean {
  const filePath = attrs.file || attrs.filePath || '';
  const name = attrs.name || '';

  if (!filePath.endsWith('.mojo') && !filePath.endsWith('.🔥')) return false;

  // @value structs have auto-generated methods
  // @export decorated functions are exported to C ABI
  // These are detected by name patterns since we can't inspect decorators from the graph

  // Lifecycle methods (required by value semantics)
  const lifecycleMethods = [
    '__init__', '__copyinit__', '__moveinit__', '__del__',
    '__enter__', '__exit__',
  ];
  if (lifecycleMethods.includes(name)) return true;

  // Trait implementations (required by trait conformance)
  const traitMethods = [
    '__str__', '__repr__', '__len__', '__getitem__', '__setitem__',
    '__eq__', '__ne__', '__lt__', '__le__', '__gt__', '__ge__',
    '__add__', '__sub__', '__mul__', '__truediv__', '__floordiv__',
    '__hash__', '__bool__', '__int__', '__float__',
    '__iter__', '__next__', '__contains__',
  ];
  if (traitMethods.includes(name)) return true;

  // MLIR dialect operations (low-level Mojo internals)
  if (name.startsWith('__mlir_') || name.startsWith('_mlir_')) return true;

  // main is always an entry point
  if (name === 'main') return true;

  return false;
}

/**
 * Ruby specific dead code exclusions
 */
function isRubyExcluded(attrs: any): boolean {
  const filePath = attrs.file || attrs.filePath || '';
  const name = attrs.name || '';

  if (!filePath.endsWith('.rb') && !filePath.endsWith('.rake') && !filePath.endsWith('.gemspec')) return false;

  // Rails controller callbacks
  const railsCallbacks = [
    'before_action', 'after_action', 'around_action',
    'before_filter', 'after_filter', 'around_filter',
  ];
  if (railsCallbacks.includes(name)) return true;

  // ActiveRecord lifecycle callbacks
  const arCallbacks = [
    'before_save', 'after_save', 'before_create', 'after_create',
    'before_update', 'after_update', 'before_destroy', 'after_destroy',
    'before_validation', 'after_validation',
    'after_commit', 'after_rollback', 'after_initialize', 'after_find',
  ];
  if (arCallbacks.includes(name)) return true;

  // Rake task definitions
  if (filePath.endsWith('.rake') || name === 'task') return true;

  // RSpec/Minitest methods
  if (['it', 'describe', 'context', 'specify', 'subject', 'let', 'let!', 'before', 'after'].includes(name)) return true;
  if (name.startsWith('test_')) return true;

  // Rails concerns (included do blocks)
  if (name === 'included' || name === 'class_methods') return true;

  // initialize is always called implicitly
  if (name === 'initialize') return true;

  // Dynamic dispatch methods
  if (name === 'method_missing' || name === 'respond_to_missing?') return true;

  // ActiveSupport::Concern blocks
  if (name === 'concern' || name === 'concerning') return true;

  // Pundit policy methods
  const policyMethods = ['index?', 'show?', 'create?', 'new?', 'update?', 'edit?', 'destroy?'];
  if (policyMethods.includes(name)) return true;

  // Devise strategy methods
  const deviseMethods = ['authenticate!', 'valid?', 'authenticate_user!', 'current_user'];
  if (deviseMethods.includes(name)) return true;

  // Rails entry points
  if (name === 'main') return true;

  return false;
}

/**
 * Dart/Flutter specific dead code exclusions
 */
function isDartExcluded(attrs: any): boolean {
  const filePath = attrs.file || attrs.filePath || '';
  const name = attrs.name || '';

  if (!filePath.endsWith('.dart')) return false;

  // main() is always an entry point
  if (name === 'main') return true;

  // Flutter widget lifecycle methods
  const widgetLifecycle = [
    'initState', 'dispose', 'build', 'didChangeDependencies', 'didUpdateWidget',
    'deactivate', 'reassemble', 'setState', 'createState',
  ];
  if (widgetLifecycle.includes(name)) return true;

  // Object override methods
  if (['toString', 'hashCode', 'operator==', 'noSuchMethod'].includes(name)) return true;

  // Serialization methods
  if (['fromJson', 'toJson', 'fromMap', 'toMap', 'copyWith'].includes(name)) return true;

  // Test methods
  if (['test', 'testWidgets', 'group', 'setUp', 'tearDown', 'setUpAll', 'tearDownAll'].includes(name)) return true;

  // Riverpod providers
  const riverpodPatterns = ['Provider', 'StateProvider', 'FutureProvider', 'StreamProvider',
    'StateNotifierProvider', 'ChangeNotifierProvider', 'NotifierProvider', 'AsyncNotifierProvider'];
  if (riverpodPatterns.some(p => name.includes(p))) return true;

  // Bloc/Cubit event handlers (mapEventToState, on<Event>)
  if (name.startsWith('mapEventToState') || name.startsWith('on')) return true;

  // GetX controllers and bindings
  if (['onInit', 'onReady', 'onClose', 'dependencies'].includes(name)) return true;

  // @override annotated methods commonly called by framework
  const frameworkMethods = ['paint', 'shouldRepaint', 'shouldRebuild', 'performLayout',
    'hitTest', 'debugFillProperties', 'toDiagnosticsNode'];
  if (frameworkMethods.includes(name)) return true;

  return false;
}

/**
 * R specific dead code exclusions
 */
function isRExcluded(attrs: any): boolean {
  const filePath = attrs.file || attrs.filePath || '';
  const name = attrs.name || '';

  // Only apply to R files
  const isRFile = filePath.endsWith('.R') || filePath.endsWith('.r') || filePath.endsWith('.Rmd') || filePath.endsWith('.rmd');
  if (!isRFile) return false;

  // Shiny app entry points
  if (['ui', 'server', 'shinyApp', 'shinyUI', 'shinyServer', 'runApp'].includes(name)) return true;

  // plumber entry point
  if (name === 'pr' || name === 'plumber') return true;

  // R6 class lifecycle methods
  if (['initialize', 'finalize', 'print', 'clone', 'format'].includes(name)) return true;

  // S3 generic dispatch methods (any function with .classname suffix)
  if (name.includes('.') && !name.startsWith('.')) {
    const parts = name.split('.');
    if (parts.length >= 2 && parts[0].length > 0) return true;
  }

  // S4 method definitions registered via setMethod()
  if (name.startsWith('setMethod') || name.startsWith('setGeneric') || name.startsWith('setClass')) return true;

  // testthat test files
  if (filePath.includes('tests/testthat/') || filePath.includes('tests\\testthat\\')) return true;

  // testthat methods
  if (['test_that', 'describe', 'it', 'context', 'setup', 'teardown'].includes(name)) return true;
  if (name.startsWith('expect_')) return true;

  // R Markdown setup chunks
  if (name === 'setup' && filePath.endsWith('.Rmd')) return true;

  // Package hooks
  if (['.onLoad', '.onAttach', '.onUnload', '.onDetach', '.First', '.Last'].includes(name)) return true;

  // Operator overloading methods
  const operatorPrefixes = ['+.', '-.', '*.', '/.', '^.', '==.', '<.', '>.', '&.', '|.', '!.', '[.', '[[.', '$.'];
  if (operatorPrefixes.some(op => name.startsWith(op))) return true;

  return false;
}
